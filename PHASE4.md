# PHASE 4 — DETERMINISTIC PROJECT-STATE MODEL

## Goal

Replace the Phase 3 / 3b emergent socket-emission pattern (just `focus(id)`
per interaction) with an **explicit, deterministic render-state model**
driven by `interface_nuxt`. `project` is a pure renderer of the state it is
told to be in; it never infers or interprets `VIEW`, `imageClick`, or any
progression rule.

The render-state vocabulary is **project's own**, not interface's: `single`
/ `split` / `overview`. The wire emits these names verbatim.
`interface_nuxt` owns the interaction-phase vocabulary (`VIEW_1` / `VIEW_2`
/ `VIEW_3`) and decides *which render state to emit, and when*, but never
sends interaction vocabulary on the wire. **VIEW ≠ STATE**: VIEW is an
interaction phase, STATE is a render state; there is no 1:1 correspondence
(VIEW-2, for instance, has no corresponding render state — it is the UI
mirror of an in-flight `single → split` morph).

Wire emissions are **triggered by interface event handlers** —
`selectImage`, `enterRelationalView`, `activateCentral`,
`confirmOverview`, the `onRegister` handshake callback, and the
history-nav actions. These handlers may reference store state
(`currentView`, `imageClick`, `historyIndex`, `overviewConfirmed`) as
**read-only decision context at execution time** — to branch on overview
confirmation, the branch-depth cap, the VIEW guard, etc. They do not derive
the emission *from* state reactively; emissions are imperative, fired at
the moment a handler runs.

The wire protocol (`set-state(name)` and `focus(id)`) does **not** change;
only the names and the emission rules do.

---

## Architectural invariants honored

* `interface_nuxt` owns `VIEW` + `imageClick` + `historyIndex` +
  `overviewConfirmed` and decides every emission.
* The socket is **transport only** — it never carries `VIEW` or `imageClick`
  directly, only the resolved `set-state(name)` and `focus(id)` directives.
* `project` is a pure deterministic renderer of `(state, focus(id), time)`.
* The system is deterministic, not emergent: given the same sequence of user
  selections, the same sequence of socket emissions occurs.
* `/api/interaction` (Phase 2 HTTP log) continues to record the **full**
  behavioral trace including history navigation. It is independent of the
  socket.
* History navigation is a **UI-level behavior** that produces only
  `focus(id)` commands on the wire. It does not participate in render-state
  transitions and is not part of the project state machine.

---

## System model

Three strict layers:

1. **Project (render engine)** — render states only: `single` / `split` /
   `overview`. Reacts to `set-state(name, duration?)`. No knowledge of VIEW
   or UI logic.
2. **interface_nuxt (UI orchestrator)** — interaction phases: `VIEW_1` /
   `VIEW_2` / `VIEW_3`. No 1:1 mapping with render states. Decides when to
   emit wire commands.
3. **Camera (focus system)** — single command: `focus(id)`. Independent
   from render state.

Wire protocol — only two commands:

* `set-state(name, duration?)` → project render state
* `focus(id)` → camera movement only

> **Project-internal note.** Project's `STATES` table also defines a
> `disperse` render state. `interface_nuxt` deliberately never emits it; it
> is project-internal and reserved for project's own future use.

---

## Render-state transitions (`set-state` emissions)

These are the **only** moments `interface_nuxt` emits `set-state` on the
wire.

| Interaction event                                                   | Wire emission                |
| ------------------------------------------------------------------- | ---------------------------- |
| socket-register bootstrap (no clicks yet, `imageClick = 0`)         | `set-state('single')`        |
| first VIEW-1 click                                                  | `set-state('split', 4500)`   |
| user explicitly confirms overview while at branch depth `>= 10`     | `set-state('overview')`      |

VIEW-2 emits nothing on the wire — the morph kicked off at VIEW-1 is
already in flight, and the camera target was bound in the same click-time
emission bundle (see *Camera channel* below). VIEW-3 entry emits no
`set-state` — it produces only an idempotent re-assertion of the camera
command.

