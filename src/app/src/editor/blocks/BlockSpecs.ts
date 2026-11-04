import Localization from '../../utils/Localization';
import IO from '../../platform/IO';
import SoundLib from '../../utils/SoundLib';
import type Block from './Block';
import type Sprite from '../engine/Sprite';

let loadCount = 0;

let loadassets: Record<string, HTMLImageElement> = {};
let fontwhite = '#f2f3f2';
let fontpink = '#ff8ae9';
let fontdarkgray = '#6d6e6c';
let fontblack = '#1b2a34';
let fontyellow = '#ffdd33';
let fontdarkgreen = '#287f46';
let fontpurple = '#8f56e3';
let fontblue = '#0d50ab';
let fontred = '#c4281b';
let fontorange = '#da8540';

let fontcolors = [fontred, fontorange, fontyellow,
    fontdarkgreen, fontblue, fontpink, fontpurple,
    fontwhite, fontdarkgray, fontblack];

let fontsizes = [16, 24, 36, 48, 56, 72];

let getshapes = ['LetterGet_Orange', 'LetterGet_Red', 'LetterGet_Yellow', 'LetterGet_Green',
    'LetterGet_Blue', 'LetterGet_Purple'];
let sendshapes = ['LetterSend_Orange', 'LetterSend_Red', 'LetterSend_Yellow', 'LetterSend_Green',
    'LetterSend_Blue', 'LetterSend_Purple'];
let touchcolors = ['TouchColor_Red', 'TouchColor_Orange', 'TouchColor_Yellow', 'TouchColor_Green',
    'TouchColor_Blue', 'TouchColor_Pipette'];

let speeds = ['speed0', 'speed1', 'speed2'];

export default class BlockSpecs {
    // Dynamic statics populated by initBlocks()/loadGraphics()
    static defs: Record<string, unknown[]>;
    static palettes: string[][];
    static categories: (HTMLImageElement | string)[][];
    static canvasMask: HTMLImageElement;
    static balloon: string;
    static projectThumb: HTMLImageElement;
    static mic: HTMLImageElement;
    static yellowStart: HTMLImageElement;
    static yellowStartH: HTMLImageElement;
    static yellowCmd: HTMLImageElement;
    static yellowCmdH: HTMLImageElement;
    static redEnd: HTMLImageElement;
    static redEndH: HTMLImageElement;
    static orangeCmd: HTMLImageElement;
    static orangeCmdH: HTMLImageElement;
    static limeCmd: HTMLImageElement;
    static limeCmdH: HTMLImageElement;
    static pinkCmd: HTMLImageElement;
    static pinkCmdH: HTMLImageElement;
    static redEndLong: HTMLImageElement;
    static redEndLongH: HTMLImageElement;
    static cShape: HTMLImageElement;
    static cShapeH: HTMLImageElement;
    static blueCmd: HTMLImageElement;
    static blueCmdH: HTMLImageElement;
    static textfieldimg: HTMLImageElement;
    static numfieldimg: HTMLImageElement;
    static pressbutton: HTMLImageElement;
    static pressbuttonSmall: HTMLImageElement;
    static caretrepeat: HTMLImageElement;
    static cmdS: HTMLImageElement;
    static startS: HTMLImageElement;
    static endS: HTMLImageElement;
    static endLongS: HTMLImageElement;
    static repeatS: HTMLImageElement;
    static addsound: HTMLImageElement;

    static get loadCount () {
        return loadCount;
    }

    static set loadCount (newLoadCount) {
        loadCount = newLoadCount;
    }

    static get fontcolors () {
        return fontcolors;
    }

    static get fontsizes () {
        return fontsizes;
    }

    static get speeds () {
        return speeds;
    }

    static initBlocks () {
        loadassets = {};
        BlockSpecs.loadGraphics();
        BlockSpecs.defs = BlockSpecs.setupBlocksSpecs();
        BlockSpecs.palettes = BlockSpecs.setupPalettesDef();
        BlockSpecs.categories = BlockSpecs.setupCategories();
        if (window.Settings!.edition == 'PBS') {
            BlockSpecs.canvasMask = BlockSpecs.getImageFrom('assets/ui/canvasmask', 'svg');
        } else {
            BlockSpecs.canvasMask = BlockSpecs.getImageFrom('assets/ui/canvasmask');
        }
        if (window.Settings!.edition != 'PBS') {
            BlockSpecs.projectThumb = BlockSpecs.getImageFrom('assets/lobby/pmask');
        }
        IO.requestFromServer('assets/balloon.svg', BlockSpecs.setBalloon);
        loadCount++;
    }

