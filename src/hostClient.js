// Host client loader: runs on every root page before the app bundle.
//
// Order matters: webav.js (host-agnostic AudioCapture/CameraPickerDialog)
// loads first, then the host-specific client:
//   - Electron (window.scratchjr from preload): electronClient.js
//   - Android WebView (AndroidInterface): webhost.js (JS host shim; the
//     native interface covers storage/DB, the shim adds camera/record)
//   - Browser / PWA: browserClient.js (in-browser sql.js WASM + IndexedDB)

(function () {
    /** @param {string} src */
    function load(src) {
        var el = document.createElement('script');
        el.src = src;
        el.async = false;
        document.head.appendChild(el);
    }

    load('../webav.js');

    var isTauri = Boolean(
        (typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__))
        || (typeof window !== 'undefined' && window.location
            && (window.location.hostname === 'tauri.localhost'
                || window.location.protocol === 'tauri:'
                || (window.location.origin && window.location.origin.indexOf('tauri.localhost') !== -1)))
    );
    // STBlock embeds ScratchJr in an iframe. A PWA worker scoped to that
    // embedded path can keep an app.bundle.js from one build while its hashed
    // chunks have already been replaced by another build.
    var isEmbedded = typeof window !== 'undefined' && window.parent !== window;
    // The host changes stblockFrame when it recovers a stale editor iframe.
    // Carry that revision onto app.bundle.js itself so an old HTML document or
    // service-worker response cannot keep reusing a cached bundle that imports
    // chunk hashes from a previous build.
    if (isEmbedded) {
        var frameRevision = null;
        try {
            var currentPageUrl = new URL(window.location.href);
            frameRevision = currentPageUrl.searchParams.get('stblockFrame')
                || window.sessionStorage.getItem('stblockKidsFrameRevision');
            if (frameRevision) window.sessionStorage.setItem('stblockKidsFrameRevision', frameRevision);
        } catch (_error) {
            // Keep the normal renderer revision if storage or URL parsing is unavailable.
        }
        if (frameRevision) {
            var appModule = document.querySelector('script[type="module"][src*="app.bundle.js"]');
            if (appModule) {
                try {
                    var appModuleUrl = new URL(appModule.src, window.location.href);
                    appModuleUrl.searchParams.set('stblockFrame', frameRevision);
                    appModule.src = appModuleUrl.toString();
                    console.info('[ScratchJr] embedded bundle URL', appModule.src);
                } catch (_error) {
                    // Leave the original module URL intact if it cannot be rewritten.
                }
            }
        }
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        if (isTauri || isEmbedded) {
            var resetFlag = typeof window !== 'undefined' && /(?:^|&)stblockSwReset=1(?:&|$)/.test(window.location.search.slice(1));
            var reloadEmbeddedFrame = isEmbedded && !isTauri && Boolean(navigator.serviceWorker.controller) && !resetFlag;
            var removeRegistrations = navigator.serviceWorker.getRegistrations().then(function (registrations) {
                return Promise.all(registrations.map(function (registration) { return registration.unregister(); }));
            }).catch(function () {});
            var clearPwaCaches = isEmbedded && typeof caches !== 'undefined' ? caches.keys().then(function (cacheNames) {
                return Promise.all(cacheNames
                    .filter(function (name) { return name.indexOf('scratchjr-pwa-') === 0; })
                    .map(function (name) { return caches.delete(name); }));
            }).catch(function () {}) : Promise.resolve();
            if (reloadEmbeddedFrame) {
                Promise.all([removeRegistrations, clearPwaCaches]).then(function () {
                    var cleanUrl = new URL(window.location.href);
                    cleanUrl.searchParams.set('stblockSwReset', '1');
                    window.location.replace(cleanUrl.toString());
                });
            }
        } else if (!window.scratchjr && typeof AndroidInterface === 'undefined'
            && window.location && window.location.protocol.startsWith('http')) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('./sw.js').catch(function () {});
            });
        }
    }

    // Recover once when an already-open embedded editor still requests a
    // content-hashed chunk removed by a newer build. Reload it from the
    // current HTML/app bundle after clearing any stale PWA cache.
    if (isEmbedded && !isTauri && typeof window !== 'undefined') {
        var currentUrl = new URL(window.location.href);
        var chunkRetryUsed = currentUrl.searchParams.get('stblockChunkRetry') === '1';
        var chunkRecoveryStarted = false;
        var recoverFromStaleChunk = function (detail) {
            if (chunkRetryUsed || chunkRecoveryStarted || !/chunk-[A-Z0-9]+\.js/i.test(String(detail || ''))) return;
            chunkRecoveryStarted = true;
            console.warn('[ScratchJr] stale chunk reference detected; refreshing the embedded editor once.');
            currentUrl.searchParams.set('stblockSwReset', '1');
            currentUrl.searchParams.set('stblockChunkRetry', '1');
            var cleanup = Promise.all([
                typeof removeRegistrations !== 'undefined' && removeRegistrations ? removeRegistrations : Promise.resolve(),
                typeof clearPwaCaches !== 'undefined' && clearPwaCaches ? clearPwaCaches : Promise.resolve()
            ]);
            cleanup.then(function () { window.location.replace(currentUrl.toString()); });
        };
        window.addEventListener('error', function (event) {
            var target = event.target;
            var targetUrl = target && (target.src || target.href);
            recoverFromStaleChunk([event.message, event.filename, targetUrl].join(' '));
        }, true);
        window.addEventListener('unhandledrejection', function (event) {
            var reason = event.reason;
            recoverFromStaleChunk(reason && (reason.message || reason.stack) || reason);
        });
    }

    if (window.scratchjr) {
        load('../electronClient.js');
    } else if (isTauri) {
        load('../tauriClient.js');
    } else if (typeof AndroidInterface !== 'undefined') {
        load('../webhost.js');
    } else {
        load('../sql-wasm.js');
        load('../browserClient.js');
    }
}());

