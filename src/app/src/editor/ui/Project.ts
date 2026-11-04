import ScratchJr from '../ScratchJr';
import { getModelRefAs } from '../modelRegistry';
import BlockSpecs from '../blocks/BlockSpecs';
import Alert from './Alert';
import Palette from './Palette';
import UI from './UI';
import Page from '../engine/Page';
import Sprite from '../engine/Sprite';
import PlatformBridge from '../../platform/PlatformBridge';
import IO from '../../platform/IO';
import Paint from '../../painteditor/Paint';
import SVG2Canvas from '../../utils/SVG2Canvas';
import type Scripts from './Scripts';
import type Block from '../blocks/Block';
import {frame, gn, newHTML, scaleMultiplier, getIdFor,
    setProps, setCanvasSize} from '../../utils/lib';

let metadata: Record<string, unknown> | null = null;
import { getMediaCount as _getMediaCount, setMediaCount as _setMediaCount, bumpMediaCount as _bumpMediaCount } from '../engine/mediaCounter';
let saving = false;
let interval: number | null = null;
let pageid: string | null = null;
let loadIcon: HTMLImageElement | null = null;
let error = false;
let projectbarsize = 66;
let mediaCountBase = 1;
let stblockStoryProgress: Record<string, unknown> | null = null;
let stblockStoryMovementTrace: Array<{x: number; y: number}> = [];
let stblockStoryMovementBlocks: Array<{type: string; step: number; executions: number; executionsInsideRepeat: number; block: object}> = [];
let stblockStoryBlockedCell: {x: number; y: number} | null = null;
let stblockStoryRuleViolation = '';
let stblockStoryActions: Array<Record<string, unknown>> = [];
let stblockStoryBlockUsage: string[] = [];
let stblockStoryActors: Array<Record<string, any>> = [];
let stblockStoryObjects: Array<Record<string, any>> = [];
let stblockStoryCarriedId: string | null = null;
let stblockStoryCarriedByName: string | null = null;
let stblockStoryCarriedByActor: Record<string, string> = {};
let stblockStoryActivated: string[] = [];
let stblockStoryConfig: Record<string, any> = {};
let stblockStoryBridgeStartedAt = 0;
let stblockStoryMotionTimer: number | null = null;
let stblockStoryAudioContext: AudioContext | null = null;
const isMultiActorStoryLevel = (level: unknown) => [11, 12, 15, 16, 17, 19, 20].includes(Number(level));

// Recursive strip encoding: [blocktype, arg, dx, dy, (nested strips)?]
export type EncodedStrip = Array<Array<string | number | EncodedStrip>>;

// Project file format (Project.getProject / undo snapshots): pages list,
// current page, then one bag per page id. Action-descriptor fields
// (action/who/where/sound) are merged in by Undo.record.
export type ProjectData = {
    pages: string[];
    currentPage: string;
    projectsounds?: unknown;
    action?: string;
    who?: string;
    where?: string;
    sound?: string;
    [pageId: string]: unknown;
};

// One page bag: sprite id list + sprite data bags keyed by id.
export type PageData = {
    lastSprite: string;
    sprites: string[];
    [spriteId: string]: unknown;
};

// One sprite bag: sprite attributes (Sprite.getSpriteData) plus script strips.
export type SpriteData = {
    id: string;
    type: string;
    scripts: EncodedStrip[];
    sounds: string[];
    [key: string]: unknown;
};

export default class Project {
    static get metadata () {
        return metadata;
    }

    static set metadata (newMetadata) {
        metadata = newMetadata;
    }

    static get mediaCount () {
        return _getMediaCount();
    }

    static set mediaCount (newMediaCount) {
        _setMediaCount(newMediaCount);
    }

    static set loadIcon (newLoadIcon) {
        loadIcon = newLoadIcon;
    }

    static get loadIcon () {
        return loadIcon;
    }

    static get error () {
        return error;
    }


    static clear () {
        ScratchJr.stage.clear();
        UI.clear();
    }

    static delayLoadStartTime = 0;
    static loadwaitStartTime = 0;

    static load (md5?: string) {
        mediaCountBase = 1;
        ScratchJr.log('Project load status', ScratchJr.getTime(), 'sec', BlockSpecs.loadCount);
        if (BlockSpecs.loadCount > 0) {
            Project.delayLoadStartTime = Date.now();
            setTimeout(function () {
                Project.delayLoad();
            }, 32);
        } else {
            Project.startLoad();
        }
    }

    static delayLoad () {
        const elapsed = Date.now() - (Project.delayLoadStartTime || Date.now());
        if (BlockSpecs.loadCount < 1 || elapsed > 2500) {
            if (BlockSpecs.loadCount > 0) {
                console.warn('Project.delayLoad timed out waiting for assets (loadCount=' + BlockSpecs.loadCount + '). Proceeding to load project.');
                BlockSpecs.loadCount = 0;
            }
            Project.startLoad();
        } else {
            setTimeout(function () {
                Project.delayLoad();
            }, 32);
        }
    }

    static startLoad () {
        ScratchJr.log('all UI assets recieved - procced to call server', ScratchJr.getTime(), 'sec');
        Project.setProgress(20);
        UI.layout();
        IO.getObject(ScratchJr.currentProject!, Project.dataRecieved);
    }

    static dataRecieved (str: string) {
        ScratchJr.log('got project metadata', ScratchJr.getTime(), 'sec');
        var rows = JSON.parse(str);
        if (!rows || rows.length === 0) {
            console.error('Project dataRecieved: project not found in database for id:', ScratchJr.currentProject);
            metadata = {
                id: ScratchJr.currentProject,
                name: 'Project',
                version: window.Settings?.scratchJrVersion || '1.0.0'
            };
        } else {
            var data = rows[0];
            metadata = IO.parseProjectData(data);
        }
        let savedProject: Record<string, unknown> | undefined;
        try {
            const savedJson = metadata.json;
            savedProject = typeof savedJson === 'string' ? JSON.parse(savedJson) as Record<string, unknown> : savedJson as Record<string, unknown> | undefined;
        } catch (_) {
            savedProject = undefined;
        }
        stblockStoryProgress = savedProject && savedProject.stblockStory && typeof savedProject.stblockStory === 'object' ?
            savedProject.stblockStory as Record<string, unknown> : null;
        // Ensure name and version are never undefined
        if (!metadata.name || metadata.name === 'undefined') {
            metadata.name = 'Project';
        }
        if (!metadata.version) {
            metadata.version = window.Settings?.scratchJrVersion || '1.0.0';
        }
        _setMediaCount(-1);
        if (metadata!.json) {
            Project.loadData(metadata.json as Record<string, unknown>, doneProjectLoad);
        } else {
            _setMediaCount(0);
            new Page(getIdFor('page'));
            Palette.selectCategory(1);
            // On Android 4.2, this comes up blank the first time, so try again in 100ms.
            setTimeout(function () {
                Palette.selectCategory(1);
            }, 100);
            Project.loadwait(doneProjectLoad);
        }
        function doneProjectLoad () {
            // Clear gift flag
            if ('id' in metadata!) {
                metadata!.isgift = '0';
                IO.setProjectIsGift(metadata!);
            }
            Palette.selectCategory(1);
            // On Android 4.2, this comes up blank the first time, so try again in 100ms.
            setTimeout(function () {
                Palette.selectCategory(1);
            }, 100);
            Paint.layout();
            Project.setProgress(100);
            Project.liftCurtain();
            ScratchJr.stage.currentPage.update();
            ScratchJr.changed = false;
            ScratchJr.storyStarted = false;
            UI.needsScroll();
            ScratchJr.log('all thumbnails updated', ScratchJr.getTime(), 'sec');
            Project.installStblockKidsStoryBridge();
        }
    }