    static setBalloon (str: string) {
        loadCount--;
        BlockSpecs.balloon = str;
    }


    static loadGraphics () {
        BlockSpecs.mic = BlockSpecs.getImageFrom('assets/ui/recordslot', 'svg');
        BlockSpecs.yellowStart = BlockSpecs.getImageFrom('assets/blocks/start', 'svg');
        BlockSpecs.yellowStartH = BlockSpecs.getImageFrom('assets/blocks/eh/startH');

        BlockSpecs.yellowCmd = BlockSpecs.getImageFrom('assets/blocks/yellowCmd', 'svg');
        BlockSpecs.yellowCmdH = BlockSpecs.getImageFrom('assets/blocks/eh/yellowCmdH');

        BlockSpecs.redEnd = BlockSpecs.getImageFrom('assets/blocks/endshort', 'svg');
        BlockSpecs.redEndH = BlockSpecs.getImageFrom('assets/blocks/eh/stopH');

        BlockSpecs.orangeCmd = BlockSpecs.getImageFrom('assets/blocks/flow', 'svg');
        BlockSpecs.orangeCmdH = BlockSpecs.getImageFrom('assets/blocks/eh/flowH');

        BlockSpecs.limeCmd = BlockSpecs.getImageFrom('assets/blocks/sounds', 'svg');
        BlockSpecs.limeCmdH = BlockSpecs.getImageFrom('assets/blocks/eh/soundsH');

        BlockSpecs.pinkCmd = BlockSpecs.getImageFrom('assets/blocks/looks', 'svg');
        BlockSpecs.pinkCmdH = BlockSpecs.getImageFrom('assets/blocks/eh/looksH');

        BlockSpecs.redEndLong = BlockSpecs.getImageFrom('assets/blocks/endlong', 'svg');
        BlockSpecs.redEndLongH = BlockSpecs.getImageFrom('assets/blocks/eh/stoplongH');

        BlockSpecs.cShape = BlockSpecs.getImageFrom('assets/blocks/repeat');
        BlockSpecs.cShapeH = BlockSpecs.getImageFrom('assets/blocks/eh/repeatH');

        BlockSpecs.blueCmd = BlockSpecs.getImageFrom('assets/blocks/blueCmd', 'svg');
        BlockSpecs.blueCmdH = BlockSpecs.getImageFrom('assets/blocks/eh/blueCmdH');

        BlockSpecs.textfieldimg = BlockSpecs.getImageFrom('assets/misc/Text-01');
        BlockSpecs.numfieldimg = BlockSpecs.getImageFrom('assets/misc/Number-01');
        BlockSpecs.pressbutton = BlockSpecs.getImageFrom('assets/misc/pushbutton-01', 'svg');
        BlockSpecs.pressbuttonSmall = BlockSpecs.getImageFrom('assets/misc/pushbutton', 'svg');
        BlockSpecs.caretrepeat = BlockSpecs.getImageFrom('assets/blocks/caretrepeat');
        BlockSpecs.cmdS = BlockSpecs.getImageFrom('assets/blocks/shadowCmd', 'svg');
        BlockSpecs.startS = BlockSpecs.getImageFrom('assets/blocks/shadowStart', 'svg');
        BlockSpecs.endS = BlockSpecs.getImageFrom('assets/blocks/shadowEndShort', 'svg');
        BlockSpecs.endLongS = BlockSpecs.getImageFrom('assets/blocks/shadowEndLong', 'svg');
        BlockSpecs.repeatS = BlockSpecs.getImageFrom('assets/blocks/shadowRepeat');
        BlockSpecs.addsound = BlockSpecs.getImageFrom('assets/blockicons/addsound', 'svg');
        SoundLib.init();
    }

