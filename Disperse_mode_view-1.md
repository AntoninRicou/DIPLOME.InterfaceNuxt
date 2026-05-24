# Disperse Mode — Reference for Re-Use

A brief spec of the "disperse" / "RANDOM" projection mode in this project, for re-implementation elsewhere. **Position behaviour only** — no texture effect.

## Visual effect

When the user enters disperse mode:

1. **Burst spawn** — all thumbnails snap to the centre of the canvas, then fly outward to random positions on a filled disc, each with its own delay (0–140 ms) and easing duration (420–640 ms, `easeOutCubic`). The result is an organic explosion, not a synchronised pop.
2. **Endless drift** — once each thumbnail reaches its target, it starts wandering slowly around that anchor. The drift is the sum of two sine + two cosine waves with per-image randomised frequencies and phases, so no two thumbnails ever sync up. The cloud feels alive and slightly chaotic, without any global rotation.

On exiting the mode, thumbnails tween back to their pre-disperse projection coordinates.

## Two phases, two pieces of state

| Phase            | What it does                                                 | Key state                            |
| ---------------- | ------------------------------------------------------------ | ------------------------------------ |
| Enter (spawn)    | Snap meshes to centre, animate to random disc targets         | `dispersedTargets`, `startPositions` |
| Steady (drift)   | Each mesh wanders around its anchor via per-image wave params | `originalPositions`, `driftParams`   |

When the mode is left, both animation frames are cancelled and meshes are returned to the positions saved on entry.

## Spawn target distribution

Use a **disc**, not a square — the cloud should look round regardless of viewport aspect:

```js
const angle  = Math.random() * Math.PI * 2;
const radius = Math.sqrt(Math.random()) * spawnRadius;  // sqrt → uniform area
const x = Math.cos(angle) * radius;
const y = Math.sin(angle) * radius;
```

`spawnRadius ≈ 1.18` works well in a world that spans `[-1, 1]` on the short axis. The `sqrt(random())` is important — without it, points cluster towards the centre.

## Drift formula

Each thumbnail gets a one-off random set of parameters when entering the mode. Then on every frame:

```js
const t = elapsedSeconds / MOVE_SPEED;       // MOVE_SPEED ≈ 15 s per cycle (slow!)
const waveX = (sin(t * f1x + p1x) * 0.6 + cos(t * f2x + p2x) * 0.4) - baseX;
const waveY = (cos(t * f1y + p1y) * 0.6 + sin(t * f2y + p2y) * 0.4) - baseY;
mesh.x = anchorX + waveX * MOVE_DISTANCE;    // MOVE_DISTANCE ≈ 0.8
mesh.y = anchorY + waveY * MOVE_DISTANCE;
```

Per-image randomised params:
- `f1x, f1y ∈ [0.05, 0.21]` — primary wave frequencies
- `f2x, f2y ∈ [0.02, 0.12]` — secondary wave frequencies
- `p1x, p1y, p2x, p2y ∈ [0, 2π]` — phases
- `baseX, baseY` — the value of the wave formula at `t=0`. Subtracting it ensures every thumbnail *starts* exactly at its anchor and only diverges over time. Without this subtraction the whole cloud jumps at mode entry.

Bounds: **none**. Thumbnails are allowed to drift off-screen. The slow `MOVE_SPEED` and modest `MOVE_DISTANCE` keep most of them visible most of the time, but the lack of clamping is what gives the mode its "freely wandering" feel.

## Host-project requirements

The minimum the new project must already provide:

- A flat list of mesh-like objects, one per image, each with a 2D `position`.
- A `requestAnimationFrame`-driven render loop.
- A way to know when the user enters / leaves disperse mode (state flag, button handler, etc.).
- A camera centred near the origin with a world half-height ≈ 1; otherwise scale `spawnRadius`, `MOVE_DISTANCE` etc. proportionally.

## Port checklist

1. On mode-enter:
   - Save current mesh positions (for later restore).
   - Generate `dispersedTargets` on the disc.
   - Generate `driftParams` per mesh (random frequencies, phases, and the `baseX/baseY` baseline).
   - Animate meshes from `(0, 0)` to their target with staggered delay and `easeOutCubic`.
   - After spawn completes, set each mesh's anchor to its current position and start the drift loop.
2. Drift loop (`requestAnimationFrame`):
   - For each mesh, evaluate the wave formula above and set `position` = `anchor + offset`.
3. On mode-exit:
   - Cancel both animation frames.
   - Tween (or snap) positions back to the saved pre-disperse coordinates.

## Constants to copy

```js
const DISPERSE_MOVE_SPEED    = 15;    // seconds per wave cycle
const DISPERSE_MOVE_DISTANCE = 0.8;   // wander radius around anchor (world units)
const SPAWN_RADIUS           = 1.18;  // burst radius (world units)
const SPAWN_DELAY_MAX_MS     = 140;   // jitter per mesh
const SPAWN_DURATION_MS      = [420, 640];  // [min, max] easing duration
```

Tune `MOVE_DISTANCE` and `SPAWN_RADIUS` to your world scale if your camera isn't `[-aspect, aspect] × [-1, 1]`-ish.

## Source

Original implementation: `image-explorer/frontend/js/projection/points.js`:
- Mode enter / spawn: `setProjectionMode("RANDOM")` branch (around line 1011)
- Drift: `animateDisperseMovement()` (around line 825)
