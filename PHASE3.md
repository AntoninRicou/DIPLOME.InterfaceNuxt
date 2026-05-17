# PHASE 3 — SOCKET ADAPTER TO LEGACY RELAY

## Goal

Connect `interface_nuxt` to the **existing** socket.io relay server (`server/server.js`
on port 3001) as a second `interface`-role client, so the new UI can drive `project`
through the same rendering-directive protocol the legacy `interface/` controller already
uses.

This is an **adapter**, not a migration. Both controllers can run in parallel.
`project/`, `interface/`, and `server/server.js` are untouched.

---

## Architectural invariants honored

* The socket layer is a **transport only** — never a state system, never an event bus.
* Only **validated user state changes** become socket commands; not every interaction event.
* `/api/interaction` (Phase 2) remains the full behavioral trace — independent of the socket.
* Socket emissions are **explicit, action-level** — no reactive watchers, no derived
  side effects. Each socket command is traceable to one line in one Pinia action.
* `interface_nuxt` updates UI optimistically; socket emit is fire-and-forget and never blocks UI.
* The legacy `interface/` controller is fully preserved and continues to work in parallel.

---

## Task list completed

1. Add `socket.io-client` dependency + `runtimeConfig.public.socketUrl`
2. Build `useProjectSocket` composable (singleton client, role `'interface'`, `focus(id)` only)
3. Initialize socket once at app start via a client-only Nuxt plugin
4. Wire `central_activate` → `focus(id)` at action-level in the Pinia store
5. End-to-end validation: focus messages confirmed flowing from `interface_nuxt` to relay,
   received by a CLI listener acting as `project`

Side task: installed `@types/node` as a devDependency to clear IDE-only `process`/`node:*`
type errors. No runtime impact.

---

## Files created

### `app/composables/useProjectSocket.ts`

Thin wrapper around `socket.io-client`. Module-level singleton (matches the legacy
`interface/src/api.js` shape).

* Reads `SOCKET_URL` from `useRuntimeConfig().public.socketUrl`.
* `init()` — opens the socket once; subsequent calls are no-ops.
* On connect, registers with role `'interface'` (the only non-`project` role the relay
  accepts — see `server/server.js` line 5: `ROLES = new Set(['project', 'interface'])`).
* `focus(id)` — emits `socket.emit('message', { type: 'focus', payload: { id } })`.
  Silently drops if not connected (matches legacy `send()` semantics).
* `isConnected()` — boolean for optional status indicators.
* SSR-safe: every method guards on `import.meta.server` and returns without side effects.

Out of scope: `focusRandom`, `setState`, `simulatePath`, `clearPath` — those legacy verbs
are intentionally not exposed in `interface_nuxt` yet. Will be added if and when needed.

### `app/plugins/projectSocket.client.ts`

A client-only Nuxt plugin that calls `useProjectSocket().init()` once at app start.

This guarantees the socket connection is established before any store action runs, so
the first `focus(id)` from a VIEW-1 click can hit a live connection. The plugin is
client-only (filename suffix `.client.ts`) — the server has no business connecting
to its own peer relay.

---

## Files modified

### `nuxt.config.ts`

Added:

```ts
runtimeConfig: {
  public: {
    socketUrl: process.env.NUXT_PUBLIC_SOCKET_URL || 'http://localhost:3001',
  },
},
```

Override at build/dev time via the `NUXT_PUBLIC_SOCKET_URL` environment variable.

### `app/stores/interaction.ts`

Imported `useProjectSocket` and added **exactly two** `projectSocket.focus(id)` calls,
both at action-level after the optimistic mutation and after the `/api/interaction` emit:

| Action site             | Why                                                  |
| ----------------------- | ---------------------------------------------------- |
| `selectImage(id)`       | VIEW-1 selection — the first central image           |
| `activateCentral(id)`   | VIEW-3 related-image click — new central image       |
| `stepBackInHistory()`   | VIEW-3 back — central image resolves to a past node  |
| `stepForwardInHistory()`| VIEW-3 forward — central image resolves to a forward node |
| `jumpToHistory(i)`      | VIEW-3 history-entry click — central jumps to that node |