    static getImageFrom (url: string, ext?: string) {
        var path = url + (ext ? '.' + ext : '.png');
        if (loadassets[path]) {
            return loadassets[path];
        }
        var img = document.createElement('img');
        img.src = path;
        loadassets[path] = img;
        if (!img.complete) {
            loadCount++;
            var done = false;
            var onDone = function () {
                if (!done) {
                    done = true;
                    loadCount--;
                }
            };
            img.addEventListener('load', onDone, { once: true });
            img.addEventListener('error', onDone, { once: true });
        }
        return img;
    }

    static setupCategories () {
        const categories = [
            [
                BlockSpecs.getImageFrom('assets/categories/StartOn', 'svg'),
                BlockSpecs.getImageFrom('assets/categories/StartOff', 'svg'),
                window.Settings!.categoryStartColor
            ],
            [
                BlockSpecs.getImageFrom('assets/categories/MotionOn', 'svg'),
                BlockSpecs.getImageFrom('assets/categories/MotionOff', 'svg'),
                window.Settings!.categoryMotionColor
            ],
            [
                BlockSpecs.getImageFrom('assets/categories/LooksOn', 'svg'),
                BlockSpecs.getImageFrom('assets/categories/LooksOff', 'svg'),
                window.Settings!.categoryLooksColor
            ],
            [
                BlockSpecs.getImageFrom('assets/categories/SoundOn', 'svg'),
                BlockSpecs.getImageFrom('assets/categories/SoundOff', 'svg'),
                window.Settings!.categorySoundColor
            ],
            [
                BlockSpecs.getImageFrom('assets/categories/FlowOn', 'svg'),
                BlockSpecs.getImageFrom('assets/categories/FlowOff', 'svg'),
                window.Settings!.categoryFlowColor
            ],
            [
                BlockSpecs.getImageFrom('assets/categories/StopOn', 'svg'),
                BlockSpecs.getImageFrom('assets/categories/StopOff', 'svg'),
                window.Settings!.categoryStopColor
            ]
        ];
        const params = new URLSearchParams(window.location.search);
        const kidsMode = params.get('stblockKidsMode') || window.sessionStorage.getItem('stblockKidsMode');
        if (kidsMode === 'robot') return [categories[0], categories[1], categories[4], categories[5]];
        if (kidsMode === 'story') return [categories[0], categories[1], categories[2], categories[3], categories[4], categories[5]];
        return categories;
    }


    static setupPalettesDef () {
        // Robot projects retain only blocks which map to a mobile robot:
        // green-flag start, relative movement, repeat, and end.
        const params = new URLSearchParams(window.location.search);
        const kidsMode = params.get('stblockKidsMode') || window.sessionStorage.getItem('stblockKidsMode');
        if (kidsMode === 'robot') {
            return [
                ['onflag'],
                ['forward', 'back', 'right', 'left'],
                ['repeat'],
                ['endstack']
            ];
        }
        if (kidsMode === 'story') {
            return [
                ['onflag'],
                ['forward', 'back', 'up', 'down'],
                [],
                [],
                [],
                ['endstack']
            ];
        }
        return [['onflag', 'onclick', 'ontouch', 'ontouchsprite', 'ontouchcolor', 'onmessage', 'message'],
            ['forward', 'back', 'up', 'down', 'right', 'left', 'flipX', 'hop', 'home', 'randompos'],
            ['say', 'space', 'grow', 'shrink', 'same', 'space', 'hide', 'show', 'space', 'color', 'fade'],
            [],
            ['wait', 'waitrandom', 'stopmine', 'setspeed', 'repeat'],
            ['endstack', 'forever', 'randompage']];
    }