`overview` is never triggered automatically by reaching depth 10; the
threshold only makes the state *eligible* for user confirmation. Branch
depth is `historyIndex + 1`, bounded to `[1..10]` (see *Bounded active
branch* below).

---

## Camera channel (`focus` emissions)

`focus(id)` is the camera command. It is **orthogonal to render state** —
the camera follows the requested id regardless of which render state
project is in. Emissions happen at the following interaction events:

| Interaction event                                              | Wire emission              |
| -------------------------------------------------------------- | -------------------------- |
| first VIEW-1 click (co-emitted with `set-state('split', …)`)   | `focus(storedImageId)`     |
| VIEW-3 entry (timer or skip)                                   | `focus(storedImageId)` (idempotent re-assertion) |
| VIEW-3 related-image click (`activateCentral`, pre-overview)   | `focus(newImageId)`        |
| history nav (`stepBack` / `stepForward` / `jumpToHistory`)     | `focus(historicalId)`      |
| post-overview `activateCentral` (wire-log artifact, see below) | `focus(id)`                |

`focus(id)` is fire-and-forget. It does **not** change render state, does
**not** affect `imageClick`, and is **not** subject to the branch-depth
cap. After `overview` is confirmed, `focus(id)` may continue to fire on
`activateCentral` calls as a wire-log artifact, but `project` **must not**
use it for spatial rendering or any state change in the terminal `overview`
state.

---

## `imageClick` — session-level selection counter (final rules)

`imageClick` is a **strictly monotonic, session-wide selection counter**.
Within the wire-emission logic it serves a single structural role:
distinguishing pre-selection (`imageClick === 0` → project is in `single`)
from post-selection (`imageClick > 0` → project has been told to morph
into `split`). Beyond this boot gate, `imageClick` is a pure session-level
event counter recorded only for `/api/interaction` telemetry. It is never
used as a driver for any state transition, VIEW logic, or overview
eligibility. See *Bounded active branch* and *overview eligibility &
confirmation* below.

It counts only new image selection events:

* VIEW-1 selection (the first image): **+1**
* VIEW-3 `central_activate` (related-image click): **+1**, but only while
  `overviewConfirmed === false` **and** the activation actually extends the
  active branch (i.e. the branch is not at its depth cap)
* History navigation (`stepBack`, `stepForward`, `jumpToHistory`): **no change**
* VIEW transitions themselves: **no change**
* `confirmOverview()`: **no change**
* Any `activateCentral` call after overview confirmation, or any
  `activateCentral` call refused by the branch-depth cap: **no change**

---

## Wire behavior notes

**VIEW-2** is a UI-only buffer phase. During VIEW-2 the socket emits
**nothing** — project is already morphing into `split` because that
emission fired at the VIEW-1 click moment, and project's camera has been
tracking `storedImageId` since the same click (focus is co-emitted with
`set-state` at click time). VIEW-2's auto-advance timer mirrors the same
`SPLIT_TRANSITION_MS` value used in the initial `set-state('split',
duration)` emission, ensuring UI and project remain visually aligned **by
convention, not by shared runtime state**. VIEW-2 can be exited by either
the auto-advance timer or an explicit user skip — both exits emit
`focus(storedImageId)` as an idempotent re-assertion at VIEW-3 entry; only
the moment differs.

**VIEW-3 entry emits no `set-state`.** The morph that was kicked off at the
VIEW-1 click is already in flight (or already complete), and the camera
target is already bound. VIEW-3 entry re-emits `focus(storedImageId)` as an
idempotent re-assertion — project's `focusOn` is idempotent, so this is a
no-op confirmation rather than a first-time binding. If the user skipped
VIEW-2 early, project's morph naturally truncates on its side — no second
`set-state` is needed.

**History navigation** is a UI-level behavior that produces only
`focus(id)` commands on the wire. It does not participate in render-state
transitions and is not part of the project state machine. (Originally
Phase 4 made history socket-silent; only the camera channel was re-enabled
shortly after — no render-state or state-machine semantics were affected.)

---

