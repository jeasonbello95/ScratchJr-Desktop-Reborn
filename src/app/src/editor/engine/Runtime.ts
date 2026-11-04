import { enginePorts } from './ports';
import Prims from './Prims';
import Thread, { BlockLike } from './Thread';
import Sprite from './Sprite';

export default class Runtime {
    threadsRunning: Thread[];
    thread: Thread;
    intervalId: number | undefined;
    yield: boolean;
    private afterSpriteCompletion: {sprite: Sprite; callback: () => void} | null;

    constructor () {
        this.threadsRunning = [];
        this.thread = null as unknown as Thread;
        this.intervalId = undefined;
        this.yield = false;
        this.afterSpriteCompletion = null;
    }

    beginTimer () {
        if (this.intervalId != null) {
            window.clearInterval(this.intervalId);
        }
        var rt = this;
        this.intervalId = window.setInterval(function () {
            rt.tickTask();
        }, 32);
        // The UI save-in-progress flag clears when a run starts.
        enginePorts().projectClearSaving();
        // Prims.time = Date.now();
        this.threadsRunning = [];
    }

    tickTask () {
        enginePorts().updateRunStopButtons();
        var activeThreads: Thread[] = [];
        for (var i = 0; i < this.threadsRunning.length; i++) {
            if (this.threadsRunning[i].isRunning) {
                activeThreads.push(this.threadsRunning[i]);
            }
        }
        const isEventThread = (thread: Thread) => ['ontouch', 'ontouchcolor', 'ontouchsprite'].includes(thread.firstBlock.blocktype || '');
        const hadProgramThreads = this.threadsRunning.some(thread => !isEventThread(thread));
        this.threadsRunning = activeThreads;
        if (this.afterSpriteCompletion
            && !activeThreads.some(thread => thread.spr === this.afterSpriteCompletion!.sprite
                && !isEventThread(thread))) {
            const callback = this.afterSpriteCompletion.callback;
            this.afterSpriteCompletion = null;
            callback();
        }
        const hasProgramThreads = this.threadsRunning.some(thread => thread.isRunning && !isEventThread(thread));
        if (hadProgramThreads && !hasProgramThreads && window.sessionStorage.getItem('stblockKidsMode') === 'story') {
            const storyApi = (window as Window & {STBLOCK_KIDS_STORY?: {getPlayerPosition?: () => unknown; getMovementTrace?: () => unknown; getRunTelemetry?: () => unknown}}).STBLOCK_KIDS_STORY;
            window.parent.postMessage({
                type: 'STBLOCK_KIDS_STORY_RUN_FINISHED',
                position: storyApi?.getPlayerPosition?.(),
                trace: storyApi?.getMovementTrace?.(),
                telemetry: storyApi?.getRunTelemetry?.()
            }, window.location.origin);
        }
        if (this.threadsRunning.length < 1) return;
        for (var j = 0; j < this.threadsRunning.length; j++) {
            this.step(j);
        }
    }

    inactive () {
        if (this.threadsRunning.length < 1) {
            return true;
        }
        var inactive = true;
        for (var i = 0; i < this.threadsRunning.length; i++) {
            var t = this.threadsRunning[i];
            if (!t) {
                continue;
            }
            if (t.isRunning && (t.firstBlock.blocktype != 'ontouch') && (t.firstBlock.blocktype != 'ontouchcolor') && (t.firstBlock.blocktype != 'ontouchsprite')) {
                inactive = false;
            }
            if (((t.firstBlock.blocktype == 'ontouch') || (t.firstBlock.blocktype == 'ontouchcolor') || (t.firstBlock.blocktype == 'ontouchsprite')) && (t.thisblock != null)
                && (t.thisblock.blocktype != 'ontouch') && (t.thisblock.blocktype != 'ontouchcolor') && (t.thisblock.blocktype != 'ontouchsprite')) {
                inactive = false;
            }
        }
        return inactive;
    }