    static configureStoryPalette (challenge: {requiredBlocks?: string[]; requiredBlockSequence?: string[]; requiredActions?: Array<{type?: string}>; availableBlocks?: string[]; movementRules?: {allowedTypes?: string[]; fixedStep?: number}; waitSeconds?: number; repeatCount?: number; repeatDefault?: number}) {
        const requiredBlocks = challenge.requiredBlocks || [];
        const requiredSequence = challenge.requiredBlockSequence || [];
        const actions = challenge.requiredActions || [];
        const available = new Set(challenge.availableBlocks || []);
        const needs = (type: string) => available.has(type) || actions.some(action => action.type === type);
        const useRepeat = available.has('repeat') || requiredBlocks.includes('repeat') || requiredSequence.includes('repeat');
        const useStoryIf = available.has('storyif') || requiredBlocks.includes('storyif') || requiredSequence.includes('storyif');
        const useWait = available.has('wait') || requiredBlocks.includes('wait') || requiredSequence.includes('wait');
        const movementBlocks = challenge.movementRules?.allowedTypes || ['forward', 'back', 'up', 'down'];
        const extraMovementBlocks = [
            ...(available.has('storyjump') || requiredBlocks.includes('storyjump') ? ['storyjump'] : []),
            ...(available.has('cloudfly') ? ['cloudfly'] : [])
        ];
        if (BlockSpecs.defs.wait) {
            const waitSeconds = Number(challenge.waitSeconds);
            BlockSpecs.defs.wait[4] = waitSeconds > 0 ? waitSeconds : 10;
            BlockSpecs.defs.wait[6] = waitSeconds > 0 ? waitSeconds : 0;
            BlockSpecs.defs.wait[7] = waitSeconds > 0 ? waitSeconds : 50;
        }
        for (const type of ['forward', 'back', 'up', 'down']) {
            const definition = BlockSpecs.defs[type];
            if (!definition) continue;
            const restricted = challenge.movementRules?.allowedTypes?.includes(type);
            definition[6] = restricted ? Number(challenge.movementRules?.fixedStep || 1) : -20;
            definition[7] = restricted ? Number(challenge.movementRules?.fixedStep || 1) : 20;
        }
        if (BlockSpecs.defs.repeat) {
            const repeatCount = Number(challenge.repeatCount);
            const repeatDefault = Number(challenge.repeatDefault);
            BlockSpecs.defs.repeat[4] = repeatCount > 0 ? repeatCount : (repeatDefault > 0 ? repeatDefault : 4);
            BlockSpecs.defs.repeat[6] = repeatCount > 0 ? repeatCount : 0;
            BlockSpecs.defs.repeat[7] = repeatCount > 0 ? repeatCount : 24;
        }
        BlockSpecs.palettes = [
            ['onflag', ...(available.has('message') || needs('sendMessage') ? ['message'] : [])],
            [...movementBlocks, ...extraMovementBlocks],
            [...(needs('pickup') ? ['pickup'] : []), ...(needs('drop') ? ['drop'] : []), ...(needs('interact') ? ['interact'] : []), ...(needs('touch') ? ['touch'] : [])],
            [...(available.has('playsnd') || needs('playSound') ? ['playsnd'] : [])],
            [...(useRepeat ? ['repeat'] : []), ...(useStoryIf ? ['storyif'] : []), ...(useWait ? ['wait'] : [])],
            ['endstack']
        ];
        const selectors = document.getElementById('selectors');
        if (selectors) {
            for (let index = 0; index < BlockSpecs.palettes.length; index++) {
                const selector = selectors.childNodes[index + 1] as HTMLElement | undefined;
                if (selector && selector.style) selector.style.display = BlockSpecs.palettes[index].length ? '' : 'none';
            }
        }
    }

    ///////////////////////////////
    // Data Structure
    //
    // name - blocktype, icon or datastructure, blockshape, argtype, initial value, highlight, min, max, shadow
    //
    // arg types:
    // null
    // n -> number field;
    // t -> text field
    // m  --> image menu with argvalue equal to name;
    // d --> image menu with argvalue equal to number;
    // c -- > color drop down
    // s --> sound name
    // p --> page icon
    //
    ////////////////////////////////