## Bounded active branch

Navigation history inside VIEW-3 is a **bounded, mutable active branch**, not
an unbounded historical log. The branch has a hard maximum depth of
`OVERVIEW_THRESHOLD = 10` entries.

* Each new VIEW-3 `activateCentral` appends to `navigationHistory` and advances
  `historyIndex` to the new tip.
* If `historyIndex` is not at the tip when a new image is activated, the
  forward portion is **destroyed**: `navigationHistory` is truncated to
  `[0..historyIndex]` and the new image is appended. Discarded forward
  branches are not retained.
* The branch is capped at 10 entries. Once `navigationHistory.length === 10`
  and `historyIndex` is at the tip, `activateCentral` cannot append further.
  The user must either confirm overview or step back to make room for a new
  sub-branch.
* History navigation (`stepBack`, `stepForward`, `jumpToHistory`) only moves
  `historyIndex`; it never adds, removes, or reorders entries.

Conceptually, the displayed path is always the **currently reconstructed
active traversal**, not a record of every image the user has ever activated.
Active branch depth (`historyIndex + 1`, `[1..10]`) is the meaningful
progression measure for VIEW-3 and the input to overview eligibility.
`imageClick` is preserved as a session-level selection trace only and is
**not** an unbounded "how far have we come" gauge.

---

## overview eligibility & confirmation

Two pieces of store state:

* `overviewEligible` (derived): `true` when the **currently active branch
  depth** is at or above the threshold AND overview has not yet been
  confirmed. Concretely:
  `historyIndex + 1 >= OVERVIEW_THRESHOLD && !overviewConfirmed`.
* `overviewConfirmed` (boolean flag): `false` initially; set to `true`
  exactly once by the `confirmOverview()` store action.

**`imageClick` and `overviewEligible` are not conflated.** `imageClick` is a
monotonic, session-level selection counter and never decreases. Eligibility
is **branch-dependent** — derived from the user's current position in the
bounded active branch. The two diverge any time the user steps backward in
history or activates a new image from an earlier position (which rewrites
the forward portion of the branch).

| Quantity            | Type                  | Bounds   | Mutates on history nav? | Drives overview eligibility? |
| ------------------- | --------------------- | -------- | ----------------------- | ---------------------------- |
| `imageClick`        | session selection log | `[0, ∞)` | No                      | No                           |
| `historyIndex + 1`  | active branch depth   | `[1, 10]`| **Yes**                 | **Yes**                      |

Concrete pre-confirmation behavior:

* Reaching branch depth 10 surfaces the "confirm overview" button. The
  branch is at its cap; no further appends are accepted.
* Stepping back below depth 10 hides the button — eligibility is recomputed
  on every history change.
* Returning to depth 10 (via `stepForward`, `jumpToHistory`, or by activating
  new images from an earlier position to rebuild a sub-branch back to 10)
  re-enables the button.
* `imageClick` keeps climbing across all of the above; it is irrelevant to
  visibility.

(Originally Phase 4 keyed eligibility off `imageClick >= 10` and treated
`navigationHistory` as unbounded. Both were later revised: navigation is now
a bounded mutable branch capped at 10, and eligibility tracks the active
branch depth rather than cumulative session activity. The irreversible
portion of overview — set by `confirmOverview()` — still uses
`overviewConfirmed === true` as its sole and final latch, exactly as
before.)

When the user explicitly confirms:

1. `overviewConfirmed = true`
2. `set-state('overview')` emitted exactly once over the socket
3. `imageClick` is **not** touched

After confirmation `overview` is **terminal and irreversible** for the rest
of the session — no further `set-state` emissions occur, `imageClick` is
frozen, and `overviewEligible` collapses to `false` regardless of branch
depth.

---

## Defensive structural guard

The post-overview mutation prohibition for `activateCentral` is enforced
**structurally**, not by scattered conditional checks. The function uses a
hard early-return guard placed immediately after the precondition checks:

