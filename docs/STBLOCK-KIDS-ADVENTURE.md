# STBlock Kids adventure bridge

The embedded ScratchJr editor remains the execution engine for Kids story mode. `STBLOCK_KIDS_STORY.configureLevel(config)` applies the current map, movement calibration, actors, objects, and challenge. Scene entities are non-model DOM overlays placed in the 480×360 page coordinate system; they have `pointer-events: none` and never enter the sprite library or project serialization.

## Scene data

`actors` and `objects` are arrays with stable `id`, `name`, `col`, `row`, and optional `image`, `icon`, `scale`, and `size` fields. Actors also support `motion: "idle"`, `"bob"`, or `"path"`; path motion advances one configured `[column,row]` point after each completed player movement. A carryable actor or item follows the player between cells. `locked` is descriptive; the DOM layer itself is not draggable or selectable.

Object kinds used by the mission bridge:

- `obstacle`: visual marker; collision rules are evaluated from the level's `blocked` cells.
- `checkpoint`: visual marker; ordered checkpoint rules use the calibration's checkpoint list.
- `item`: can be picked up when the player is in its cell if `carryable` is true.
- `interactable`: responds to the `interact` block when the player is in its cell.
- `mechanism` and `soundTarget`: visual/animated scene elements; the mission evaluates their required block or action.

For delivery, an item can define `deliverCol` and `deliverRow`. The `drop` action leaves it in the current cell and records whether the target cell matched.

## Runtime telemetry

`STBLOCK_KIDS_STORY` exposes `recordBlock(opcode)`, `recordAction(action)`, `performAction(type)`, `canReceiveMessage(value)`, `getMovementTrace()`, and `getRunTelemetry()`. `Runtime` sends the final position, ordered cell trace, ordered successful/failed action records, and block usage to the parent in `STBLOCK_KIDS_STORY_RUN_FINISHED` after the main green-flag scripts finish.

The parent challenge manifest validates final goal, ordered checkpoints, forbidden cells, required executed blocks/sequences, and required ordered actions. A failed condition leaves the ScratchJr program intact for another attempt. `resetRun()` clears attempt telemetry, restores the player to the calibrated start cell, resets actor paths, removes carried state, and returns mission objects to their configured positions. It runs at every green-flag start.

In Story mode, direct pointer dragging and long-press character deletion are disabled on the stage. Characters move only through their programs; other modes retain their normal stage gestures.

## Custom mission blocks

`pickup`, `drop`, and `interact` are native ScratchJr block definitions backed by `Prims.ts` operations and are serialized like other block types. `BlockSpecs.configureStoryPalette(challenge)` rebuilds the Kids story palette when a level loads, exposing only the movement, flow, sound, message, or object-action blocks required by that challenge. Libre and Robot retain their own palettes.

## Cross-platform notes

The bridge uses DOM, local asset URLs, and the shared renderer APIs only. It has no browser-only canvas, filesystem, Bluetooth, or host IPC dependency. `configureLevel` is provided by the renderer for Web, Desktop, and Android builds.
