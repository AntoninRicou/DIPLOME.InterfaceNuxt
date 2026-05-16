# PHASE 2 — INTERACTION EVENT SYSTEM + SERVER LOGGING

## Goal

Introduce a typed interaction-event channel between `interface_nuxt` and the server,
with server-side logging keyed by session, **without changing any existing UI behavior**.

The UI stays optimistic and self-driven. Events are emitted *additively* after each
state mutation; the server is purely a passive recorder. No WebSocket, HTTP only.

This phase establishes the event vocabulary and ingress that the future WebSocket
broadcast layer (Phase 3) will adopt verbatim.

---

## Architectural invariants honored

* The server **never** controls UI state.
* The server **only** logs interaction events and (separately) computes relations.
* `interface_nuxt` updates UI optimistically and never waits for server confirmation.
* `interface_nuxt` never computes relations, UMAP, or proximity logic.
* All user actions are emitted as typed events to `/api/interaction`.
* Interaction state (VIEW flow, history, selection) is client-owned.
* Relational state is server-owned.
* `project` remains untouched and unaware of this phase.

---

## Task list completed

1. Define interaction event vocabulary as a TypeScript discriminated union
2. Add session identity (server-issued cookie)
3. Create `POST /api/interaction` endpoint with shape validation
4. Implement server-side logging (in-memory ring buffer per session)
5. Add `GET /api/interaction/log` debug endpoint
6. Build client emitter composable (`useInteractionEmitter`)
7. Wire emitter into the Pinia store (one event per state mutation)
8. Verify no regression: existing UI behavior intact, events appear in server log

---

## Files created

### `app/types/events.ts`

Discriminated union of every possible user action, plus a server-augmented log entry type.

```ts
type InteractionEvent =
  | ViewAdvanceEvent          // VIEW_n -> VIEW_n+1
  | CentralActivateEvent      // user picked a new central image
  | HistoryStepBackEvent      // <- back
  | HistoryStepForwardEvent   // forward ->
  | HistoryJumpEvent          // click any history entry

interface LoggedInteractionEvent {
  sessionId: string
  serverTimestamp: number
  event: InteractionEvent
}
```

Each event carries `clientTimestamp: number`. Each variant carries only the fields it needs
(e.g. `history_jump` includes `fromIndex`, `toIndex`, `toImageId`).

### `app/composables/useInteractionEmitter.ts`

A thin fire-and-forget POST wrapper.

* Does nothing on SSR (`import.meta.server` guard).
* Posts to `/api/interaction`. Never awaits, never throws.
* Network errors are logged to `console.warn` — they **must never** affect UI.

### `server/utils/session.ts`

`ensureSession(event)` — reads the `ix_session` cookie or issues a new UUID and sets the cookie.
The cookie has `httpOnly: false`, `sameSite: 'lax'`, `path: '/'`, 24h max-age.

### `server/utils/eventLog.ts`

In-memory ring buffer keyed by `sessionId`. Holds the last 200 events per session.

* `recordEvent(sessionId, event)` — appends, evicts oldest if buffer is full, logs to console.
* `getEventsForSession(sessionId, limit?)` — returns a copy of the buffer.

### `server/api/session.get.ts`

`GET /api/session` — returns `{ sessionId }`. Useful for the client to discover its own id
(or for debug purposes). Calls `ensureSession` so the cookie is set if missing.

### `server/api/interaction.post.ts`

`POST /api/interaction` — the single event ingress.

1. `ensureSession(event)` — attach or read session cookie.
2. `readBody(event)` — parse JSON body.
3. `isValidEvent(body)` — narrow validation per discriminant.
4. `recordEvent(sessionId, body)` — store + console-log.
5. Return `{ ok: true, sessionId, serverTimestamp }`.

Invalid shape → `400 invalid event shape`. The client emitter swallows this without surfacing
to the UI (errors are non-blocking).

### `server/api/interaction/log.get.ts`

`GET /api/interaction/log?session=<id>&limit=<n>` — debug endpoint to inspect recent events
for a given session. Defaults to the current cookie session and 50 events.

---

## Files modified

### `app/stores/interaction.ts`

Every state-mutating action now emits the matching event *after* its optimistic mutation:

| Action                  | Event(s) emitted                                  |
| ----------------------- | ------------------------------------------------- |
| `selectImage(id)`       | `central_activate (source: initial)` + `view_advance (VIEW_1 -> VIEW_2)` |
| `enterRelationalView()` | `view_advance (VIEW_2 -> VIEW_3)`                 |
| `activateCentral(id)`   | `central_activate (source: related)`              |
| `stepBackInHistory()`   | `history_step_back`                               |
| `stepForwardInHistory()`| `history_step_forward`                            |
| `jumpToHistory(i)`      | `history_jump`                                    |

The emit calls are guarded by the same early-returns as the mutations, so no event fires
if the action is a no-op (e.g. `stepBack` at index 0).

State shape, getters, and all UI bindings are unchanged. The store's only addition is
the `useInteractionEmitter` import and the `emit({...})` calls.

---

## Data flow

```
user click in VIEW-N component
        │
        ▼
   store action (optimistic mutation)
        │
        ├──► UI re-renders immediately (Pinia reactivity)
        │
        └──► emit({...event}) — fire-and-forget
                    │
                    ▼
              POST /api/interaction
                    │
                    ├── ensureSession (cookie)
                    ├── isValidEvent (400 if invalid)
                    └── recordEvent
                            │
                            ├── ring buffer (sessionId)
                            └── console.log
```

The path from "user click" to "UI updated" is the store action alone. The emit is
parallel and never blocks rendering.

---

## API surface added

| Method | Path                              | Purpose                             |
| ------ | --------------------------------- | ----------------------------------- |
| GET    | `/api/session`                    | Read or create the session cookie   |
| POST   | `/api/interaction`                | Ingress for typed interaction events |
| GET    | `/api/interaction/log`            | Debug — recent events for a session |

`/api/relations/[componentId]?centralImageId=…` and `/api/mapping` are **unchanged**.

---

## What did NOT change

* The Pinia state shape.
* The VIEW state machine semantics.
* `/api/relations/[componentId]` — components still fetch their own relations directly.
* `assets/mock/umap_component_*.json` shape and the `pickRelations` function (still mock random).
* Any file inside `project/`.
* The 2x2 layout, the VIEW-3 sidebar, or any component template logic.

---

## How to verify

With the dev server running (`npm run dev` from `interface_nuxt/`):

1. Open `http://localhost:3050/` — should render VIEW-1 with no console errors.
2. Click an image → expect `central_activate` (source `initial`) + `view_advance (VIEW_1 -> VIEW_2)`
   in the server console.
3. Wait 3 s (or click "enter relational view") → expect `view_advance (VIEW_2 -> VIEW_3)`.
4. In VIEW-3, click a related image → expect `central_activate (source: related)`.
5. Use `← back` / `forward →` / click a history entry → expect the matching
   `history_step_back` / `history_step_forward` / `history_jump`.
6. Visit `http://localhost:3050/api/interaction/log?limit=50` to inspect the full session tape.

---

## What Phase 3 will build on top of this

* The event ingress (`POST /api/interaction`) becomes the trigger that drives the
  WebSocket broadcast — same body shape, same validation, same `recordEvent`.
* The session cookie identifies which subscriber group receives the broadcast.
* The synchronized payload that the server will push to subscribers will reference the
  same `InteractionEvent` discriminator vocabulary defined here.

No part of Phase 2 needs to be revisited or migrated for Phase 3.