```ts
function activateCentral(id) {
  if (currentView.value !== 'VIEW_3') return
  if (activeCentralImageId.value === id) return

  // ── HARD GUARD — terminal overview state. No mutation below. ──
  if (overviewConfirmed.value) {
    emit({ /* central_activate trace */ })   // /api/interaction log
    projectSocket.focus(id)                  // wire log only
    return
  }

  // ── Pre-overview only. Provably unreachable post-confirmation. ──
  navigationHistory.value = ...
  imageClick.value += 1
  // ...
}
```

One guard, one return. The mutation block is a single contiguous region after
the guard. No per-mutation flag plumbing. Accidental mutation is impossible by
construction.

---

## Files modified

### `app/stores/interaction.ts`

* State: `currentView` (`ViewState`), `navigationHistory` (`ImageId[]`,
  the **persisted stack**), `historyIndex` (number, the active-position
  pointer — **active branch logic is derived exclusively from
  `historyIndex`**), `activeCentralImageId` (nullable `ImageId`),
  `imageClick` (number), `overviewConfirmed` (boolean).
* Derived: `overviewEligible` (boolean — keyed off
  `historyIndex + 1 >= OVERVIEW_THRESHOLD && !overviewConfirmed`, i.e. the
  **active branch depth**, *not* cumulative `imageClick`). Note: no
  `projectState` computed — interface does not maintain a parallel
  render-state value (see *Vocabulary realignment* below).
* Action: `confirmOverview()` — gated by `overviewEligible`; sets the flag
  and emits `set-state('overview')` exactly once.
* `selectImage`: increments `imageClick` (0 → 1), advances VIEW_1 → VIEW_2,
  and emits a coupled pair: `projectSocket.setState('split',
  SPLIT_TRANSITION_MS)` to kick off the `single → split` morph, and
  `projectSocket.focus(id)` to bind project's camera target at the click
  moment. Both directives fire in the same handler so the morph and the
  camera convergence are co-causal with the user's selection.
* `enterRelationalView`: advances to VIEW_3 and re-emits
  `projectSocket.focus(activeCentralImageId)` as an idempotent re-assertion.
  **No `set-state`** — the morph is already in flight from the VIEW-1
  click, and `focusOn` is idempotent on project's side, so this is a
  defensive confirmation rather than a first-time binding.
* `activateCentral`: pre-overview path increments `imageClick`, truncates
  `navigationHistory` to `[0..historyIndex]`, appends the new id, and
  advances `historyIndex` to the new tip. Post-overview guard is a hard
  early-return that only logs (no mutation). A second structural guard
  caps the active branch by checking `historyIndex + 1 >= OVERVIEW_THRESHOLD`:
  when the branch is at its cap, further activations log to
  `/api/interaction` for telemetry but neither mutate the store nor emit
  on the socket. Discarded forward portions of the branch (truncated by
  activating from a non-tip position) are not retained.
* `stepBackInHistory` / `stepForwardInHistory` / `jumpToHistory`: move
  `historyIndex` only (never mutate `navigationHistory`), then emit
  `projectSocket.focus(activeCentralImageId)` so the camera follows. They
  do **not** emit `set-state` and do **not** touch `imageClick`. Phase 2
  `/api/interaction` events are emitted as well.
* Constants: `SPLIT_TRANSITION_MS = 4500`,
  `VIEW_2_AUTO_ADVANCE_MS = SPLIT_TRANSITION_MS`, `OVERVIEW_THRESHOLD = 10`
  (also serves as the active-branch depth cap).

### `app/composables/useProjectSocket.ts`

* `setState(name, duration?)` — emits
  `socket.emit('message', { type: 'set-state', payload: { name, duration? } })`.
  Same fire-and-forget semantics as `focus()`. The composable does not
  constrain `name`; the caller is responsible for using project's
  vocabulary (`single` / `split` / `overview`).
* `onRegister(cb)` — registers a callback that fires when the relay
  acknowledges the `register` handshake. Used by the plugin to emit the
  boot state.

### `app/plugins/projectSocket.client.ts`

* Subscribes via `onRegister(() => setState('single'))` so `project` is
  told its boot state the moment the relay acknowledges registration.