History sites were added in **Phase 3b** after the initial adapter was confirmed stable.
Each emits `projectSocket.focus(activeCentralImageId)` after the optimistic mutation
settles — same explicit, action-level pattern as `central_activate`.

Deliberately **not** wired:

* `enterRelationalView()` (VIEW-2 → VIEW-3 transition)
* Any `view_advance`

The user directive: socket commands should only correspond to **explicit, validated
user state changes** that map to a render directive `project` already understands.
A view transition isn't a render directive on its own — it's a metadata change.

### `package.json`

* Added: `socket.io-client` (dependency)
* Added: `@types/node` (devDependency) — IDE-only fix for `process` / `node:*` typing

---

## Mapping rules (current)

| Interaction event (Phase 2 vocabulary) | Socket command emitted   |
| --------------------------------------- | ------------------------ |
| `central_activate` (source: `initial`)  | `focus({ id })`          |
| `central_activate` (source: `related`)  | `focus({ id })`          |
| `history_step_back`                     | `focus({ id })` (Phase 3b) |
| `history_step_forward`                  | `focus({ id })` (Phase 3b) |
| `history_jump`                          | `focus({ id })` (Phase 3b) |
| `view_advance`                          | —                        |

The HTTP `/api/interaction` log still records **all** of these — the socket map is
narrower by design.

---

## Data flow

```
user click in VIEW-1 / VIEW-3
        │
        ▼
   Pinia store action (selectImage / activateCentral)
        │
        ├──► local state mutation       ───► UI re-renders (optimistic)
        │
        ├──► emit({...event})           ───► POST /api/interaction
        │                                       └──► server-side ring buffer (Phase 2)
        │
        └──► projectSocket.focus(id)    ───► socket.io 'message'
                                                └──► relay (server/server.js:3001)
                                                        └──► broadcast to 'project' room
                                                                └──► project visualizes
```

Three channels, three independent destinations. None blocks the others. None blocks the UI.

---

## What did NOT change

* `app/types/events.ts`, `app/composables/useInteractionEmitter.ts`,
  `server/api/interaction.post.ts`, `server/utils/eventLog.ts` — Phase 2 untouched.
* `/api/relations/[componentId]`, `/api/mapping`, the 4 UMAP files — Phase 1/UMAP work untouched.
* Any file inside `interface/`, `project/`, or `server/` (relay server).
* The `ROLES` allowlist in `server/server.js` — still `{'project', 'interface'}`.
* The VIEW state machine, history model, or Pinia state shape.

---

## How to verify

1. Start the relay: `node server/server.js` from the repo root (listens on `:3001`).
   Confirm with `curl http://localhost:3001/health` → `{ "ok": true, "clients": N }`.
2. Start `project/` (your usual way) — it registers as role `project`.
3. Start `interface_nuxt`: `npm run dev` from `interface_nuxt/` → `:3050`.
4. Open `http://localhost:3050/` in a browser, open DevTools console.
   Expect: `[socket] registered { ok: true, role: 'interface' }`.
5. Click an image in VIEW-1 → `project` should focus on that image.
6. In VIEW-3, click a related image in any panel → `project` should focus on it.
7. Click `← back` / `forward →` / a history entry → **no** socket traffic
   (only the Phase 2 HTTP log records these).
8. (Optional) Start the legacy `interface/` too — both controllers share the
   `interface` room. `project` accepts focus events from either, identified by
   `from: 'interface'` in both cases.

---

## What Phase 4 (or later) might build on top

* Map `view_advance` to `set-state(name)` if `project` should react to view transitions.
* Replace the mock `pickRelations` random pick with Euclidean nearest-neighbor on the
  UMAP coordinates (deferred until 4 distinct UMAPs land — until then, real NN would
  collapse the perceptual divergence across VIEW-3 components).
* Add an outbound channel for camera targets, paths, or other rendering directives
  that don't yet exist in the legacy protocol (e.g. `path-simulate`, `focus-random`).

None of these require revisiting Phase 3. The adapter pattern is additive —
each new mapping is one more explicit `projectSocket.foo(args)` call at one action site.