    static setupBlocksSpecs () {
        return {
            'ontouchsprite': ['ontouchsprite', BlockSpecs.getImageFrom('assets/blockicons/Bump', 'svg'),
                BlockSpecs.yellowStart, 'sprite', '', BlockSpecs.yellowStartH, null, null, BlockSpecs.startS],
            'waitrandom': ['waitrandom', BlockSpecs.getImageFrom('assets/blockicons/WaitRandom', 'svg'),
                BlockSpecs.orangeCmd, 'n', 10, BlockSpecs.orangeCmdH, 0, 50, BlockSpecs.cmdS],
            'onflag': ['onflag', BlockSpecs.getImageFrom('assets/blockicons/greenFlag', 'svg'),
                BlockSpecs.yellowStart, null, null, BlockSpecs.yellowStartH, null, null, BlockSpecs.startS],
            'onmessage': ['onmessage', getshapes, BlockSpecs.yellowStart, 'm', 'Orange',
                BlockSpecs.yellowStartH, null, null, BlockSpecs.startS],
            'onclick': ['onclick', BlockSpecs.getImageFrom('assets/blockicons/OnTouch', 'svg'),
                BlockSpecs.yellowStart, null, null, BlockSpecs.yellowStartH, null, null, BlockSpecs.startS],
            'ontouch': ['ontouch', BlockSpecs.getImageFrom('assets/blockicons/Bump', 'svg'),
                BlockSpecs.yellowStart, null, null, BlockSpecs.yellowStartH, null, null, BlockSpecs.startS],
            'ontouchcolor': ['ontouchcolor', touchcolors, BlockSpecs.yellowStart, 'm', 'Red',
                BlockSpecs.yellowStartH, null, null, BlockSpecs.startS],
            'message': ['message', sendshapes, BlockSpecs.yellowCmd, 'm', 'Orange',
                BlockSpecs.yellowCmdH, null, null, BlockSpecs.cmdS],

            'pickup': ['pickup', BlockSpecs.getImageFrom('assets/blockicons/Pickup', 'svg'),
                BlockSpecs.pinkCmd, null, null, BlockSpecs.pinkCmdH, null, null, BlockSpecs.cmdS],
            'drop': ['drop', BlockSpecs.getImageFrom('assets/blockicons/Drop', 'svg'),
                BlockSpecs.pinkCmd, null, null, BlockSpecs.pinkCmdH, null, null, BlockSpecs.cmdS],
            'interact': ['interact', BlockSpecs.getImageFrom('assets/blockicons/Interact', 'svg'),
                BlockSpecs.pinkCmd, null, null, BlockSpecs.pinkCmdH, null, null, BlockSpecs.cmdS],
            'touch': ['touch', BlockSpecs.getImageFrom('assets/blockicons/Bump', 'svg'),
                BlockSpecs.pinkCmd, null, null, BlockSpecs.pinkCmdH, null, null, BlockSpecs.cmdS],

            'repeat': ['repeat', BlockSpecs.getImageFrom('assets/blockicons/Repeat', 'svg'),
                BlockSpecs.cShape, 'n', 4, BlockSpecs.cShapeH, 0, 24, BlockSpecs.repeatS],
            'storyif': ['storyif', BlockSpecs.getImageFrom('assets/blockicons/StoryIf', 'svg'),
                BlockSpecs.cShape, 's', 'Si', BlockSpecs.cShapeH, null, null, BlockSpecs.repeatS],

            'forward': ['forward', BlockSpecs.getImageFrom('assets/blockicons/Foward', 'svg'),
                BlockSpecs.blueCmd, 'n', 1, BlockSpecs.blueCmdH, -20, 20, BlockSpecs.cmdS],
            'back': ['back', BlockSpecs.getImageFrom('assets/blockicons/Back', 'svg'),
                BlockSpecs.blueCmd, 'n', 1, BlockSpecs.blueCmdH, -20, 20, BlockSpecs.cmdS],
            'up': ['up', BlockSpecs.getImageFrom('assets/blockicons/Up', 'svg'),
                BlockSpecs.blueCmd, 'n', 1, BlockSpecs.blueCmdH, -15, 15, BlockSpecs.cmdS],
            'down': ['down', BlockSpecs.getImageFrom('assets/blockicons/Down', 'svg'),
                BlockSpecs.blueCmd, 'n', 1, BlockSpecs.blueCmdH, -15, 15, BlockSpecs.cmdS],
            'right': ['right', BlockSpecs.getImageFrom('assets/blockicons/Right', 'svg'),
                BlockSpecs.blueCmd, 'n', 1, BlockSpecs.blueCmdH, -12, 12, BlockSpecs.cmdS],
            'left': ['left', BlockSpecs.getImageFrom('assets/blockicons/Left', 'svg'),
                BlockSpecs.blueCmd, 'n', 1, BlockSpecs.blueCmdH, -12, 12, BlockSpecs.cmdS],
            'flipX': ['flipX', BlockSpecs.getImageFrom('assets/blockicons/FlipX', 'svg'),
                BlockSpecs.blueCmd, null, null, BlockSpecs.blueCmdH, null, null, BlockSpecs.cmdS],
            'home': ['home', BlockSpecs.getImageFrom('assets/blockicons/Home', 'svg'),
                BlockSpecs.blueCmd, null, null, BlockSpecs.blueCmdH, null, null, BlockSpecs.cmdS],
            'randompos': ['randompos', BlockSpecs.getImageFrom('assets/blockicons/RandomPos', 'svg'),
                BlockSpecs.blueCmd, null, null, BlockSpecs.blueCmdH, null, null, BlockSpecs.cmdS],
            'hop': ['hop', BlockSpecs.getImageFrom('assets/blockicons/Hop', 'svg'),
                BlockSpecs.blueCmd, 'n', 2, BlockSpecs.blueCmdH, -15, 15, BlockSpecs.cmdS],
            'storyjump': ['storyjump', ['StoryJumpForward', 'StoryJumpBack', 'StoryJumpDiagonal'],
                BlockSpecs.blueCmd, 'm', 'StoryJumpForward', BlockSpecs.blueCmdH, null, null, BlockSpecs.cmdS],
            'cloudfly': ['cloudfly', ['CloudFlyForward', 'CloudFlyBack', 'CloudFlyUp', 'CloudFlyDown'],
                BlockSpecs.blueCmd, 'm', 'CloudFlyDown', BlockSpecs.blueCmdH, null, null, BlockSpecs.cmdS],


            'wait': ['wait', BlockSpecs.getImageFrom('assets/blockicons/Wait', 'svg'),
                BlockSpecs.orangeCmd, 'n', 10, BlockSpecs.orangeCmdH, 0, 50, BlockSpecs.cmdS],
            'setspeed': ['setspeed', speeds, BlockSpecs.orangeCmd, 'd', 1,
                BlockSpecs.orangeCmdH, null, null, BlockSpecs.cmdS],
            'stopmine': ['stopmine', BlockSpecs.getImageFrom('assets/blockicons/Stop', 'svg'),
                BlockSpecs.orangeCmd, null, null, BlockSpecs.orangeCmdH, null, null, BlockSpecs.cmdS],

            'say': ['say', BlockSpecs.getImageFrom('assets/blockicons/Say', 'svg'),
                BlockSpecs.pinkCmd, 't',
                Localization.localize('SAY_BLOCK_DEFAULT_ARGUMENT'), BlockSpecs.pinkCmdH, null, null, BlockSpecs.cmdS],
            'show': ['show', BlockSpecs.getImageFrom('assets/blockicons/Appear', 'svg'),
                BlockSpecs.pinkCmd, null, null, BlockSpecs.pinkCmdH, null, null, BlockSpecs.cmdS],
            'hide': ['hide', BlockSpecs.getImageFrom('assets/blockicons/Disappear', 'svg'),
                BlockSpecs.pinkCmd, null, null, BlockSpecs.pinkCmdH, null, null, BlockSpecs.cmdS],
            'grow': ['grow', BlockSpecs.getImageFrom('assets/blockicons/Grow', 'svg'),
                BlockSpecs.pinkCmd, 'n', 2, BlockSpecs.pinkCmdH, -10, 10, BlockSpecs.cmdS],
            'shrink': ['shrink', BlockSpecs.getImageFrom('assets/blockicons/Shrink', 'svg'),
                BlockSpecs.pinkCmd, 'n', 2, BlockSpecs.pinkCmdH, -10, 10, BlockSpecs.cmdS],
            'same': ['same', BlockSpecs.getImageFrom('assets/blockicons/Reset', 'svg'),
                BlockSpecs.pinkCmd, null, null, BlockSpecs.pinkCmdH, null, null, BlockSpecs.cmdS],
            'color': ['color', BlockSpecs.getImageFrom('assets/blockicons/Color', 'svg'),
                BlockSpecs.pinkCmd, 'n', 1, BlockSpecs.pinkCmdH, -10, 10, BlockSpecs.cmdS],
            'fade': ['fade', BlockSpecs.getImageFrom('assets/blockicons/Fade', 'svg'),
                BlockSpecs.pinkCmd, 'n', 1, BlockSpecs.pinkCmdH, -10, 10, BlockSpecs.cmdS],

            'playsnd': ['playsnd', BlockSpecs.getImageFrom('assets/blockicons/Speaker', 'svg'),
                BlockSpecs.limeCmd, 's', 'pop.mp3', BlockSpecs.limeCmdH, null, null, BlockSpecs.cmdS],
            'playusersnd': ['playusersnd', BlockSpecs.getImageFrom('assets/blockicons/Microphone', 'svg'),
                BlockSpecs.limeCmd, 'r', '1', BlockSpecs.limeCmdH, null, null, BlockSpecs.cmdS],
            'endstack': ['endstack', null, BlockSpecs.redEnd, null, null,
                BlockSpecs.redEndH, null, null, BlockSpecs.endS],
            'forever': ['forever', BlockSpecs.getImageFrom('assets/blockicons/Forever', 'svg'),
                BlockSpecs.redEnd, null, null, BlockSpecs.redEndH, null, null, BlockSpecs.endS],
            'randompage': ['randompage', BlockSpecs.getImageFrom('assets/blockicons/RandomPage', 'svg'),
                BlockSpecs.redEnd, null, null, BlockSpecs.redEndH, null, null, BlockSpecs.endS],
            'gotopage': ['gotopage', null,
                BlockSpecs.redEndLong, 'p', '2', BlockSpecs.redEndLongH, null, null, BlockSpecs.endLongS],
            'caretstart': ['caretstart', null,
                BlockSpecs.getImageFrom('assets/blocks/caretstart', 'svg'), null, null, null, null, null],
            'caretend': ['caretend', null,
                BlockSpecs.getImageFrom('assets/blocks/caretend', 'svg'), null, null, null, null, null],
            'caretrepeat': ['caretrepeat', null,
                BlockSpecs.getImageFrom('assets/blocks/caretrepeat'), null, null, null, null, null],
            'caretcmd': ['caretcmd', null,
                BlockSpecs.getImageFrom('assets/blocks/caretcmd', 'svg'), null, null, null, null, null]

        };
    }

