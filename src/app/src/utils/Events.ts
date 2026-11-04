/*
the caller should define the window event and call startDrag with the appropiate values
*/

import {gn, scaleMultiplier, currentUiScale, frame} from './lib';

// Drag elements are DOM nodes (block/thumb divs, canvases) carrying
// drag-session expando state. While a drag is active they are treated as
// always present; the accessors below assert that for external readers.
type DragElement = HTMLElement & {
    origin?: string;
    startx?: number;
    starty?: number;
    isReporter?: boolean;
};

let dragged = false;
let dragthumbnail: DragElement | null = null; // drag element (block/thumb div) with expando props; cross-module glue
let dragmousex = 0;
let dragmousey = 0;
let timeoutEvent: ReturnType<typeof setTimeout> | undefined;
let dragcanvas: DragElement | null = null; // drag element with expando props; cross-module glue
let dragDiv!: HTMLDivElement;
let fcnstart: ((e: MouseEvent) => void) | undefined;
let fcnend: ((e: MouseEvent | TouchEvent, c: HTMLElement) => void) | undefined;
let updatefcn: ((e: MouseEvent, c: HTMLElement) => void) | undefined;
let fcnclick: ((e: MouseEvent | TouchEvent, c: HTMLElement) => void) | undefined;
let delta = 10;
// Last pointer position seen during a drag. Used to finalize a drag whose
// release event was never delivered (e.g. the pointer left the iframe or a
// WebView dropped the mouseup) when a new drag begins.
let lastMoveEvent: MouseEvent | TouchEvent | null = null;
// Pointer id of the gesture that started the current drag. Used to capture the
// pointer on the drag clone so pointermove/pointerup keep flowing even when the
// WebView stops delivering legacy mousemove events or the pointer leaves the
// element/frame (seen in the Tauri WebView2 desktop shell).
let activePointerId: number | null = null;
// Number of move events actually processed for the current drag. Logged at
// release so we can compare a working block against the sound/pop block.
let dragMoveCount = 0;
// Incremented on every startDrag so logs from concurrent/merged drags can be
// grouped and distinguished.
let dragSession = 0;

export default class Events {
    // Getters/setters for globally used properties
    static get dragged () {
        return dragged;
    }

    static set dragged (newDragged) {
        dragged = newDragged;
    }

    static get dragthumbnail (): DragElement {
        return dragthumbnail!;
    }

    static set dragthumbnail (newDragthumbnail: DragElement | null) {
        dragthumbnail = newDragthumbnail;
    }

    static get dragmousex () {
        return dragmousex;
    }

    static set dragmousex (newDragmousex) {
        dragmousex = newDragmousex;
    }

    static get dragmousey () {
        return dragmousey;
    }

    static set dragmousey (newDragmousey) {
        dragmousey = newDragmousey;
    }

    static get timeoutEvent () {
        return timeoutEvent;
    }

    static set timeoutEvent (newTimeoutEvent) {
        timeoutEvent = newTimeoutEvent;
    }

    static get dragcanvas (): DragElement {
        return dragcanvas!;
    }

    static set dragcanvas (newDragcanvas: DragElement | null) {
        dragcanvas = newDragcanvas;
    }

    static get dragDiv () {
        return dragDiv;
    }

    static get dragSession () {
        return dragSession;
    }

