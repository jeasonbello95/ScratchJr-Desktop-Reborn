/**
 * ScratchJr Web & PWA Distribution Builder (scripts/build-web.js)
 *
 * Compiles the TypeScript bundle and packages a self-contained static
 * distribution into dist-web/ ready for deployment to GitHub Pages, Vercel,
 * Netlify, or any static web server.
 *
 * Usage: node scripts/build-web.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const srcAppDir = path.join(srcDir, 'app');
const distWebDir = path.join(rootDir, 'dist-web');
const targetAppDir = path.join(distWebDir, 'app');

function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.cpSync(src, dest, { recursive: true });
}

function main() {
    console.log('--- Building ScratchJr Web / PWA ---');

    // 1. Build renderer esbuild bundles
    console.log('1. Building renderer bundles...');
    execSync('node scripts/build-renderer.js', {
        stdio: 'inherit',
        cwd: rootDir,
        env: { ...process.env, ESBUILD_TARGET: process.env.ESBUILD_TARGET || 'chrome107' },
    });

    // 2. Prepare dist-web directories
    console.log('2. Preparing dist-web/ structure...');
    if (fs.existsSync(distWebDir)) {
        fs.rmSync(distWebDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distWebDir, { recursive: true });
    fs.mkdirSync(targetAppDir, { recursive: true });

    // 3. Copy top-level runtime host files
    const topLevelFiles = [
        'hostClient.js',
        'webav.js',
        'browserClient.js',
    ];

    for (const file of topLevelFiles) {
        const srcFile = path.join(srcDir, file);
        if (fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, path.join(distWebDir, file));
        } else {
            console.warn(`build-web: missing ${file}`);
        }
    }

    // Copy vendor WebAssembly SQLite directly from node_modules
    const sqlDist = path.join(rootDir, 'node_modules', 'sql.js', 'dist');
    fs.copyFileSync(path.join(sqlDist, 'sql-wasm.js'), path.join(distWebDir, 'sql-wasm.js'));
    fs.copyFileSync(path.join(sqlDist, 'sql-wasm.wasm'), path.join(distWebDir, 'sql-wasm.wasm'));

    // 4. Copy app HTML, manifest, SW, settings, media.json, appEntry.js
    const appFiles = [
        'index.html',
        'home.html',
        'editor.html',
        'gettingstarted.html',
        'settings.json',
        'media.json',
        'appEntry.js',
        'manifest.webmanifest',
        'sw.js',
    ];

    for (const file of appFiles) {
        const srcFile = path.join(srcAppDir, file);
        if (fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, path.join(targetAppDir, file));
        } else {
            console.warn(`build-web: missing ${file}`);
        }
    }

    // Version the Service Worker cache with both the package and generated chunk names.
    // Otherwise browsers can retain an old app.bundle.js that requests chunks removed by a newer build.
    const pkg = require(path.join(rootDir, 'package.json'));
    const swDestPath = path.join(targetAppDir, 'sw.js');
    if (fs.existsSync(swDestPath)) {
        let swContent = fs.readFileSync(swDestPath, 'utf8');
        const distDir = path.join(srcAppDir, 'dist');
        const distJsFiles = fs.existsSync(distDir)
            ? fs.readdirSync(distDir).filter((file) => file.endsWith('.js')).sort()
            : [];
        const distFingerprint = distJsFiles.map((file) => {
            const fileHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(distDir, file))).digest('hex');
            return `${file}:${fileHash}`;
        }).join('\n');
        const hostClientPath = path.join(rootDir, 'src', 'hostClient.js');
        const hostClientFingerprint = fs.existsSync(hostClientPath)
            ? crypto.createHash('sha256').update(fs.readFileSync(hostClientPath)).digest('hex')
            : '';
        const cacheRevision = crypto.createHash('sha256')
            .update(`${distFingerprint}\nhostClient:${hostClientFingerprint}`)
            .digest('hex').slice(0, 10);
        swContent = swContent.replace(
            /var CACHE_NAME\s*=\s*'scratchjr-pwa-v[^']*';/,
            `var CACHE_NAME = 'scratchjr-pwa-v${pkg.version}-${cacheRevision}';`
        );
        if (fs.existsSync(distDir)) {
            const distJsUrls = distJsFiles.map((file) => `'./dist/${file}'`).join(',\n  ');
            if (distJsUrls) {
                swContent = swContent.replace(/'\.\/dist\/app\.bundle\.js'/, distJsUrls);
            }
        }
        fs.writeFileSync(swDestPath, swContent, 'utf8');
    }

    // 5. Copy app asset folders: dist, assets, localizations, samples, css, inapp, sounds, svglibrary, pnglibrary
    console.log('3. Copying web bundles, styles, localizations, and media libraries...');
    const folders = [
        'dist',
        'assets',
        'localizations',
        'samples',
        'css',
        'inapp',
        'sounds',
        'svglibrary',
        'pnglibrary',
    ];

    for (const folder of folders) {
        const srcFolder = path.join(srcAppDir, folder);
        const destFolder = path.join(targetAppDir, folder);
        if (fs.existsSync(srcFolder)) {
            copyDirRecursive(srcFolder, destFolder);
        }
    }

    // 6. Copy root landing page, screenshots, and docs
    const docsDir = path.join(rootDir, 'docs');
    const docsFiles = [
        'index.html',
        'scratchjr-reborn-banner.jpg',
        'screenshot-lobby.webp',
        'screenshot-editor.webp',
        'screenshot-start.webp',
        'README.md',
        'development.md',
        'engine.md',
        'ARCHITECTURE.md',
        'ANDROID-PORT-PLAN.md'
    ];

    for (const docFile of docsFiles) {
        const srcPath = path.join(docsDir, docFile);
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, path.join(distWebDir, docFile));
        }
    }

    // Copy single source of truth version manifest from root
    fs.copyFileSync(path.join(rootDir, 'version.json'), path.join(distWebDir, 'version.json'));

    // 7. Create /play/ launcher redirecting to /app/index.html
    const targetPlayDir = path.join(distWebDir, 'play');
    fs.mkdirSync(targetPlayDir, { recursive: true });
    const playRedirect = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=../app/index.html">
  <title>ScratchJr Web Launcher</title>
</head>
<body>
  <p>Launching ScratchJr Web... <a href="../app/index.html">Click here if not redirected</a>.</p>
</body>
</html>
`;
    fs.writeFileSync(path.join(targetPlayDir, 'index.html'), playRedirect, 'utf8');

    // 8. Bypass Jekyll on GitHub Pages
    fs.writeFileSync(path.join(distWebDir, '.nojekyll'), '', 'utf8');

    console.log('✅ Web / PWA build complete at dist-web/ (landing at /, app at /play/ and /app/)');
}

main();