### `app/components/views/View3Relational.vue`

* Sidebar shows the bounded active branch (`branch (N/M, max 10)`, where
  `N = historyIndex + 1` and `M = navigationHistory.length`) and the
  history list with back/forward controls. No "project state" badge — the
  previous `projectState`-driven display was removed when the
  interface-side state vocabulary was retired (see *Vocabulary realignment*).
* When `overviewEligible` is `true`, an explicit "confirm overview" button
  appears.
* After confirmation, the eligibility block is replaced by a "terminal
  state" notice; the rest of VIEW-3 remains navigable as a read-only
  exploration of past state.

---

## What did NOT change

* `/api/interaction`, `/api/relations/[componentId]`, `/api/mapping` — same
  surfaces.
* `app/types/events.ts`, `useInteractionEmitter`, `server/utils/eventLog.ts`
  — Phase 2 untouched. The HTTP behavioral log still records every action,
  including history nav.
* `assets/mock/umap_component_*.json` and `pickRelations` — still mock
  random.
* The wire protocol shape — `{ type, payload }` envelopes with `set-state`
  and `focus` as the only types — is unchanged. Only the emission rules and
  the state-name vocabulary were realigned.
* Project's `STATES` table is project-owned and unchanged. Interface adapts
  to project's existing vocabulary (`single` / `split` / `overview`).

---

## How to verify

The wire contract is defined entirely by the two-command protocol
(`set-state` and `focus`). The flow below describes the expected wire
emissions at each interaction step. Project-side or relay-side console
logs are useful for debugging but are **not** part of the contract — only
the wire emissions are.

With relay (`node server/server.js` from repo root), `project`, and
`interface_nuxt` (`npm run dev` → `:3050`) all running:

1. Reload the interface tab.
   Expect on the wire: `set-state('single')` — no `focus`.
2. Click an image in VIEW-1.
   Expect on the wire: `set-state('split', SPLIT_TRANSITION_MS)`
   **immediately followed by** `focus(storedImageId)`. The `single → split`
   morph starts and the camera begins lerping toward the selected point on
   project's side from the same moment.
3. Wait `SPLIT_TRANSITION_MS` (or skip via the VIEW-2 control).
   Expect on the wire: `focus(storedImageId)` again — idempotent
   re-assertion, **no `set-state`**. The morph that was already in flight
   either finishes naturally (auto-advance) or truncates on project's side
   (skip); the re-emitted focus is a no-op confirmation because project's
   `focusOn` is idempotent.
4. Click related images in VIEW-3.
   Expect on the wire: `focus(newImageId)` per click. Branch depth in the
   sidebar increments.
5. Click `← back` / `forward →` / a history entry.
   Expect on the wire: `focus(historicalId)` per nav action. No
   `set-state`. `imageClick` does not change.
6. Keep clicking related images until the **active branch depth** reaches
   10 (`historyIndex + 1 = 10`). No `set-state` fires; sidebar shows the
   "confirm overview" button. Further `activateCentral` calls are now
   no-ops (branch at cap); the wire stays quiet and `imageClick` does not
   advance.
7. Click `← back` once — button disappears (branch depth = 9). Click
   `forward →` — button reappears (depth = 10). Click `← back` to a much
   earlier index, then click a new related image — the forward branch is
   truncated and replaced; button stays hidden until depth returns to 10.
8. Click "confirm overview" while at depth 10.
   Expect on the wire: `set-state('overview')` — exactly once.
9. Click related images after confirmation.
   Expect on the wire: `focus({ id })` only — no `set-state`. Sidebar
   shows "overview active". Both `imageClick` and the branch are frozen for
   state purposes; project stays in `overview`.

---

## Open items intentionally deferred

* `view_advance` → `set-state(name)` mapping (no mapping currently).
* Euclidean nearest-neighbor in `pickRelations` — still random until per-component
  UMAPs diverge.
* Reverse channel from `project → interface_nuxt` — not wired.
* Camera targets / path directives — not part of Phase 4 scope.