    // Instead of popping the dragging block, etc to the outer-most frame,
    // which causes delays while the content is reflowed, we create a
    // small drag div that is a parent of frame that the dragging block
    // can be a child of. This improves dragging performance.
    static init () {
        dragDiv = document.createElement('div');
        dragDiv.id = 'dragDiv';
        dragDiv.style.position = 'absolute';
        dragDiv.style.width = '0px'; // size doesn't matter since children float
        dragDiv.style.height = '0px';
        dragDiv.style.zIndex = '7001'; // slightly higher than ScratchJr.dragginLayer
        var frameDiv = gn('frame')!;
        frameDiv.appendChild(dragDiv);
        const forwardRawRelease = (event: Event) => {
            if (!dragged) return;
            // Some embedded WebViews deliver pointerup to the document but
            // fail to invoke the legacy window.onmouseup property handler.
            // Finalize from capture phase so palette/script drops cannot stay
            // attached to dragDiv. The following mouseup is ignored because
            // mouseUp clears the active drag state.
            if (dragged && dragcanvas && fcnend &&
                (event.type === 'pointerup' || event.type === 'mouseup' || event.type === 'touchend' ||
                 event.type === 'pointercancel')) {
                Events.mouseUp(event as MouseEvent | TouchEvent);
            }
        };
        document.addEventListener('pointerup', forwardRawRelease, true);
        document.addEventListener('mouseup', forwardRawRelease, true);
        document.addEventListener('touchend', forwardRawRelease, true);
        // Fallback for cases where the browser cancels the pointer (pointer
        // leaves the frame, OS gesture wins, etc.) without a normal release.
        document.addEventListener('pointercancel', forwardRawRelease, true);
        // ScratchJr's editor controls are wired to mousedown. On touch devices
        // Chrome emits pointerdown immediately but delays its compatibility
        // mousedown until the finger is lifted, so the drag starts too late.
        // Bridge only gestures whose target has an existing mousedown handler;
        // ordinary taps and controls without one keep their normal click path.
        document.addEventListener('pointerdown', (event: PointerEvent) => {
            if (!event.isPrimary || (event.pointerType !== 'touch' && event.pointerType !== 'pen') || event.button !== 0) {
                return;
            }
            const target = event.target as HTMLElement | null;
            const frameElement = gn('frame');
            if (!target || !frameElement || !frameElement.contains(target)) return;
            let handlerElement: HTMLElement | null = target;
            while (handlerElement && handlerElement !== frameElement && typeof handlerElement.onmousedown !== 'function') {
                handlerElement = handlerElement.parentElement;
            }
            if (!handlerElement || handlerElement === frameElement || typeof handlerElement.onmousedown !== 'function') return;
            event.preventDefault();
            const mouseDown = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                detail: 1,
                screenX: event.screenX,
                screenY: event.screenY,
                clientX: event.clientX,
                clientY: event.clientY,
                button: 0,
                buttons: 1
            });
            target.dispatchEvent(mouseDown);
        }, {capture: true, passive: false});
        if (window.parent !== window) {
            try {
                const parentDocument = window.parent.document;
                const finishParentRelease = (event: Event) => {
                    if (!dragged || !dragcanvas || !fcnend) return;
                    const touchEvent = event as TouchEvent;
                    const touch = touchEvent.changedTouches?.[0] || touchEvent.touches?.[0];
                    const pointer = event as MouseEvent;
                    const point = touch || pointer;
                    const frameElement = window.frameElement as HTMLElement | null;
                    const frameRect = frameElement?.getBoundingClientRect() || {left: 0, top: 0};
                    const clientX = (point.clientX !== undefined ? point.clientX : point.pageX) - frameRect.left;
                    const clientY = (point.clientY !== undefined ? point.clientY : point.pageY) - frameRect.top;
                    const normalizedEvent = {
                        type: event.type,
                        clientX,
                        clientY,
                        pageX: clientX,
                        pageY: clientY,
                        button: pointer.button,
                        pointerType: (event as PointerEvent).pointerType,
                        preventDefault: () => event.preventDefault(),
                        stopPropagation: () => event.stopPropagation()
                    } as unknown as MouseEvent;
                    Events.mouseUp(normalizedEvent);
                };
                parentDocument.addEventListener('pointerup', finishParentRelease, true);
                parentDocument.addEventListener('mouseup', finishParentRelease, true);
                parentDocument.addEventListener('touchend', finishParentRelease, true);
                window.parent.addEventListener('pointerup', finishParentRelease, true);
                window.parent.addEventListener('mouseup', finishParentRelease, true);
                window.parent.addEventListener('touchend', finishParentRelease, true);
            } catch (_error) {
                // Cross-origin or sandboxed parents keep using the local release handlers.
            }
        }
        window.addEventListener('blur', function () {
            if (dragged || dragthumbnail) {
                Events.cancelAll();
            }
        });
    }
    static startDrag (e: MouseEvent, c: HTMLElement, atstart: (e: MouseEvent) => void,
        atend: (e: MouseEvent | TouchEvent, c: HTMLElement) => void,
        atdrag: (e: MouseEvent, c: HTMLElement) => void,
        atclick: (e: MouseEvent | TouchEvent, c: HTMLElement) => void,
        athold?: (c: HTMLElement) => void) {
        // If a previous drag never received its release event, its clone is
        // still floating in dragDiv. Finalize it at its last known position so
        // it lands in the scripts pane instead of becoming a frozen "ghost"
        // block that captures clicks, then purge any remaining clones.
        dragSession++;
        Events.settlePendingDrag();
        dragged = false;
        dragMoveCount = 0;
        var pt = Events.getTargetPoint(e);
        dragmousex = pt.x;
        dragmousey = pt.y;
        dragthumbnail = c;
        fcnstart = atstart;
        fcnend = atend;
        fcnclick = atclick;

        // A single palette mousedown can match more than one palette child
        // (overlapping rects), calling startDrag several times in a row. Each
        // call arms a new long-press timer; without clearing the previous one
        // the earlier timer is orphaned (timeoutEvent is overwritten) and fires
        // mid-drag, cancelling the active drag via clearDragAndDrop(). Clear
        // any pending hold timer before arming a new one.
        clearTimeout(timeoutEvent);
        timeoutEvent = undefined;
        if (athold) {
            Events.holdit(c, athold);
        }
        updatefcn = atdrag;
        const isTouchOrCoarse = (('pointerType' in e && (e as PointerEvent).pointerType === 'touch')
            || ('touches' in e && Boolean((e as { touches?: TouchList }).touches))
            || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches));
        delta = isTouchOrCoarse ? 10 * scaleMultiplier : 7;
        // Prefer Pointer Events when available. In the Tauri WebView2 desktop
        // shell the legacy mousemove stream stops after the first move while
        // pointermove/pointerup keep flowing. Using the pointer driver on window
        // (instead of the mouse one) avoids processing the same gesture twice on
        // desktop browsers, which also emit a compatibility mousemove.
        const hasPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
        if (hasPointerEvents) {
            activePointerId = ('pointerId' in e) ? (e as PointerEvent).pointerId : null;
            window.addEventListener('pointermove', Events.pointerMove, {passive: false});
            window.addEventListener('pointerup', Events.pointerUp);
            window.addEventListener('pointercancel', Events.pointerUp);
        } else {
            window.onmousemove = function (evt) {
                Events.mouseMove(evt);
            };
            window.onmouseup = function (evt) {
                Events.mouseUp(evt);
            };
            // Touch fallback for browsers without Pointer Events (older mobile).
            window.ontouchmove = function (evt) {
                Events.mouseMove(evt as unknown as MouseEvent);
            };
            window.ontouchend = function (evt) {
                Events.mouseUp(evt);
            };
            window.ontouchleave = function (evt) {
                Events.mouseUp(evt);
            };
            window.ontouchcancel = function (evt) {
                Events.mouseUp(evt);
            };
        }
    }

    static holdit (c: HTMLElement, fcn: (c: HTMLElement) => void) {
        var repeat = function () {
            // Long-press actions (e.g. shake-to-delete a sound) only make sense
            // while the user is still holding still on the block. Once a drag
            // has started, a hold timer must never tear down the active drag.
            if (dragged || dragMoveCount > 0) {
                return;
            }
            Events.clearEvents();
            fcn(dragthumbnail!);
            Events.clearDragAndDrop();
        };
        timeoutEvent = setTimeout(repeat, 500);
    }

    static clearDragAndDrop () {
        // Actually cancel the pending hold timer; just dropping the reference
        // left the callback scheduled, firing later against an unrelated drag.
        clearTimeout(timeoutEvent);
        timeoutEvent = undefined;
        dragcanvas = null;
        dragged = false;
        dragthumbnail = null;
        fcnstart = undefined;
        fcnend = undefined;
        updatefcn = undefined;
        fcnclick = undefined;
    }

    // Finish a drag that is still active because its release was lost. Called
    // before starting a new drag so the pending clone is dropped at its last
    // position instead of being abandoned (and later orphaned) in dragDiv.
    static settlePendingDrag () {
        const willFinalize = Boolean(dragged && dragcanvas && fcnend && lastMoveEvent);
        const pendingChildren = dragDiv ? dragDiv.childElementCount : 0;
        if (dragged && dragcanvas && fcnend && lastMoveEvent) {
            try {
                Events.mouseUp(lastMoveEvent);
            } catch (err) {
                console.error('Events.settlePendingDrag: finalization failed', err);
            }
        }
        // Remove any clone left in dragDiv that is not being tracked.
        if (dragDiv) {
            while (dragDiv.firstChild) {
                dragDiv.removeChild(dragDiv.firstChild);
            }
        }
        lastMoveEvent = null;
    }

    // Pointer-event drivers. Registered on window by startDrag when PointerEvent
    // is supported. They feed the same drag pipeline as the legacy mouse/touch
    // handlers, so the rest of the engine is unchanged.
    static pointerMove (e: PointerEvent) {
        if (activePointerId === null && typeof e.pointerId === 'number') {
            activePointerId = e.pointerId;
        }
        Events.mouseMove(e as unknown as MouseEvent);
        // Capture after the drag clone exists (set up by fcnstart on first move)
        // so pointermove/pointerup keep flowing even if the pointer leaves the
        // clone or the WebView drops legacy mouse events.
        Events.captureActivePointer(dragcanvas);
    }

    static pointerUp (e: PointerEvent) {
        Events.mouseUp(e as unknown as TouchEvent);
        activePointerId = null;
    }

    static captureActivePointer (el: HTMLElement | null) {
        if (!el || activePointerId === null || typeof el.setPointerCapture !== 'function') {
            return;
        }
        try {
            el.setPointerCapture(activePointerId);
        } catch (_error) {
            // Pointer already released or element detached; safe to ignore.
        }
    }

    static mouseMove (e: MouseEvent) {
        lastMoveEvent = e;
        // be forgiving about the click
        var pt = Events.getTargetPoint(e);
        if (!dragged && (Events.distance(dragmousex - pt.x, dragmousey - pt.y) < delta)) {
            return;
        }
        clearTimeout(timeoutEvent);
        timeoutEvent = undefined;
        if (!dragged) {
            try {
                fcnstart!(e);
            } catch (err) {
                console.error('Events.mouseMove: fcnstart failed', err);
                Events.clearDragAndDrop();
                return;
            }
        }
        dragged = true;
        dragMoveCount++;
        if (updatefcn) updatefcn(e, dragcanvas!);
        dragmousex = pt.x;
        dragmousey = pt.y;
    }

    static distance (dx: number, dy: number) {
        return Math.round(Math.hypot(dx, dy));
    }

    static mouseUp (e: MouseEvent | TouchEvent) {
        clearTimeout(timeoutEvent);
        timeoutEvent = undefined;
        Events.clearEvents();
        try {
            if (!dragged) {
                Events.itIsAClick(e);
            } else {
                Events.performMouseUpAction(e);
            }
        } catch (err) {
            console.error('Events.mouseUp: handler failed', err);
        }
        // Never leave a drag clone orphaned in dragDiv (a "ghost" block that is
        // not part of any script and cannot be moved or deleted). A successful
        // drop reparents the block into the scripts pane, so it is no longer a
        // child of dragDiv; otherwise we must remove it here.
        if (dragcanvas && dragDiv && dragcanvas.parentElement === dragDiv) {
            dragDiv.removeChild(dragcanvas);
        }
        Events.clearDragAndDrop();
    }

    static cancelAll () {
        clearTimeout(timeoutEvent);
        timeoutEvent = undefined;
        if (dragged && dragcanvas && fcnend) {
            const cancelEvent = {
                clientX: 0,
                clientY: 0,
                preventDefault: () => undefined,
                stopPropagation: () => undefined
            } as unknown as MouseEvent;
            try {
                fcnend(cancelEvent, dragcanvas);
            } catch (error) {
                console.error('Events.cancelAll: drag finalization failed', error);
            }
        }
        if (dragcanvas && dragDiv && dragcanvas.parentElement === dragDiv) {
            dragDiv.removeChild(dragcanvas);
        }
        Events.clearEvents();
        Events.clearDragAndDrop();
    }

    static clearEvents () {
        if (typeof window !== 'undefined') {
            window.removeEventListener('pointermove', Events.pointerMove);
            window.removeEventListener('pointerup', Events.pointerUp);
            window.removeEventListener('pointercancel', Events.pointerUp);
        }
        window.onmousemove = null;
        window.onmouseup = null;
        window.ontouchmove = null;
        window.ontouchend = null;
        window.ontouchleave = null;
        window.ontouchcancel = null;
        activePointerId = null;
    }

    static performMouseUpAction (e: MouseEvent | TouchEvent) {
        if (fcnend) {
            fcnend(e, dragcanvas!);
        }
    }

    static itIsAClick (e: MouseEvent | TouchEvent) {
        if (fcnclick) {
            fcnclick(e, dragthumbnail!);
        }
    }

    static move3D (el: HTMLElement, dx: number, dy: number) {
        if (!el) {
            return;
        }
        // globals.d.ts augments HTMLElement with `next?: unknown`, breaking
        // HTMLElement -> Element assignability; cast to the DOM API shape.
        var mtx = new WebKitCSSMatrix(window.getComputedStyle(el as Element).webkitTransform);
        el.top = dy + mtx.m42;
        el.left = dx + mtx.m41;
        if (!Number.isFinite(el.left) || !Number.isFinite(el.top)) {
            return;
        }
        el.style.webkitTransform = 'translate3d(' + el.left + 'px,' + el.top + 'px, 0)';
    }


    /*
    .m41 – corresponds to the ‘x’ value of a WebKitCSSMatrix
    .m42 – corresponds to the ‘y’ value of a WebKitCSSMatrix
    
    
    The clientX read-only property of the MouseEvent interface provides the horizontal 
    coordinate within the application's client area at which the event occurred 
    (as opposed to the coordinates within the page). 
    
    For example, clicking in the top-left corner of the client area will always 
    result in a mouse event with a clientX value of 0, regardless of whether the 
    page is scrolled horizontally.
    */

    static getEventPoint (e: MouseEvent | TouchEvent | PointerEvent) {
        const te = e as TouchEvent;
        if (te && te.touches && (te.touches.length > 0)) {
            const rawX = te.touches[0].clientX !== undefined ? te.touches[0].clientX : te.touches[0].pageX;
            const rawY = te.touches[0].clientY !== undefined ? te.touches[0].clientY : te.touches[0].pageY;
            return { x: rawX, y: rawY };
        }
        if (te && te.changedTouches && (te.changedTouches.length > 0)) {
            const rawX = te.changedTouches[0].clientX !== undefined ? te.changedTouches[0].clientX : te.changedTouches[0].pageX;
            const rawY = te.changedTouches[0].clientY !== undefined ? te.changedTouches[0].clientY : te.changedTouches[0].pageY;
            return { x: rawX, y: rawY };
        }
        const me = e as MouseEvent;
        if (me) {
            const rawX = me.clientX !== undefined ? me.clientX : me.pageX;
            const rawY = me.clientY !== undefined ? me.clientY : me.pageY;
            return { x: rawX, y: rawY };
        }
        return { x: 0, y: 0 };
    }

    static getTargetPoint (e: MouseEvent | TouchEvent | PointerEvent) {
        const scale = (typeof currentUiScale !== 'undefined' && currentUiScale > 0) ? currentUiScale : 1.0;
        const frameEl = frame || (typeof document !== 'undefined' ? (document.getElementById('frame') || document.querySelector('.frame')) : null);
        const frameRect = frameEl && typeof frameEl.getBoundingClientRect === 'function'
            ? frameEl.getBoundingClientRect()
            : { left: 0, top: 0 };
        const pt = Events.getEventPoint(e);
        return {
            x: (pt.x - frameRect.left) / scale,
            y: (pt.y - frameRect.top) / scale
        };
    }

}