    static installStblockKidsStoryBridge () {
        const progressDefault = () => ({version: 1, completed: [], unlocked: 1, sparks: 0, activeLevel: 1, introsSeen: [], attemptsByLevel: {}, levelScores: {}, playerName: ''});
        const cellAt = (x: number, y: number) => {
            const stepX = Number(stblockStoryConfig.stepX) || 120;
            const stepY = Number(stblockStoryConfig.stepY) || 90;
            const originX = Number.isFinite(Number(stblockStoryConfig.originX)) ? Number(stblockStoryConfig.originX) : stepX / 2;
            const originY = Number.isFinite(Number(stblockStoryConfig.originY)) ? Number(stblockStoryConfig.originY) : stepY / 2;
            return {x: Math.round((x - originX) / stepX) + 1, y: Math.round((y - originY) / stepY) + 1};
        };
        const currentPlayerCell = () => {
            const sprite = Number(stblockStoryConfig.level) === 12 ? namedSprite('Mistral') : namedSprite('STBlock');
            return sprite ? cellAt(sprite.xcoor, sprite.ycoor) : null;
        };
        const namedSprite = (name?: string) => {
            const page = ScratchJr.stage && ScratchJr.stage.currentPage;
            if (!page || !name) return null;
            for (let index = 0; index < page.div.childElementCount; index++) {
                const sprite = getModelRefAs<Sprite>(page.div.childNodes[index] as HTMLElement, 'sprite');
                if (sprite && sprite.name === name) return sprite;
            }
            return null;
        };
        const spritesOnPage = () => {
            const page = ScratchJr.stage && ScratchJr.stage.currentPage;
            if (!page) return [] as Sprite[];
            const sprites: Sprite[] = [];
            for (let index = 0; index < page.div.childElementCount; index++) {
                const sprite = getModelRefAs<Sprite>(page.div.childNodes[index] as HTMLElement, 'sprite');
                if (sprite) sprites.push(sprite);
            }
            return sprites;
        };
        const cellForActor = (name?: string) => {
            const sprite = namedSprite(name) || ScratchJr.getSprite();
            return sprite ? cellAt(sprite.xcoor, sprite.ycoor) : null;
        };
        const renderStoryEntities = () => {
            const page = ScratchJr.stage && ScratchJr.stage.currentPage;
            if (!page || !page.div) return;
            let layer = page.div.querySelector('[data-stblock-story-layer="true"]') as HTMLElement | null;
            if (!layer) {
                layer = document.createElement('div');
                layer.dataset.stblockStoryLayer = 'true';
                setProps(layer.style, {position: 'absolute', left: '0', top: '0', width: '480px', height: '360px', pointerEvents: 'none', zIndex: '1', overflow: 'visible'});
                page.div.insertBefore(layer, page.div.firstChild);
            }
            layer.replaceChildren();
            if (!document.getElementById('stblock-story-entity-style')) {
                const style = document.createElement('style');
                style.id = 'stblock-story-entity-style';
                style.textContent = '@keyframes stblock-story-bob{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(-50%,-62%)}}@keyframes stblock-story-spin{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}@keyframes stblock-story-bridge-cycle{0%,8%{transform:translate(-50%,-50%)}28%,58%{transform:translate(-50%,calc(-50% - 82px)) rotate(-8deg)}100%{transform:translate(-50%,-50%)}}.stblock-story-label{position:absolute;left:50%;top:100%;transform:translateX(-50%);padding:2px 5px;border-radius:7px;background:#ffffffdf;color:#264b35;font:700 10px sans-serif;white-space:nowrap}';
                document.head.appendChild(style);
            }
            const stepX = Number(stblockStoryConfig.stepX) || 120;
            const stepY = Number(stblockStoryConfig.stepY) || 90;
            const originX = Number(stblockStoryConfig.originX) || stepX / 2;
            const originY = Number(stblockStoryConfig.originY) || stepY / 2;
            const playerCell = currentPlayerCell();
            const world6MillReady = stblockStoryConfig.level === 6 && ['drop-1', 'drop-2', 'drop-3'].every(id => stblockStoryObjects.some(drop => drop.id === id && drop.delivered));
            const entities: Array<{[key: string]: any}> = [];
            if (stblockStoryConfig.debugMarkers && Number(stblockStoryConfig.level) >= 9) {
                const columns = Math.max(1, Math.floor(Number(stblockStoryConfig.columns) || 8));
                const rows = Math.max(1, Math.floor(Number(stblockStoryConfig.rows) || 9));
                for (let row = 1; row <= rows; row++) {
                    for (let col = 1; col <= columns; col++) {
                        entities.push({
                            id: `__debug-grid-${col}-${row}`,
                            name: `CASILLA (${col},${row})`,
                            icon: `${col},${row}`,
                            col,
                            row,
                            width: Math.max(2, stepX - 2),
                            height: Math.max(2, stepY - 2),
                            gridMarker: true,
                            showLabel: false,
                            entityType: 'grid'
                        });
                    }
                }
            }
            entities.push(
                ...stblockStoryActors.map(entity => ({...entity, entityType: 'actor'})),
                ...stblockStoryObjects.map(entity => ({...entity, entityType: 'object'})),
                ...stblockStoryObjects.filter((entity, index, all) => Number(entity.deliverCol) > 0 && Number(entity.deliverRow) > 0 && all.findIndex(other => Number(other.deliverCol) === Number(entity.deliverCol) && Number(other.deliverRow) === Number(entity.deliverRow)) === index).map(entity => ({
                    id: `__delivery-${entity.id}`,
                    name: stblockStoryConfig.level === 6 ? (world6MillReady ? 'MOLINO ACTIVO' : 'MOLINO · DEJA AQUÍ LAS GOTAS') : `DEJA ${entity.name || 'EL OBJETO'} AQUÍ`,
                    icon: stblockStoryConfig.level === 6 ? (world6MillReady ? '⚙️' : '🎯') : '🎯',
                    col: Number(entity.deliverCol),
                    row: Number(entity.deliverRow),
                    size: 44,
                    deliveryMarker: true,
                    motion: world6MillReady ? 'spin' : 'idle',
                    entityType: 'delivery'
                }))
            );
            if (stblockStoryConfig.debugMarkers) {
                entities.push(
                    {id: '__debug-start', name: `INICIO (${stblockStoryConfig.startCol},${stblockStoryConfig.startRow})`, icon: '🟢', x: Number(stblockStoryConfig.startX), y: Number(stblockStoryConfig.startY), size: 32, debugMarker: true},
                    {id: '__debug-goal', name: `META (${stblockStoryConfig.goalCol},${stblockStoryConfig.goalRow})`, icon: '🏁', x: originX + (Number(stblockStoryConfig.goalCol) - 1) * stepX, y: originY + (Number(stblockStoryConfig.goalRow) - 1) * stepY, size: 34, debugMarker: true},
                    ...(Array.isArray(stblockStoryConfig.checkpoints) ? stblockStoryConfig.checkpoints : []).map((point: number[], index: number) => ({
                        id: `__debug-checkpoint-${index + 1}`,
                        name: `OBLIGATORIA ${index + 1} (${point[0]},${point[1]})`,
                        icon: '📍',
                        x: originX + (Number(point[0]) - 1) * stepX,
                        y: originY + (Number(point[1]) - 1) * stepY,
                        size: 34,
                        debugMarker: true
                    })),
                    ...(Array.isArray(stblockStoryConfig.blocked) ? stblockStoryConfig.blocked : []).map((point: number[], index: number) => ({
                        id: `__debug-blocked-${index + 1}`,
                        name: `PROHIBIDO (${point[0]},${point[1]})`,
                        icon: '🚫',
                        x: originX + (Number(point[0]) - 1) * stepX,
                        y: originY + (Number(point[1]) - 1) * stepY,
                        size: 36,
                        blockedMarker: true
                    }))
                );
            }
            for (const entity of entities) {
                if (entity.nativeSprite && isMultiActorStoryLevel(stblockStoryConfig.level) && namedSprite(String(entity.name || ''))) continue;
                const carrierName = isMultiActorStoryLevel(stblockStoryConfig.level)
                    ? Object.keys(stblockStoryCarriedByActor).find(name => stblockStoryCarriedByActor[name] === entity.id)
                    : stblockStoryCarriedId === entity.id ? stblockStoryCarriedByName || undefined : undefined;
                if (entity.carryable && carrierName && playerCell) {
                    const carrierCell = cellForActor(carrierName) || playerCell;
                    entity.col = carrierCell.x;
                    entity.row = carrierCell.y;
                }
                const col = Number(entity.col) || 1;
                const row = Number(entity.row) || 1;
                const scale = Number(entity.scale) > 0 ? Number(entity.scale) : 1;
                const size = Number(entity.size) > 0 ? Number(entity.size) : 48 * scale;
                const width = Number(entity.width) > 0 ? Number(entity.width) : size;
                const height = Number(entity.height) > 0 ? Number(entity.height) : size;
                const node = document.createElement('div');
                node.dataset.stblockStoryEntity = String(entity.id || 'entity');
                node.dataset.entityRole = String(entity.role || entity.kind || entity.entityType);
                node.setAttribute('aria-label', String(entity.name || entity.id || 'Elemento de aventura'));
                const left = Number.isFinite(Number(entity.x)) ? Number(entity.x) : originX + (col - 1) * stepX;
                const top = Number.isFinite(Number(entity.y)) ? Number(entity.y) : originY + (row - 1) * stepY;
                setProps(node.style, {
                    position: 'absolute', left: `${left}px`, top: `${top}px`,
                    width: `${width}px`, height: `${height}px`, transform: 'translate(-50%,-50%)', display: 'grid', placeItems: 'center',
                    fontSize: entity.gridMarker ? '9px' : `${Math.max(20, Math.min(width, height) * 0.72)}px`, lineHeight: '1', pointerEvents: 'none', userSelect: 'none',
                    border: entity.gridMarker ? '1px solid #ffffffb8' : entity.debugMarker || entity.deliveryMarker || entity.blockedMarker ? `2px solid ${entity.blockedMarker ? '#c62828' : '#fff'}` : '0', borderRadius: entity.gridMarker ? '4px' : entity.debugMarker || entity.deliveryMarker || entity.blockedMarker ? '50%' : '0',
                    background: entity.gridMarker ? '#1d5f3820' : entity.blockedMarker ? '#ffd6d6e8' : entity.debugMarker ? '#ffffffc9' : entity.deliveryMarker ? '#ffdb58dc' : 'transparent',
                    color: entity.gridMarker ? '#ffffffd8' : 'inherit', textShadow: entity.gridMarker ? '0 1px 2px #183b2acc' : 'none',
                    filter: (stblockStoryActivated.includes(String(entity.id)) || (entity.deliveryMarker && stblockStoryActivated.includes('mill'))) ? 'drop-shadow(0 0 7px #ffe45e)' : 'drop-shadow(0 2px 2px #153c2855)',
                    animation: entity.motion === 'bob' ? 'stblock-story-bob 1.8s ease-in-out infinite' : entity.motion === 'spin' || (stblockStoryConfig.level === 12 && ['blue-vane', 'gold-vane'].includes(String(entity.id)) && stblockStoryActivated.includes(String(entity.id))) ? 'stblock-story-spin 1.8s linear infinite' : entity.motion === 'bridge-cycle' && stblockStoryBridgeStartedAt && Date.now() - stblockStoryBridgeStartedAt < 2000 ? 'stblock-story-bridge-cycle 2s ease-in-out both' : 'none'
                });
                if (entity.image) {
                    const image = document.createElement('img');
                    image.src = String(entity.image);
                    image.alt = '';
                    image.onerror = () => {
                        image.remove();
                        node.insertBefore(document.createTextNode(String(entity.icon || '⭐')), node.firstChild);
                    };
                    setProps(image.style, {width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none'});
                    node.appendChild(image);
                } else {
                    node.textContent = String(entity.icon || '⭐');
                }
                if (entity.name && entity.showLabel !== false) {
                    const label = document.createElement('span');
                    label.className = 'stblock-story-label';
                    label.textContent = entity.messageReceived ? `${entity.name}: ¡recibido!` : String(entity.name);
                    node.appendChild(label);
                }
                layer.appendChild(node);
            }
        };
        (window as Window & {STBLOCK_KIDS_STORY?: Record<string, (...args: unknown[]) => unknown>}).STBLOCK_KIDS_STORY = {
            getProgress: () => stblockStoryProgress || progressDefault(),
            saveProgress: (next: unknown) => {
                if (!next || typeof next !== 'object') return false;
                stblockStoryProgress = next as Record<string, unknown>;
                ScratchJr.changed = true;
                ScratchJr.saveProject(null, () => undefined);
                return true;
            },
            configureLevel: (raw: unknown) => {
                if (!raw || typeof raw !== 'object' || !ScratchJr.stage.currentPage) return false;
                const config = raw as Record<string, any> & {background?: string; startX?: number; startY?: number; stepX?: number; stepY?: number; originX?: number; originY?: number; characterScale?: number; movementSpeed?: number; characterAngle?: number};
                if (stblockStoryMotionTimer !== null) window.clearInterval(stblockStoryMotionTimer);
                stblockStoryMotionTimer = null;
                stblockStoryConfig = config;
                stblockStoryBridgeStartedAt = 0;
                if (config.resetScripts === true) {
                    for (const character of spritesOnPage()) {
                        const scripts = (character as unknown as {code?: {clearProgram?: () => void}}).code;
                        if (scripts && typeof scripts.clearProgram === 'function') scripts.clearProgram();
                    }
                }
                if (window.sessionStorage.getItem('stblockKidsMode') === 'story' && config.challenge) {
                    BlockSpecs.configureStoryPalette(config.challenge);
                    Palette.selectCategory(0);
                }
                stblockStoryActors = Array.isArray(config.actors) ? config.actors.map((entity: Record<string, any>) => ({...entity})) : [];
                stblockStoryObjects = Array.isArray(config.objects) ? config.objects.map((entity: Record<string, any>) => ({...entity})) : [];
                stblockStoryMovementBlocks = [];
                stblockStoryBlockedCell = null;
                stblockStoryRuleViolation = '';
                stblockStoryCarriedId = null;
                stblockStoryCarriedByName = null;
                stblockStoryCarriedByActor = {};
                stblockStoryActivated = [];
                const page = ScratchJr.stage.currentPage;
                const library = document.getElementById('library');
                const isMultiActorLevel = isMultiActorStoryLevel(config.level);
                if (isMultiActorLevel) {
                    if (library) {
                        library.parentElement?.classList.add('stblock-story-multicharacter');
                        library.classList.add('stblock-story-multicharacter');
                        library.style.display = 'inline-block';
                        library.style.visibility = 'visible';
                        library.style.zIndex = '20';
                    }
                    const fixedCharacterStyleId = 'stblock-story-fixed-character-ui';
                    if (!document.getElementById(fixedCharacterStyleId)) {
                        const style = document.createElement('style');
                        style.id = fixedCharacterStyleId;
                        style.textContent = '#library.stblock-story-multicharacter .addsprite,#library.stblock-story-multicharacter .deletespritethumb{display:none!important}';
                        document.head.appendChild(style);
                    }
                } else if (library) {
                    library.parentElement?.classList.remove('stblock-story-multicharacter');
                    library.classList.remove('stblock-story-multicharacter');
                    if (window.sessionStorage.getItem('stblockKidsMode') === 'story') {
                        library.style.display = 'none';
                    } else {
                        library.style.display = '';
                        library.style.visibility = '';
                        library.style.zIndex = '';
                    }
                }
                const stepX = Number(config.stepX) || 120;
                const stepY = Number(config.stepY) || 90;
                const originX = Number.isFinite(Number(config.originX)) ? Number(config.originX) : stepX / 2;
                const originY = Number.isFinite(Number(config.originY)) ? Number(config.originY) : stepY / 2;
                const startX = Number(config.startX) || stepX / 2;
                const startY = Number(config.startY) || 360 - stepY / 2;
                stblockStoryMovementTrace = [{x: Math.round((startX - originX) / stepX) + 1, y: Math.round((startY - originY) / stepY) + 1}];
                if (config.background) page.setBackground(config.background, () => page.updateThumb());
                const storyActorDefs = isMultiActorLevel && Array.isArray(config.actors) ? config.actors : [];
                const secondaryActorDefs = isMultiActorLevel
                    ? storyActorDefs.filter((entity: Record<string, any>) => entity.nativeSprite || ['mistral', 'vega'].includes(String(entity.id)))
                    : [];
                const secondaryActorSpecs: Record<string, {svg: string; name: string}> = {
                    mistral: {svg: 'Mistral.svg', name: 'Mistral'},
                    // Vega uses her real artwork (served as a static SVG). The leading
                    // slash routes the engine through IO.requestFromServer/fetch.
                    vega: {svg: '/static/kids/story/characters/vega.svg', name: 'Vega'}
                };
                const vegaNaturalHeight = 128;
                const actorHome = (entity: Record<string, any>) => ({
                    x: originX + (Number(entity.col) - 1) * stepX,
                    y: originY + (Number(entity.row) - 1) * stepY
                });
                const distance = (candidate: Sprite, x: number, y: number) => Math.hypot(candidate.xcoor - x, candidate.ycoor - y);
                const currentSprites = spritesOnPage();
                const playerCandidates = currentSprites.filter(candidate => candidate.name === 'STBlock');
                let sprite = isMultiActorLevel
                    ? (playerCandidates.sort((a, b) => distance(a, startX, startY) - distance(b, startX, startY))[0] || null)
                    : (playerCandidates.sort((a, b) => distance(a, startX, startY) - distance(b, startX, startY))[0] || null);
                if (!sprite) sprite = page.addSprite(1, 'StblockKids.svg', 'STBlock');
                if (!isMultiActorLevel && sprite) {
                    // Story levels own their character roster. Never repurpose a
                    // sprite selected in a free-mode project as the protagonist.
                    for (const candidate of currentSprites) {
                        if (candidate !== sprite && candidate.name !== 'Lumi') {
                            ScratchJr.stage.removeCharacter(candidate);
                        }
                    }
                }
                if (sprite) {
                    const baseScale = Number(sprite.defaultScale) || Number(sprite.homescale) || Number(sprite.scale) || 1;
                    const requestedScale = Number(config.characterScale);
                    if (Number.isFinite(requestedScale) && requestedScale > 0) {
                        sprite.scale = baseScale * requestedScale;
                        sprite.homescale = sprite.scale;
                    }
                    const movementSpeed = Number(config.movementSpeed);
                    if (Number.isFinite(movementSpeed) && movementSpeed > 0) sprite.speed = movementSpeed;
                    const characterAngle = Number(config.characterAngle);
                    if (Number.isFinite(characterAngle)) sprite.angle = characterAngle;
                    sprite.homex = Number(config.startX) || 60;
                    sprite.homey = Number(config.startY) || 315;
                    sprite.setPos(sprite.homex, sprite.homey);
                    if (sprite.md5 !== 'StblockKids.svg' || sprite.name !== 'STBlock') {
                        page.modifySprite('StblockKids.svg', 'STBlock', sprite.id);
                    }
                }
                // Rendered height the main character reaches on screen; secondary
                // actors flagged matchPlayerHeight (Vega) are scaled to match it.
                const playerRenderedHeight = (sprite && Number(sprite.h) ? Number(sprite.h) : 343)
                    * (sprite && Number(sprite.scale) ? Number(sprite.scale) : (Number(config.characterScale) || 0.5));
                const secondarySprites: Sprite[] = [];
                if (isMultiActorLevel) {
                    for (const entity of secondaryActorDefs) {
                        const spec = secondaryActorSpecs[String(entity.id)] || {svg: 'Mistral.svg', name: String(entity.name || 'Mistral')};
                        const home = actorHome(entity);
                        const actorScale = entity.matchPlayerHeight
                            ? playerRenderedHeight / vegaNaturalHeight
                            : (Number(entity.scale) || 0.5);
                        let actorSprite = currentSprites.find(candidate => candidate.name === spec.name) || null;
                        // Keep an existing actor's artwork in sync with its current spec
                        // (e.g. an old Astronaut Vega must become the real Vega).
                        if (actorSprite && actorSprite.md5 !== spec.svg) {
                            page.modifySprite(spec.svg, spec.name, actorSprite.id);
                        }
                        if (!actorSprite) {
                            actorSprite = page.addSprite(0.8, spec.svg, spec.name, (target: Sprite) => {
                                target.homex = home.x;
                                target.homey = home.y;
                                target.homescale = actorScale;
                                target.scale = actorScale;
                                target.setPos(home.x, home.y);
                                target.setHeading(0);
                                target.render();
                                renderStoryEntities();
                            });
                        }
                        if (actorSprite) {
                            actorSprite.homex = home.x;
                            actorSprite.homey = home.y;
                            actorSprite.homescale = actorScale;
                            actorSprite.scale = actorScale;
                            actorSprite.setPos(home.x, home.y);
                            actorSprite.setHeading(0);
                            actorSprite.render();
                            secondarySprites.push(actorSprite);
                        }
                    }
                    const allStorySprites = spritesOnPage();
                    const keptSprites = new Set([sprite, ...secondarySprites].filter((candidate): candidate is Sprite => Boolean(candidate)));
                    for (const duplicate of allStorySprites) {
                        if (!keptSprites.has(duplicate) && duplicate.name !== 'Lumi') {
                            ScratchJr.stage.removeCharacter(duplicate);
                        }
                    }
                    if (sprite) {
                        page.setCurrentSprite(sprite);
                        page.refreshSpriteThumbnails();
                    }
                }
                (window as Window & {STBLOCK_KIDS_STORY_CONFIG?: unknown}).STBLOCK_KIDS_STORY_CONFIG = config;
                renderStoryEntities();
                ScratchJr.changed = true;
                return true;
            },
            getPlayerPosition: () => {
                const level = Number(stblockStoryConfig.level);
                const sprite = level === 12
                    ? namedSprite('Mistral')
                    : namedSprite('STBlock');
                return sprite ? {x: sprite.xcoor, y: sprite.ycoor} : null;
            },
            recordPosition: (raw: unknown, rawActorName?: unknown) => {
                if (!raw || typeof raw !== 'object') return false;
                const actorName = typeof rawActorName === 'string' ? rawActorName : undefined;
                const point = raw as {x?: number; y?: number};
                if (!Object.keys(stblockStoryConfig).length) return false;
                const cell = cellAt(Number(point.x) || 0, Number(point.y) || 0);
                if (isMultiActorStoryLevel(stblockStoryConfig.level) && actorName && actorName !== 'STBlock') {
                    // Secondary characters (Mistral, Vega) only drive their own scripts;
                    // they must not add cells to the main character's movement trace.
                    renderStoryEntities();
                    return true;
                }
                const previous = stblockStoryMovementTrace[stblockStoryMovementTrace.length - 1] || cell;
                const dx = Math.sign(cell.x - previous.x);
                const dy = Math.sign(cell.y - previous.y);
                let cursor = {x: previous.x, y: previous.y};
                while (cursor.x !== cell.x || cursor.y !== cell.y) {
                    cursor = {x: cursor.x + (cursor.x === cell.x ? 0 : dx), y: cursor.y + (cursor.y === cell.y ? 0 : dy)};
                    stblockStoryMovementTrace.push(cursor);
                }
                const switchEntity = Number(stblockStoryConfig.level) === 13 && stblockStoryObjects.find(entity => entity.id === 'switch');
                const touchesSwitch = switchEntity && Math.abs(cell.x - Number(switchEntity.col)) + Math.abs(cell.y - Number(switchEntity.row)) <= 1;
                if (touchesSwitch && !stblockStoryActivated.includes('switch')) {
                    stblockStoryActivated = [...stblockStoryActivated, 'switch'];
                    stblockStoryActions.push({type: 'interact', id: 'switch', success: true, cell: {x: Number(switchEntity.col), y: Number(switchEntity.row)}, actorName: actorName || '', automatic: true});
                }
                for (const actor of stblockStoryActors) {
                    if (Array.isArray(actor.path) && actor.path.length) {
                        actor.pathIndex = ((Number(actor.pathIndex) || 0) + 1) % actor.path.length;
                        const next = actor.path[actor.pathIndex];
                        if (Array.isArray(next)) { actor.col = next[0]; actor.row = next[1]; }
                    }
                }
                renderStoryEntities();
                return true;
            },
            recordJumpPosition: (raw: unknown) => {
                if (!raw || typeof raw !== 'object' || !Object.keys(stblockStoryConfig).length) return false;
                const point = raw as {x?: number; y?: number};
                const cell = cellAt(Number(point.x) || 0, Number(point.y) || 0);
                stblockStoryMovementTrace.push(cell);
                renderStoryEntities();
                return true;
            },
            getMovementTrace: () => stblockStoryMovementTrace.slice(),
            canMoveTo: (raw: unknown, rawActorName?: unknown) => {
                if (window.sessionStorage.getItem('stblockKidsMode') !== 'story' || !raw || typeof raw !== 'object') return true;
                const actorName = typeof rawActorName === 'string' ? rawActorName : undefined;
                const point = raw as {x?: number; y?: number};
                const cell = cellAt(Number(point.x) || 0, Number(point.y) || 0);
                if (isMultiActorStoryLevel(stblockStoryConfig.level) && actorName === 'Mistral') return true;
                const movingObstacle = stblockStoryConfig.level === 8 && stblockStoryObjects.find(entity => entity.blocksMovement && Number(entity.col) === cell.x && Number(entity.row) === cell.y);
                if (movingObstacle) {
                    const message = '¡La estrella está ocupando esa casilla! Espera a que pase y vuelve a intentarlo.';
                    ScratchJr.runtime.stopThreads();
                    const storyApi = (window as Window & {STBLOCK_KIDS_STORY?: {resetRun?: () => unknown}}).STBLOCK_KIDS_STORY;
                    storyApi?.resetRun?.();
                    window.parent.postMessage({type: 'STBLOCK_KIDS_STORY_RULE_VIOLATION', message}, window.location.origin);
                    return false;
                }
                if (stblockStoryConfig.level === 7 && stblockStoryBridgeStartedAt && Date.now() - stblockStoryBridgeStartedAt < 2000) {
                    const message = '¡Espera! El puente todavía está subiendo. Coloca Esperar en 2 segundos antes de moverte. Volvemos al inicio.';
                    stblockStoryRuleViolation = message;
                    ScratchJr.runtime.stopThreads();
                    const config = stblockStoryConfig;
                    const stepX = Number(config.stepX) || 120;
                    const stepY = Number(config.stepY) || 90;
                    const originX = Number.isFinite(Number(config.originX)) ? Number(config.originX) : stepX / 2;
                    const originY = Number.isFinite(Number(config.originY)) ? Number(config.originY) : stepY / 2;
                    const startX = Number(config.startX) || originX;
                    const startY = Number(config.startY) || 360 - stepY / 2;
                    stblockStoryMovementTrace = [{x: Math.round((startX - originX) / stepX) + 1, y: Math.round((startY - originY) / stepY) + 1}];
                    stblockStoryActions = [];
                    stblockStoryBlockUsage = [];
                    stblockStoryMovementBlocks = [];
                    stblockStoryCarriedId = null;
                    stblockStoryCarriedByName = null;
                    stblockStoryCarriedByActor = {};
                    stblockStoryActivated = [];
                    stblockStoryActors = Array.isArray(config.actors) ? config.actors.map((entity: Record<string, any>) => ({...entity, pathIndex: 0})) : [];
                    stblockStoryObjects = Array.isArray(config.objects) ? config.objects.map((entity: Record<string, any>) => ({...entity})) : [];
                    stblockStoryBridgeStartedAt = Date.now();
                    const sprite = namedSprite('STBlock');
                    if (sprite) { sprite.homex = startX; sprite.homey = startY; sprite.setHeading(0); sprite.setPos(startX, startY); sprite.render(); }
                    renderStoryEntities();
                    window.parent.postMessage({type: 'STBLOCK_KIDS_STORY_RULE_VIOLATION', message}, window.location.origin);
                    return false;
                }
                const blocked = Array.isArray(stblockStoryConfig.blocked) && stblockStoryConfig.blocked.some((entry: number[]) => Number(entry[0]) === cell.x && Number(entry[1]) === cell.y);
                if (!blocked) return true;
                stblockStoryBlockedCell = cell;
                const config = stblockStoryConfig;
                const stepX = Number(config.stepX) || 120;
                const stepY = Number(config.stepY) || 90;
                const originX = Number.isFinite(Number(config.originX)) ? Number(config.originX) : stepX / 2;
                const originY = Number.isFinite(Number(config.originY)) ? Number(config.originY) : stepY / 2;
                const startX = Number(config.startX) || originX;
                const startY = Number(config.startY) || 360 - stepY / 2;
                stblockStoryMovementTrace = [{x: Math.round((startX - originX) / stepX) + 1, y: Math.round((startY - originY) / stepY) + 1}];
                stblockStoryActions = [];
                stblockStoryBlockUsage = [];
                stblockStoryMovementBlocks = [];
                stblockStoryCarriedId = null;
                stblockStoryCarriedByName = null;
                stblockStoryCarriedByActor = {};
                stblockStoryActivated = [];
                stblockStoryActors = Array.isArray(config.actors) ? config.actors.map((entity: Record<string, any>) => ({...entity, pathIndex: 0})) : [];
                stblockStoryObjects = Array.isArray(config.objects) ? config.objects.map((entity: Record<string, any>) => ({...entity})) : [];
                const sprite = namedSprite(actorName) || namedSprite('STBlock');
                if (sprite) {
                    sprite.homex = startX;
                    sprite.homey = startY;
                    sprite.setHeading(0);
                    sprite.setPos(startX, startY);
                    sprite.render();
                }
                if (isMultiActorStoryLevel(config.level)) {
                    for (const secondaryName of ['Mistral', 'Vega']) {
                        const secondary = namedSprite(secondaryName);
                        if (secondary) { secondary.setPos(secondary.homex, secondary.homey); secondary.setHeading(0); secondary.render(); }
                    }
                }
                renderStoryEntities();
                const message = '¡Alto! Esa casilla tiene agua. Vuelve al inicio y busca un camino seguro; el programa se detuvo.';
                window.parent.postMessage({type: 'STBLOCK_KIDS_STORY_BLOCKED_MOVE', message, cell}, window.location.origin);
                return false;
            },
            recordMovementExecution: (rawBlock: unknown, rawType: unknown, rawStep: unknown, inRepeat: unknown) => {
                const rules = stblockStoryConfig.challenge?.movementRules;
                if (!rules || !rawBlock || typeof rawBlock !== 'object' || typeof rawType !== 'string') return true;
                const block = rawBlock as object;
                const type = rawType;
                const step = Number(rawStep);
                if (!(rules.allowedTypes || []).includes(type) || step !== Number(rules.fixedStep)) {
                    stblockStoryRuleViolation = rules.stepMessage || 'En este reto usa solo los movimientos permitidos y deja cada uno en 1.';
                    window.parent.postMessage({type: 'STBLOCK_KIDS_STORY_RULE_VIOLATION', message: stblockStoryRuleViolation}, window.location.origin);
                    return false;
                }
                if ((rules.requireRepeatFor || []).includes(type) && !inRepeat) {
                    stblockStoryRuleViolation = rules.repeatMessage || 'Pon este movimiento dentro de Repetir.';
                    window.parent.postMessage({type: 'STBLOCK_KIDS_STORY_RULE_VIOLATION', message: stblockStoryRuleViolation}, window.location.origin);
                    return false;
                }
                let record = stblockStoryMovementBlocks.find(item => item.block === block);
                if (!record) {
                    if (stblockStoryMovementBlocks.filter(item => item.type === type).length >= Number(rules.maxBlocksPerType || 1)) {
                        stblockStoryRuleViolation = 'Coloca un solo bloque de cada movimiento. Usa Repetir para avanzar varias casillas.';
                        window.parent.postMessage({type: 'STBLOCK_KIDS_STORY_RULE_VIOLATION', message: stblockStoryRuleViolation}, window.location.origin);
                        return false;
                    }
                    record = {block, type, step, executions: 0, executionsInsideRepeat: 0};
                    stblockStoryMovementBlocks.push(record);
                }
                record.executions += 1;
                if (inRepeat) record.executionsInsideRepeat += 1;
                return true;
            },
            canAddMovementBlock: (rawType: unknown) => {
                const rules = stblockStoryConfig.challenge?.movementRules;
                if (!rules) return true;
                const type = String(rawType || '');
                if (!(rules.allowedTypes || []).includes(type)) return true;
                const scripts = getModelRefAs<Scripts>(ScratchJr.getActiveScript(), 'scripts');
                if (!scripts) return false;
                const count = scripts.getBlocks().filter(block => block.blocktype === type).length;
                return count < Number(rules.maxBlocksPerType || 1);
            },
            notifyRuleViolation: (message: unknown) => {
                stblockStoryRuleViolation = String(message || 'Revisa los bloques de este reto.');
                window.parent.postMessage({type: 'STBLOCK_KIDS_STORY_RULE_VIOLATION', message: stblockStoryRuleViolation}, window.location.origin);
                return false;
            },
            recordBlock: (opcode: unknown) => {
                if (typeof opcode !== 'string') return false;
                stblockStoryBlockUsage.push(opcode);
                return true;
            },
            recordAction: (rawAction: unknown) => {
                if (!rawAction || typeof rawAction !== 'object') return false;
                const action = rawAction as Record<string, unknown>;
                const recorded = {...action, cell: action.cell || cellForActor(String(action.actorName || '')), success: action.success !== false};
                stblockStoryActions.push(recorded);
                if (Number(stblockStoryConfig.level) === 14 && recorded.type === 'playSound' && recorded.success) {
                    const melody = [[2, 4], [5, 4], [6, 3]];
                    const cell = recorded.cell as {x?: number; y?: number} | null;
                    const noteIndex = melody.findIndex(([col, row]) => cell?.x === col && cell?.y === row);
                    if (noteIndex >= 0) {
                        try {
                            const AudioContextConstructor = window.AudioContext;
                            if (AudioContextConstructor) {
                                stblockStoryAudioContext = stblockStoryAudioContext || new AudioContextConstructor();
                                const audio = stblockStoryAudioContext;
                                void audio.resume().then(() => {
                                    const now = audio.currentTime;
                                    const oscillator = audio.createOscillator();
                                    const gain = audio.createGain();
                                    oscillator.type = 'sine';
                                    oscillator.frequency.value = [523.25, 659.25, 783.99][noteIndex];
                                    gain.gain.setValueAtTime(0.0001, now);
                                    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
                                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
                                    oscillator.connect(gain);
                                    gain.connect(audio.destination);
                                    oscillator.start(now);
                                    oscillator.stop(now + 0.33);
                                });
                            }
                        } catch (_error) {
                            // Audio is an enhancement; the mission remains playable without it.
                        }
                    }
                    const current = stblockStoryActions.filter(entry => entry.type === 'playSound' && entry.success);
                    let progress = 0;
                    for (const note of current) {
                        const noteCell = note.cell as {x?: number; y?: number} | null;
                        if (noteCell?.x === melody[progress]?.[0] && noteCell?.y === melody[progress]?.[1]) progress += 1;
                        else progress = noteCell?.x === melody[0][0] && noteCell?.y === melody[0][1] ? 1 : 0;
                        if (progress === melody.length) break;
                    }
                    const chimeIds = ['chime-1', 'chime-2', 'chime-3'];
                    stblockStoryActivated = stblockStoryActivated.filter(id => !chimeIds.includes(id));
                    stblockStoryActivated.push(...chimeIds.slice(0, progress));
                    renderStoryEntities();
                }
                return true;
            },
            evaluateCondition: (rawCondition: unknown) => {
                const level = Number(stblockStoryConfig.level);
                if (!['Si', 'StoryIf', 'StoryIfMelodyReady', 'melody-ready'].includes(String(rawCondition))) return false;
                if (level === 15) {
                    // Vega's Si checks whether Mistral already opened the wind valve.
                    return stblockStoryActivated.includes('high-valve');
                }
                if (level === 16) {
                    // Vega's Si checks that STB delivered the cloud key and that
                    // Mistral already touched the wind spinner.
                    const key = stblockStoryObjects.find(entity => entity.id === 'cloud-key');
                    return Boolean(key && key.delivered) && stblockStoryActivated.includes('wind-spinner');
                }
                if (level === 17) {
                    // Vega's Si checks that Mistral already pulled the lift lever
                    // and that STB reached the top floor (row 1).
                    if (!stblockStoryActivated.includes('lift-lever')) return false;
                    const stb = namedSprite('STBlock');
                    if (!stb) return false;
                    const stbCell = cellAt(stb.xcoor, stb.ycoor);
                    return Boolean(stbCell && stbCell.y <= 1);
                }
                if (level !== 14) return false;
                const expected = [[2, 4], [5, 4], [6, 3]];
                let progress = 0;
                for (const action of stblockStoryActions) {
                    if (action.type !== 'playSound' || action.success !== true) continue;
                    const cell = action.cell as {x?: number; y?: number} | null;
                    if (cell?.x === expected[progress]?.[0] && cell?.y === expected[progress]?.[1]) progress += 1;
                    else progress = cell?.x === expected[0][0] && cell?.y === expected[0][1] ? 1 : 0;
                    if (progress === expected.length) return true;
                }
                return false;
            },
            canReceiveMessage: (rawValue: unknown) => {
                const value = String(rawValue || '');
                const receiver = stblockStoryActors.find(actor => actor.acceptsMessage && (!actor.messageValue || actor.messageValue === value));
                if (!receiver) return false;
                receiver.messageReceived = value;
                stblockStoryActivated = Array.from(new Set([...stblockStoryActivated, String(receiver.id)]));
                renderStoryEntities();
                return true;
            },
            performAction: (rawType: unknown, rawActorName?: unknown, rawPosition?: unknown, rawContext?: unknown) => {
                if (typeof rawType !== 'string') return false;
                const actorName = typeof rawActorName === 'string' ? rawActorName : undefined;
                const position = rawPosition && typeof rawPosition === 'object' ? rawPosition as {x: number; y: number} : null;
                const context = rawContext && typeof rawContext === 'object' ? rawContext as {insideIf?: boolean} : {};
                const cell = position ? cellAt(position.x, position.y) : cellForActor(actorName);
                if (!cell) return false;
                let action: Record<string, unknown> = {type: rawType, success: false, cell, actorName: actorName || '', insideIf: context.insideIf === true};
                if (rawType === 'pickup') {
                    const actorCarryKey = actorName || '__default';
                    const isMultiActorLevel = isMultiActorStoryLevel(stblockStoryConfig.level);
                    const wrongWorld12Actor = Number(stblockStoryConfig.level) === 12 && actorName !== 'STBlock';
                    const actorAlreadyCarrying = isMultiActorLevel ? Boolean(stblockStoryCarriedByActor[actorCarryKey]) : Boolean(stblockStoryCarriedId);
                    const item = actorAlreadyCarrying ? null : [...stblockStoryObjects, ...stblockStoryActors].find(entity =>
                        !wrongWorld12Actor && entity.carryable && !entity.delivered
                        && Number(entity.col) === cell.x && Number(entity.row) === cell.y
                        && (!isMultiActorLevel || !Object.values(stblockStoryCarriedByActor).includes(String(entity.id)))
                    );
                    if (item) {
                        stblockStoryCarriedId = String(item.id);
                        stblockStoryCarriedByName = actorName || null;
                        if (isMultiActorLevel) stblockStoryCarriedByActor[actorCarryKey] = String(item.id);
                        action = {...action, id: item.id, success: true};
                    }
                } else if (rawType === 'drop') {
                    const actorCarryKey = actorName || '__default';
                    const isMultiActorLevel = isMultiActorStoryLevel(stblockStoryConfig.level);
                    const wrongWorld12Actor = Number(stblockStoryConfig.level) === 12 && actorName !== 'STBlock';
                    const carriedId = isMultiActorLevel ? stblockStoryCarriedByActor[actorCarryKey] : stblockStoryCarriedId;
                    const item = [...stblockStoryObjects, ...stblockStoryActors].find(entity => entity.id === carriedId);
                    if (item && !wrongWorld12Actor) {
                        item.col = cell.x;
                        item.row = cell.y;
                        const delivered = Number(item.deliverCol) === cell.x && Number(item.deliverRow) === cell.y;
                        item.delivered = delivered;
                        if (isMultiActorLevel) {
                            delete stblockStoryCarriedByActor[actorCarryKey];
                            const remainingCarry = Object.entries(stblockStoryCarriedByActor).pop();
                            stblockStoryCarriedId = remainingCarry ? remainingCarry[1] : null;
                            stblockStoryCarriedByName = remainingCarry ? remainingCarry[0] : null;
                        } else {
                            stblockStoryCarriedId = null;
                            stblockStoryCarriedByName = null;
                        }
                        action = {...action, id: item.id, delivered, success: true};
                        if (delivered && stblockStoryConfig.level === 6) {
                            const dropsDelivered = ['drop-1', 'drop-2', 'drop-3'].every(id => stblockStoryObjects.some(drop => drop.id === id && drop.delivered));
                            if (dropsDelivered) {
                                stblockStoryActivated = Array.from(new Set([...stblockStoryActivated, 'mill']));
                            }
                        }
                        if (delivered && stblockStoryConfig.level === 12 && item.id === 'feather') {
                            stblockStoryActivated = Array.from(new Set([...stblockStoryActivated, 'blue-vane']));
                        }
                    }
                } else if (rawType === 'interact') {
                    const level = Number(stblockStoryConfig.level);
                    let target = stblockStoryObjects.find(entity => entity.kind === 'interactable' && Number(entity.col) === cell.x && Number(entity.row) === cell.y);
                    const melodyReady = level === 14 && stblockStoryActivated.includes('chime-3');
                    if (level === 14 && target?.id === 'light-gate' && (!melodyReady || context.insideIf !== true)) target = undefined;
                    const valveReady = level === 15 && stblockStoryActivated.includes('high-valve');
                    if (level === 15 && target?.id === 'gas-panel' && (!valveReady || context.insideIf !== true)) target = undefined;
                    if (!target && level === 13) {
                        target = stblockStoryObjects.find(entity => entity.id === 'switch' && Math.abs(Number(entity.col) - cell.x) + Math.abs(Number(entity.row) - cell.y) <= 1);
                    }
                    let canActivateTarget = true;
                    if (level === 12) {
                        canActivateTarget = actorName === 'Mistral' && target?.id === 'gold-vane' && stblockStoryActivated.includes('blue-vane');
                    } else if (level === 15 && target) {
                        if (target.id === 'high-valve') canActivateTarget = actorName === 'Mistral';
                        else if (target.id === 'gas-panel') canActivateTarget = actorName === 'Vega';
                        else canActivateTarget = false;
                    }
                    if (target && canActivateTarget) {
                        stblockStoryActivated = Array.from(new Set([...stblockStoryActivated, String(target.id)]));
                        action = {...action, id: target.id, cell: level === 13 && target.id === 'switch' ? {x: Number(target.col), y: Number(target.row)} : cell, success: true};
                    }
                } else if (rawType === 'touch') {
                    const level = Number(stblockStoryConfig.level);
                    // Tocar activates a mechanism in the actor's cell or immediately
                    // next to it (Manhattan distance 1). Unlike Activar, it does not
                    // require standing exactly on the target.
                    let target = stblockStoryObjects.find(entity => entity.kind === 'interactable' && Number(entity.col) === cell.x && Number(entity.row) === cell.y);
                    if (!target) {
                        target = stblockStoryObjects.find(entity => entity.kind === 'interactable'
                            && Math.abs(Number(entity.col) - cell.x) + Math.abs(Number(entity.row) - cell.y) === 1);
                    }
                    let canTouchTarget = true;
                    if (level === 16 && target) {
                        const key = stblockStoryObjects.find(entity => entity.id === 'cloud-key');
                        const doorReady = Boolean(key && key.delivered) && stblockStoryActivated.includes('wind-spinner');
                        if (target.id === 'wind-spinner') canTouchTarget = actorName === 'Mistral';
                        else if (target.id === 'tower-door') canTouchTarget = actorName === 'Vega' && doorReady && context.insideIf === true;
                        else canTouchTarget = false;
                    } else if (level === 17 && target) {
                        const leverReady = stblockStoryActivated.includes('lift-lever');
                        if (target.id === 'lift-lever') canTouchTarget = actorName === 'Mistral';
                        else if (target.id === 'lift-door') canTouchTarget = actorName === 'Vega' && leverReady && context.insideIf === true;
                        else canTouchTarget = false;
                    }
                    if (target && canTouchTarget) {
                        stblockStoryActivated = Array.from(new Set([...stblockStoryActivated, String(target.id)]));
                        action = {...action, id: target.id, success: true};
                    }
                }
                stblockStoryActions.push(action);
                renderStoryEntities();
                return action.success;
            },
            resetRun: () => {
                const config = stblockStoryConfig;
                stblockStoryBridgeStartedAt = config.level === 7 ? Date.now() : 0;
                if (stblockStoryMotionTimer !== null) window.clearInterval(stblockStoryMotionTimer);
                stblockStoryMotionTimer = null;
                stblockStoryActions = [];
                stblockStoryBlockUsage = [];
                stblockStoryMovementBlocks = [];
                stblockStoryBlockedCell = null;
                stblockStoryRuleViolation = '';
                stblockStoryCarriedId = null;
                stblockStoryCarriedByName = null;
                stblockStoryCarriedByActor = {};
                stblockStoryActivated = [];
                stblockStoryActors = Array.isArray(config.actors) ? config.actors.map((entity: Record<string, any>) => ({...entity, pathIndex: 0})) : [];
                stblockStoryObjects = Array.isArray(config.objects) ? config.objects.map((entity: Record<string, any>) => ({...entity, pathIndex: 0})) : [];
                if (config.level === 8) {
                    stblockStoryMotionTimer = window.setInterval(() => {
                        const playerCell = currentPlayerCell();
                        for (const entity of stblockStoryObjects) {
                            if (!entity.blocksMovement || !Array.isArray(entity.path) || !entity.path.length) continue;
                            const nextIndex = ((Number(entity.pathIndex) || 0) + 1) % entity.path.length;
                            const next = entity.path[nextIndex];
                            if (!Array.isArray(next) || (playerCell && Number(next[0]) === playerCell.x && Number(next[1]) === playerCell.y)) continue;
                            entity.pathIndex = nextIndex;
                            entity.col = Number(next[0]);
                            entity.row = Number(next[1]);
                        }
                        renderStoryEntities();
                    }, 1000);
                }
                if (config) {
                    const stepX = Number(config.stepX) || 120;
                    const stepY = Number(config.stepY) || 90;
                    const originX = Number.isFinite(Number(config.originX)) ? Number(config.originX) : stepX / 2;
                    const originY = Number.isFinite(Number(config.originY)) ? Number(config.originY) : stepY / 2;
                    const startX = Number(config.startX) || originX;
                    const startY = Number(config.startY) || 360 - stepY / 2;
                    stblockStoryMovementTrace = [{x: Math.round((startX - originX) / stepX) + 1, y: Math.round((startY - originY) / stepY) + 1}];
                    const sprite = namedSprite('STBlock');
                    if (sprite) {
                        sprite.setPos(startX, startY);
                        sprite.setHeading(0);
                        sprite.render();
                    }
                    if (isMultiActorStoryLevel(config.level)) {
                        for (const secondaryName of ['Mistral', 'Vega']) {
                            const secondary = namedSprite(secondaryName);
                            if (secondary) { secondary.setPos(secondary.homex, secondary.homey); secondary.setHeading(0); secondary.render(); }
                        }
                    }
                }
                renderStoryEntities();
                return true;
            },
            getRunTelemetry: () => {
                // Count of blocks placed by the child, used by the host to score
                // block efficiency. It walks the real scripts (not executions),
                // so a Repeat counts once instead of once per iteration.
                const countBlocksFor = (sprite: unknown): number => {
                    const code = (sprite as {code?: Scripts} | null)?.code;
                    return code ? code.getBlocks().length : 0;
                };
                const multiActor = isMultiActorStoryLevel(stblockStoryConfig.level);
                const blocksUsed = multiActor
                    ? countBlocksFor(namedSprite('STBlock')) + countBlocksFor(namedSprite('Mistral')) + countBlocksFor(namedSprite('Vega'))
                    : countBlocksFor(Number(stblockStoryConfig.level) === 12 ? namedSprite('Mistral') : namedSprite('STBlock'));
                return {actions: stblockStoryActions.slice(), blockUsage: stblockStoryBlockUsage.slice(), carriedId: stblockStoryCarriedId, carriedObjectsByActor: {...stblockStoryCarriedByActor}, worldObjects: stblockStoryObjects.map(({id, col, row, delivered}) => ({id, col, row, delivered: delivered === true})), activated: stblockStoryActivated.slice(), movementBlocks: stblockStoryMovementBlocks.map(({block: _block, ...entry}) => entry), blockedCell: stblockStoryBlockedCell, ruleViolation: stblockStoryRuleViolation, blocksUsed};
            },
            getCalibration: () => (window as Window & {STBLOCK_KIDS_STORY_CONFIG?: unknown}).STBLOCK_KIDS_STORY_CONFIG || null,
            // Test helper: install a ready-made program on each named sprite so the
            // level can be validated by pressing the green flag without coding.
            installSolution: (programs: unknown) => {
                if (!programs || typeof programs !== 'object') return false;
                const map = programs as Record<string, unknown>;
                let installed = 0;
                for (const name of Object.keys(map)) {
                    const sprite = namedSprite(name);
                    if (!sprite) continue;
                    const scripts = (sprite as unknown as {code?: Scripts}).code;
                    if (!scripts || typeof scripts.installProgram !== 'function') continue;
                    if (scripts.installProgram(map[name])) installed += 1;
                }
                if (installed > 0 && ScratchJr.stage && ScratchJr.stage.currentPage) {
                    const stblock = namedSprite('STBlock');
                    if (stblock) {
                        ScratchJr.stage.currentPage.setCurrentSprite(stblock);
                        ScratchJr.stage.currentPage.refreshSpriteThumbnails();
                    }
                    ScratchJr.changed = true;
                }
                return installed > 0;
            },
            // Test helper: snapshot of positions, per-actor cells, recorded actions,
            // block usage, calibration and each story sprite's script for debugging.
            getDebugSnapshot: () => {
                const dumpBlocks = (start: Block | null): Array<Record<string, unknown>> => {
                    const rows: Array<Record<string, unknown>> = [];
                    const seen = new Set<Block>();
                    let cursor: Block | null = start;
                    while (cursor && !seen.has(cursor)) {
                        seen.add(cursor);
                        const row: Record<string, unknown> = {op: cursor.blocktype, arg: cursor.getArgValue ? cursor.getArgValue() : null};
                        if (cursor.cShape && cursor.inside) row.inside = dumpBlocks(cursor.inside);
                        rows.push(row);
                        cursor = cursor.next;
                    }
                    return rows;
                };
                const scripts: Record<string, unknown> = {};
                for (const name of ['STBlock', 'Mistral', 'Vega']) {
                    const sprite = namedSprite(name);
                    const scriptsModel = sprite ? (sprite as unknown as {code?: Scripts}).code : null;
                    if (!scriptsModel) continue;
                    scripts[name] = scriptsModel.getBlocks().filter(block => !block.prev).map(block => dumpBlocks(block));
                }
                const playerSprite = Number(stblockStoryConfig.level) === 12 ? namedSprite('Mistral') : namedSprite('STBlock');
                return {
                    level: Number(stblockStoryConfig.level),
                    config: stblockStoryConfig,
                    player: playerSprite ? {x: Math.round(playerSprite.xcoor), y: Math.round(playerSprite.ycoor)} : null,
                    actors: stblockStoryActors.map(entity => ({id: entity.id, name: entity.name, col: entity.col, row: entity.row})),
                    objects: stblockStoryObjects.map(entity => ({id: entity.id, col: entity.col, row: entity.row, delivered: entity.delivered === true})),
                    activated: stblockStoryActivated.slice(),
                    trace: stblockStoryMovementTrace.slice(),
                    actions: stblockStoryActions.slice(),
                    blockUsage: stblockStoryBlockUsage.slice(),
                    movementBlocks: stblockStoryMovementBlocks.map(({block: _block, ...entry}) => entry),
                    blockedCell: stblockStoryBlockedCell,
                    ruleViolation: stblockStoryRuleViolation,
                    telemetry: {carriedId: stblockStoryCarriedId, carriedObjectsByActor: {...stblockStoryCarriedByActor}},
                    scripts
                };
            }
        };
    }


    static init () {
        ScratchJr.log('Project init', ScratchJr.getTime(), 'sec');
        var bd = newHTML('div', 'modal-backdrop fade', frame.parentNode as HTMLElement);
        bd.setAttribute('id', 'backdrop');
        setProps(gn('backdrop')!.style, {
            display: 'none'
        });
        var modalOuter = newHTML('div', 'modal-outer', frame.parentNode as HTMLElement);
        var modalMiddle = newHTML('div', 'modal-middle', modalOuter);
        var modal = newHTML('div', 'modal hide fade', modalMiddle);
        modal.setAttribute('id', 'modaldialog');
        setProps(gn('modaldialog')!.style, {});
        var body = newHTML('div', 'modal-body', modal);
        body.setAttribute('id', 'modalbody');
        setProps(body.style, {
            zoom: scaleMultiplier
        });
        if (loadIcon!.complete) {
            Project.addFeedback();
        } else {
            loadIcon!.onload = function () {
                Project.addFeedback();
            };
        }
        Project.drawBlind();
    }

    static addFeedback () {
        var body = gn('modalbody')!;
        newHTML('div', 'loadscreenfill', body);
        newHTML('div', 'topfill', body);
        var cover = newHTML('div', 'loadscreencover', body);
        cover.setAttribute('id', 'progressbar');
        var topcover = newHTML('div', 'topcover', body);
        topcover.setAttribute('id', 'topcover');
        var cover2 = newHTML('div', 'progressbar2', body);
        cover2.setAttribute('id', 'progressbar2');
        var li = newHTML('div', 'loadicon', body);
        li.appendChild(loadIcon!);
    }

    static setProgress (perc: number) {
        if (!gn('progressbar')!) {
            return;
        }
        var h = projectbarsize - Math.round(projectbarsize * perc / 100);
        ScratchJr.log('setProgress', perc, h, _getMediaCount(), mediaCountBase);
        gn('progressbar')!.style.height = h + 'px';
        if (h == 0) {
            gn('progressbar2')!.style.height = '0px';
            gn('topcover')!.style.background = '#F9A737';
        }

    }

    static drawBlind () {
        gn('backdrop')!.setAttribute('class', 'modal-backdrop fade in');
        setProps(gn('backdrop')!.style, {
            display: 'block'
        });
        setProps(gn('modaldialog')!.style, {
            display: 'block'
        });
        gn('modaldialog')!.setAttribute('class', 'modal fade in');
    }

    static loadwait (whenDone: () => void) {
        if (interval != null) {
            window.clearInterval(interval);
        }
        mediaCountBase = _getMediaCount();
        Project.loadwaitStartTime = Date.now();
        if (_getMediaCount() <= 0) {
            Project.getStarted(whenDone);
        } else {
            interval = window.setInterval(function () {
                Project.loadTask(whenDone);
            }, 32);
        }
    }

    static loadTask (whenDone: () => void) {
        const elapsed = Date.now() - (Project.loadwaitStartTime || Date.now());
        if (_getMediaCount() <= 0 || elapsed > 3500) {
            if (_getMediaCount() > 0) {
                console.warn('Project.loadwait timed out waiting for media (mediaCount=' + _getMediaCount() + '). Proceeding to load project.');
                _setMediaCount(0);
            }
            Project.getStarted(whenDone);
        } else {
            Project.setProgress(Project.getMediaLoadRatio(70));
        }
    }

    static getMediaLoadRatio (f: number) {
        if (_getMediaCount() > mediaCountBase) {
            mediaCountBase = _getMediaCount();
        }
        return 20 + f - (_getMediaCount() / mediaCountBase) * f;
    }

    static getStarted (whenDone: () => void) {
        Project.setProgress(90);
        if (interval) {
            window.clearInterval(interval);
        }
        interval = null;
        ScratchJr.log('Project images retrieved from server', ScratchJr.getTime(), 'sec');
        Project.setLoadPage(pageid, whenDone);
        ScratchJr.log('load done', ScratchJr.getTime(), 'sec', '-- media missing = ', _getMediaCount());
        ScratchJr.stage.resetPages();
        ScratchJr.runtime.beginTimer();
    }

    static liftCurtain () {
        gn('backdrop')!.setAttribute('class', 'modal-backdrop fade');
        setProps(gn('backdrop')!.style, {
            display: 'none'
        });
        gn('modaldialog')!.setAttribute('class', 'modal fade');
        setProps(gn('modaldialog')!.style, {
            display: 'none'
        });
    }

    static setLoadPage (pageid: string | null, whenDone: () => void) {
        ScratchJr.log('setLoadPage', ScratchJr.getTime(), 'sec');
        var pages = ScratchJr.stage.getPagesID();
        if (pages.indexOf(pageid!) < 0) {
            ScratchJr.stage.currentPage = ScratchJr.stage.pages[0];
        } else {
            ScratchJr.stage.currentPage = ScratchJr.stage.getPage(pageid!);
        }
        ScratchJr.stage.currentPage.div.style.visibility = 'visible';
        var list = ScratchJr.stage.pages;
        for (var i = 0; i < list.length; i++) {
            if (ScratchJr.stage.currentPage == list[i]) {
                ScratchJr.stage.currentPage.setPageSprites('visible');
            } else {
                list[i].setPageSprites('hidden');
            }
        }
        if (whenDone) {
            whenDone();
        }
    }

    static loadData (data: Record<string, unknown>, fcn: () => void) {
        try {
            data = (typeof data === 'string') ? JSON.parse(data) : data;
            _setMediaCount(0);
            Project.loadme(data, fcn);
            error = false;
        } catch (e) {
            console.log(e); //eslint-disable-line no-console
            var errorMessage = 'Error -- project data corrupted.';

            if (window.reloadDebug) {
                document.write((e as Error).message + '\n' + metadata!.json);
                return;
            }

            Alert.open(frame, gn('flip')!, errorMessage, '#ff0000');
            if (interval) {
                window.clearInterval(interval);
            }
            interval = null;
            Palette.selectCategory(1);
            // On Android 4.2, this comes up blank the first time, so try again in 100ms.
            setTimeout(function () {
                Palette.selectCategory(1);
            }, 100);
            Project.liftCurtain();
            error = true;
        }
    }

    static loadme (data: Record<string, unknown>, fcn: () => void) {
        Project.recreate(data);
        Project.loadwait(fcn);
    }

    static getLoadType (bkgid: string | null, sid: string | null, cid: string | null) {
        if (bkgid != null) {
            return 'bkg';
        }
        if (!cid) {
            return 'none';
        }
        if (sid && cid) {
            return 'modify';
        }
        return 'add';
    }

    //////////////////////////////////////////////////
    // load project data
    //////////////////////////////////////////////////

    static recreate (data: Record<string, unknown>) {
        ScratchJr.log('Project data structures start loading', ScratchJr.getTime(), 'sec');
        _setMediaCount(0);
        ScratchJr.stage.pages = [];
        var pages = data.pages as unknown[];
        pageid = data.currentPage as string;
        for (var i = 0; i < pages.length; i++) {
            Project.recreatePage(pages[i] as string, data[pages[i] as string] as Record<string, unknown>);
        }
        mediaCountBase = _getMediaCount();
    }

    static recreatePage (name: string, data: Record<string, unknown>, fcn?: () => void) {
        var page = new Page(name, data, fcn);
        page.div.style.visibility = 'hidden';
    }

    static substractCount () {
        _bumpMediaCount(-1);
        if ((gn('backdrop')!.className != 'modal-backdrop fade in') || (mediaCountBase == 0)) {
            return;
        }
        Project.setProgress(Project.getMediaLoadRatio(70));
    }

    static recreateObject (page: Page, name: string, data: Record<string, unknown>, callBack: (spr: Sprite) => void, active?: boolean) {
        var list = data.scripts as EncodedStrip[];
        //delete data.scripts;
        var spr;
        data.page = page;
        if (data.type == 'sprite') {
            _bumpMediaCount(1);
            var fcn = function (spr: Sprite) {
                spr.setPos(data.xcoor as number, data.ycoor as number);
                _bumpMediaCount(-1);
                if (gn('backdrop')!.className == 'modal-backdrop fade in') {
                    Project.setProgress(Project.getMediaLoadRatio(70));
                }
                ScratchJr.log(spr.name, ScratchJr.getTime(), 'sec');
                if (callBack) {
                    callBack(spr);
                }
            };
            if (!data.defaultScale) {
                data.defaultScale = 0.5;
            }
            spr = new Sprite(data, fcn);
            // load scripts
            var sc = getModelRefAs<Scripts>(gn(name + '_scripts')!, 'scripts')!;
            for (var j = 0; j < list.length; j++) {
                sc.recreateStrip(list[j]);
            }
            if (active) {
                sc.activate();
            } else {
                sc.deactivate();
            }
        } else {
            spr = new Sprite(data, callBack);
        }
        spr.div.style.opacity = String(spr.shown ? 1 : 0);
        return spr;
    }

    //////////////////////////////////////////////////
    // Save project data
    //////////////////////////////////////////////////

    static prepareToSave (id: string, whenDone: () => void) {
        if (saving) {
            Alert.open(frame, gn('flip')!, 'Waiting', '#28A5DA');
            Project.waitUntilSaved(id, whenDone);
        } else {
            Alert.open(frame, gn('flip')!, 'Saving', '#28A5DA');
            Project.save(id, whenDone);
        }
    }

    static waitUntilSaved (id: string, fcn: () => void) {
        if (saving) {
            setTimeout(function () {
                Project.waitUntilSaved(id, fcn);
            }, 500);
        } else {
            Project.save(id, fcn);
        }
    }

    // Determine if thumbnailMD5 is unique to projectID
    // callback(true/false)
    static thumbnailUnique (thumbnailMD5: string, projectID: string, callback: (isUnique: boolean) => void) {
        var json: DbSelectIntent = {
            op: 'select', table: PlatformBridge.database,
            items: ['name', 'thumbnail', 'id'],
            where: [
                { col: 'deleted', op: '=', value: 'NO' },
                { col: 'id', op: '!=', value: projectID },
                { col: 'gallery', op: 'IS NULL' },
            ],
        };
        IO.query(PlatformBridge.database, json, function (result: string) {
            var pdata = JSON.parse(result);
            var isUnique = true;
            for (var p = 0; p < pdata.length; p++) {
                var thispdata = IO.parseProjectData(pdata[p]);
                var th = thispdata.thumbnail;
                if (th) {
                    var thumb = (typeof th == 'string') ? JSON.parse(th) : th;
                    if (thumb && thumb.md5) {
                        if (thumb.md5 == thumbnailMD5) {
                            isUnique = false;
                        }
                    }
                }
            }
            callback(isUnique);
        });
    }

    static pendingSaveCallbacks: Array<() => void> = [];

    static save (id: string, whenDone?: () => void) {
        if (saving) {
            if (whenDone) {
                Project.pendingSaveCallbacks.push(whenDone);
            }
            return;
        }
        saving = true;
        var saved = false;
        // Safety timeout: if the async chain breaks, always reset saving
        var safetyTimer = window.setTimeout(function () {
            resetSaving();
        }, 15000);

        function resetSaving () {
            if (saved) return;
            saved = true;
            window.clearTimeout(safetyTimer);
            saving = false;
            if (whenDone) {
                whenDone();
            }
            const pending = Project.pendingSaveCallbacks.slice();
            Project.pendingSaveCallbacks = [];
            for (const cb of pending) {
                try {
                    cb();
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('Error in pending save callback:', e);
                }
            }
        }

        if (!metadata) {
            resetSaving();
            return;
        }

        var oldThumbMd5: string | null = null;
        if (metadata.thumbnail && ScratchJr.editmode !== 'storyStarter' && id !== 'new') {
            try {
                var th = metadata.thumbnail;
                var thumb = (typeof th === 'string') ? JSON.parse(th) : th as { md5?: string };
                if (thumb && thumb.md5 && thumb.md5.indexOf('samples/') < 0) {
                    oldThumbMd5 = thumb.md5;
                }
            } catch (_) {}
        }

        try {
            metadata.id = id;
            metadata.json = Project.getProject(ScratchJr.stage.pages[0].id);
            Project.getThumbnailPNG(ScratchJr.stage.pages[0], 192, 144, getMD5);
        } catch (_e) {
            resetSaving();
        }

        function getMD5 (dataurl: string) {
            var parts = dataurl.split(',');
            var pngBase64 = parts.length > 1 ? parts[1] : '';
            PlatformBridge.getmd5(pngBase64, function (str: string | null) {
                if (!str) {
                    resetSaving();
                    return;
                }
                savePNG(str, pngBase64);
            });
        }

        function savePNG (md5: string, pngBase64: string) {
            var projectName = ScratchJr.currentProject || 'unknown';
            var filename = projectName + '_' + md5;
            PlatformBridge.setmedianame(pngBase64, filename, 'png', doNext as (result: unknown) => void);
        }

        function doNext (md5: string) {
            if (!metadata) {
                resetSaving();
                return;
            }
            metadata.thumbnail = {
                'pagecount': ScratchJr.stage.pages.length,
                'md5': md5
            };
            metadata.mtime = (new Date()).getTime().toString();
            // IO.saveProject's ProjectRecord bag is structurally compatible with our metadata
            try {
                IO.saveProject(metadata as unknown as Parameters<typeof IO.saveProject>[0], function () {
                    const toRemoveMd5 = oldThumbMd5;
                    if (toRemoveMd5 && toRemoveMd5 !== md5 && ScratchJr.editmode !== 'storyStarter') {
                        Project.thumbnailUnique(toRemoveMd5, id, function (isUnique) {
                            if (isUnique) {
                                PlatformBridge.remove(toRemoveMd5, PlatformBridge.trace);
                            }
                        });
                    }
                    resetSaving();
                });
            } catch (_e) {
                resetSaving();
            }
        }
    }

    static getProject (pageid: string) {
        var obj: ProjectData = {
            pages: ScratchJr.stage.getPagesID(),
            currentPage: pageid,
            stblockStory: stblockStoryProgress
        };
        for (var i = 0; i < ScratchJr.stage.pages.length; i++) {
            obj[ScratchJr.stage.pages[i].id] = ScratchJr.stage.pages[i].encodePage();
        }
        return obj;
    }

    static getUndo () {
        return Project.getProject(ScratchJr.stage.currentPage.id);
    }

    static encodeSprite (name: string) {
        return (getModelRefAs<Sprite>(gn(name) as HTMLElement, 'sprite')!).getData();
    }

    static encodeStrip (b: Block | null) {
        var res: EncodedStrip = [];
        var hasargs = ['playsnd', 'gotopage', 'playusersnd', 'setcolor', 'onmessage', 'message', 'setspeed'];
        var loops = ['repeat'];
        var carets = ['caretcmd', 'caretend', 'caretstart'];
        while (b != null) {
            var bt = b.blocktype;
            // Don't encode carets in a strip
            if (carets.indexOf(bt) > -1) {
                b = b.next;
                continue;
            }
            if (bt == 'caretrepeat') {
                // Convert repeat carets to actual repeats for the encoding
                bt = 'repeat';
            }
            var arg = (b.arg != null) || (hasargs.indexOf(bt) > -1) ? b.getArgValue() as string | number : null;
            if (!arg && (arg != 0)) {
                arg = 'null';
            }
            var dx = b.div.left! / b.scale;
            var dy = b.div.top! / b.scale;
            var data: Array<string | number | EncodedStrip> = [bt, arg, dx, dy];
            if (loops.indexOf(bt) > -1) {
                var inside = Project.encodeStrip(b.inside);
                data.push(inside);
            }
            res.push(data);
            b = b.next;
        }
        return res;
    }

    /////////////////////////////
    // Project PNG Thumbnail
    /////////////////////////////

    static getThumbnailPNG (page: Page, w: number, h: number, fcn: (dataurl: string) => void) {
        var scale = w / 480;
        var data: Record<string, unknown> = {};
        data.pagecount = ScratchJr.stage.pages.length;
        var c = document.createElement('canvas');
        setCanvasSize(c, w, h);
        var ctx = c.getContext('2d')!;
        var md5 = page.md5;
        ctx.fillStyle = window.Settings!.stageColor;
        ctx.fillRect(0, 0, w, h);
        if (!md5) {
            Project.drawSprites(page, scale, c, w, h, fcn);
        } else {
            var pcnv;
            if (md5.substr(md5.length - 3) == 'png') {
                var bgimg = page.div.firstElementChild!.firstElementChild as HTMLImageElement;
                pcnv = Project.drawPNGInCanvas(bgimg, 480, 360);
            } else {
                pcnv = Project.drawSVGinCanvas(page.svg!, 480, 360);
            }
            ctx.drawImage(pcnv, 0, 0, 480, 360, 0, 0, w, h);
            Project.drawSprites(page, scale, c, w, h, fcn);
        }
    }
    static drawPNGInCanvas (png: HTMLImageElement, w: number, h: number) {
        var srccnv = document.createElement('canvas');
        setCanvasSize(srccnv, w, h);
        var ctx = srccnv.getContext('2d')!;
        ctx.drawImage(png, 0, 0, w, h);
        return srccnv;
    }

    static drawSVGinCanvas (extxml: Element, w: number, h: number) {
        var srccnv = document.createElement('canvas');
        setCanvasSize(srccnv, w, h);
        var ctx = srccnv.getContext('2d')!;
        for (var i = 0; i < extxml.childElementCount; i++) {
            SVG2Canvas.drawLayer(extxml.childNodes[i] as Element, ctx, SVG2Canvas.drawLayer);
        }
        return srccnv;
    }

    static maskBorders (ctx: CanvasRenderingContext2D, w: number, h: number) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        if (window.Settings!.edition != 'PBS') {
            ctx.drawImage(BlockSpecs.projectThumb, 0, 0, w, h);
        }
        ctx.restore();
    }

    static drawSprites (page: Page, scale: number, c: HTMLCanvasElement, w: number, h: number, fcn: (dataurl: string) => void) {
        var ctx = c.getContext('2d')!;
        doNext(1);
        function doNext (n: number) {
            if (!(n < page.div.childElementCount)) {
                Project.maskBorders(c.getContext('2d')!, w, h);
                fcn(c.toDataURL('image/png'));
            } else {
                var spr = getModelRefAs<Sprite>(page.div.childNodes[n] as HTMLElement, 'sprite')!;
                if (!spr || !spr.shown) {
                    doNext(n + 1);
                } else {
                    drawLoadedImage(page, ctx, spr.outline, spr, scale, n);
                }
            }
        }

        function drawLoadedImage (page: Page, ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, spr: Sprite, scale: number, n: number) {
            page.drawSpriteImage(ctx, img, spr, scale);
            doNext(n + 1);
        }

    }
}