    step (n: number) {
        this.yield = false;
        this.thread = this.threadsRunning[n];
        while (true) { // eslint-disable-line no-constant-condition
            if (!this.thread.isRunning) {
                return;
            }
            if (this.thread.waitTimer > 0) {
                this.thread.waitTimer += -1;
                return;
            }
            //  if (this.thread.spr.parentNode.id == "frame") return; // object is being dragged
            if (this.yield) {
                return;
            }
            if (this.thread.thisblock == null) {
                this.endCase();
                this.yield = true;
            } else {
                this.runPrim();
            }
        }
    }

    addRunScript (spr: Sprite, b: BlockLike) {
        this.restartThread(spr, b);
    }

    runAfterSpriteCompletes (spr: Sprite, callback: () => void) {
        this.afterSpriteCompletion = {sprite: spr, callback};
        if (!this.threadsRunning.some(thread => thread.spr === spr && thread.isRunning
            && !['ontouch', 'ontouchcolor', 'ontouchsprite'].includes(thread.firstBlock.blocktype || ''))) {
            this.afterSpriteCompletion = null;
            callback();
        }
    }

    stopThreads () {
        for (var i = 0; i < this.threadsRunning.length; i++) {
            this.threadsRunning[i].stop();
        }
        this.threadsRunning = [];
        this.afterSpriteCompletion = null;
    }

    stopThreadBlock (b: BlockLike) {
        for (var i = 0; i < this.threadsRunning.length; i++) {
            if (this.threadsRunning[i].firstBlock == b) {
                this.threadsRunning[i].stop();
            }
        }
    }

    stopThreadSprite (spr: Sprite) {
        for (var i = 0; i < this.threadsRunning.length; i++) {
            if (this.threadsRunning[i].spr == spr) {
                this.threadsRunning[i].stop();
            }
        }
    }

    removeRunScript (spr: Sprite) {
        var res: Thread[] = [];
        for (var i = 0; i < this.threadsRunning.length; i++) {
            if (this.threadsRunning[i].spr == spr) {
                if (this.threadsRunning[i].isRunning) {
                    if (this.threadsRunning[i].thisblock != null) {
                        this.threadsRunning[i].endPrim();
                    }
                    res.push(this.threadsRunning[i].duplicate());
                }
                this.threadsRunning[i].isRunning = false;
                if (this.threadsRunning[i].oldblock != null) {
                    this.threadsRunning[i].oldblock!.unhighlight();
                }
            }
        }
        return res;
    }

    runPrim () {
        if (this.thread.oldblock != null) {
            this.thread.oldblock.unhighlight();
        }
        this.thread.oldblock = null;
        var token = Prims.table[this.thread.thisblock.blocktype!];
        if (token == null) {
            token = Prims.table.missing;
        } else {
            var noh = ['repeat', 'gotopage', 'randompage'];
            if (noh.indexOf(this.thread.thisblock.blocktype!) < 0) {
                this.thread.thisblock.highlight();
                this.thread.oldblock = this.thread.thisblock;
            }
            Prims.time = Date.now();
            token(this.thread);
        }
    }

    endCase () {
        if (this.thread.oldblock != null) {
            this.thread.oldblock.unhighlight();
        }
        if (this.thread.stack.length == 0) {
            Prims.Done(this.thread);
        } else {
            var thing = (this.thread.stack).pop();
            this.thread.thisblock = thing!;
            this.runPrim();
        }
    }

    restartThread (spr: Sprite, b: BlockLike, active?: boolean) {
        var newThread = new Thread(spr, b);
        var wasRunning = false;
        for (var i = 0; i < this.threadsRunning.length; i++) {
            if (this.threadsRunning[i].firstBlock == b) {
                wasRunning = true;
                if ((b.blocktype != 'ontouch') && (b.blocktype != 'ontouchcolor') && (b.blocktype != 'ontouchsprite')) { // on touch demons are special - they are not interruptable
                    if (this.threadsRunning[i].oldblock != null) {
                        this.threadsRunning[i].oldblock!.unhighlight();
                    }
                    this.threadsRunning[i].stopping(active);
                    newThread = this.threadsRunning[i];
                }
            }
        }
        if (!wasRunning) {
            this.threadsRunning.push(newThread);
        }
        return newThread;
    }
}