    static blockDesc (b: Block, spr: unknown) {
        // sprite comes out of a DOM owner expando (ScratchJr.getSprite() -> unknown)
        const s = spr as Sprite;
        var str = b.getArgValue() ? String(b.getArgValue()) : (b.blocktype == 'playsnd') ? 'SOUND' : '';

        return {
            'onflag': Localization.localize('BLOCK_DESC_GREEN_FLAG'),
            'onclick': Localization.localize('BLOCK_DESC_ON_TAP', {
                CHARACTER_NAME: s.name
            }),
            'ontouch': Localization.localize('BLOCK_DESC_ON_BUMP', {
                CHARACTER_NAME: s.name ? s.name : ''
            }),
            'ontouchcolor': Localization.localizeWithFallback('BLOCKS_TOUCH_COLOR', 'Start on touching color'),
            'ontouchsprite': Localization.localizeWithFallback('BLOCKS_TOUCH_CHARACTER', 'Start on touching character'),
            'waitrandom': Localization.localizeWithFallback('BLOCKS_RANDOM_WAIT', 'Random wait'),
            'onmessage': Localization.localize('BLOCK_DESC_ON_MESSAGE', {
                COLOR: Localization.localize('BLOCK_DESC_MESSAGE_COLOR_ORANGE')
            }),
            'repeat': Localization.localize('BLOCK_DESC_REPEAT'),
            'storyif': 'Si ya sonaron las tres notas en orden, hace lo de dentro; si no, lo salta.',
            'forward': Localization.localize('BLOCK_DESC_MOVE_RIGHT'),
            'back': Localization.localize('BLOCK_DESC_MOVE_LEFT'),
            'up': Localization.localize('BLOCK_DESC_MOVE_UP'),
            'down': Localization.localize('BLOCK_DESC_MOVE_DOWN'),
            'home': Localization.localize('BLOCK_DESC_GO_HOME'),
            'randompos': Localization.localizeWithFallback('BLOCK_DESC_RANDOM_POS', 'Go to random position'),
            'left': Localization.localize('BLOCK_DESC_TURN_LEFT'),
            'right': Localization.localize('BLOCK_DESC_TURN_RIGHT'),
            'flipX': Localization.localize('BLOCK_DESC_FLIP_X'),
            'hop': Localization.localize('BLOCK_DESC_HOP'),
            'storyjump': (() => {
                const direction = String(b.getArgValue() || 'StoryJumpForward');
                if (direction === 'StoryJumpBack') return Localization.localizeWithFallback('STBLOCK_STORY_JUMP_BACK', 'Salta hacia atrás.');
                if (direction === 'StoryJumpDiagonal') return Localization.localizeWithFallback('STBLOCK_STORY_JUMP_DIAGONAL', 'Salta en diagonal hacia la salida.');
                return Localization.localizeWithFallback('STBLOCK_STORY_JUMP_FORWARD', 'Salta hacia delante sobre el agua.');
            })(),
            'cloudfly': (() => {
                const direction = String(b.getArgValue() || 'CloudFlyDown');
                if (direction === 'CloudFlyForward') return 'Mistral vuela dos casillas hacia delante.';
                if (direction === 'CloudFlyBack') return 'Mistral vuela dos casillas hacia atrás.';
                if (direction === 'CloudFlyUp') return 'Mistral vuela dos casillas hacia arriba.';
                return 'Mistral vuela dos casillas hacia abajo.';
            })(),
            'wait': Localization.localize('BLOCK_DESC_WAIT'),
            'setspeed': Localization.localize('BLOCK_DESC_SET_SPEED'),
            'stopmine': Localization.localize('BLOCK_DESC_STOP', {
                CHARACTER_NAME: s.name ? s.name : s.str
            }),
            'say': Localization.localize('BLOCK_DESC_SAY'),
            'show': Localization.localize('BLOCK_DESC_SHOW'),
            'hide': Localization.localize('BLOCK_DESC_HIDE'),
            'grow': Localization.localize('BLOCK_DESC_GROW'),
            'shrink': Localization.localize('BLOCK_DESC_SHRINK'),
            'same': Localization.localize('BLOCK_DESC_RESET_SIZE'),
            'color': Localization.localizeWithFallback('BLOCK_DESC_COLOR', 'COLOR'),
            'fade': Localization.localizeWithFallback('BLOCK_DESC_FADE', 'FADE'),
            'playsnd': Localization.localize('BLOCK_DESC_PLAY_SOUND', {
                SOUND_NAME: (b.getArgValue() && SoundLib.isLibrarySound(String(b.getArgValue())))
                    ? SoundLib.getLabel(String(b.getArgValue()))
                    : Localization.localize('BLOCK_DESC_PLAY_SOUND_POP')
            }),
            'playusersnd': Localization.localize('BLOCK_DESC_PLAY_RECORDED_SOUND'),
            'endstack': Localization.localize('BLOCK_DESC_END'),
            'stopall': Localization.localize('BLOCK_DESC_STOP', {
                CHARACTER_NAME: s.name ? s.name : ''
            }),
            'forever': Localization.localize('BLOCK_DESC_REPEAT_FOREVER'),
            'randompage': Localization.localizeWithFallback('BLOCK_DESC_RANDOM_PAGE', 'Go to random page'),
            'gotopage': Localization.localize('BLOCK_DESC_GO_TO_PAGE', {
                PAGE: str
            }),
            'message': Localization.localize('BLOCK_DESC_SEND_MESSAGE', {
                COLOR: Localization.localize('BLOCK_DESC_MESSAGE_COLOR_ORANGE')
            }),
            'pickup': 'Recoge el objeto o personaje que está en tu casilla. Te seguirá hasta que lo sueltes.',
            'drop': 'Suelta aquí el objeto o personaje que llevas contigo.',
            'interact': 'Activa el objeto que está en tu casilla.',
            'touch': 'Toca el mecanismo que está en tu casilla o justo al lado y lo activa.'
        };
    }
}
