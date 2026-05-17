# PHASE 4 — DETERMINISTIC PROJECT-STATE MODEL

## Goal

Replace the Phase 3 / 3b emergent socket-emission pattern (just `focus(id)` per
interaction) with an **explicit, deterministic project-state model** driven by
`interface_nuxt`. `project` is now a pure renderer of the state it is told to be
in; it never infers or interprets `VIEW`, `imageClick`, or any progression rule.

The single source of truth for project's render state is the tuple
**`(currentView, imageClick, overviewConfirmed)`**, all owned by `interface_nuxt`'s
Pinia store. It is resolved into one of four states and emitted over the existing
socket protocol: `SINGLE` / `FADE` / `FOCUS` / `OVERVIEW`.

The wire protocol does **not** change. Only the rules for *when* and *what* to
emit change.

---

## Architectural invariants honored

* `interface_nuxt` owns `VIEW` + `imageClick` + `overviewConfirmed` and decides
  every transition.
* The socket is **transport only** — it never carries `VIEW` or `imageClick`
  directly, only the resolved `set-state(name)` and `focus(id)` directives.
* `project` is a pure deterministic renderer of `(state, focus(id), time)`.
* The system is deterministic, not emergent: given the same sequence of user
  selections, the same sequence of socket emissions occurs.
* `/api/interaction` (Phase 2 HTTP log) continues to record the **full**
  behavioral trace including history navigation. It is independent of the socket.
* History navigation in any state is **UI-local only** — it emits nothing on the
  socket.

---

## State table

Drivers: `imageClick` keys `SINGLE` / `FADE` (boot gate only); VIEW-3 entry
keys `FOCUS`; explicit user confirmation **while at active branch depth
`>= 10`** keys `OVERVIEW`. **VIEW-2 does not appear here** — it is a UI-only
phase and is not part of project's state machine.

| Trigger condition                                                       | project state |
| ----------------------------------------------------------------------- | ------------- |
| pre-selection (`imageClick = 0`)                                        | `SINGLE`      |
| first VIEW-1 click — at the moment of the click                         | `FADE`        |
| VIEW-3 active (any branch depth, until OVERVIEW confirmed)              | `FOCUS`       |
| user **explicitly confirms** OVERVIEW while at branch depth `>= 10`     | `OVERVIEW`    |

OVERVIEW is **never** triggered automatically by reaching depth 10; the
threshold only makes the state *eligible* for user confirmation. Branch
depth is `historyIndex + 1`, bounded to `[1..10]` (see *Bounded active
branch* below).

---

## `imageClick` — session-level selection counter (final rules)

`imageClick` is a **strictly monotonic, session-wide selection counter**.
Within the project-state machine it serves a **single** structural role:
distinguishing pre-selection (`imageClick === 0` → `SINGLE`) from
post-selection (`imageClick > 0` → `FADE` / `FOCUS`). Beyond that boot gate,
`imageClick` is a session-level trace on the HTTP `/api/interaction` log; it
is **not** the VIEW-3 progression metric and **not** the OVERVIEW eligibility
driver — see *Bounded active branch* and *OVERVIEW eligibility &
confirmation* below.

It counts only new image selection events:

* VIEW-1 selection (the first image): **+1**
* VIEW-3 `central_activate` (related-image click): **+1**, but only while
  `overviewConfirmed === false` **and** the activation actually extends the
  active branch (i.e. the branch is not at its depth cap)
* History navigation (`stepBack`, `stepForward`, `jumpToHistory`): **no change**
* VIEW transitions themselves: **no change**
* `confirmOverview()`: **no change**
* Any `activateCentral` call after OVERVIEW confirmation, or any
  `activateCentral` call refused by the branch-depth cap: **no change**

---

## Wire behavior (Phase 4 final)

| State      | Emitted from                                                | Wire emission                                          |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| `SINGLE`   | socket-register bootstrap                                   | `set-state('SINGLE')`                                  |
| `FADE`     | `selectImage` (the first VIEW-1 click)                      | `set-state('FADE', 4500)` — no `focus`                 |
| `FOCUS`    | `enterRelationalView` (VIEW-3 entry)                        | `set-state('FOCUS')` + `focus(storedImageId)`          |
| `FOCUS` in flight | `activateCentral` (pre-OVERVIEW)                     | `focus(newImageId)`                                    |
| `OVERVIEW` | `confirmOverview()` — explicit user action while at branch depth `>= 10` | `set-state('OVERVIEW')` — emitted exactly once  |
| post-OVERVIEW | `activateCentral` (after confirmation)                   | `focus(id)` — log artifact only; `project` MUST NOT use it |

**VIEW-2** is a UI-only buffer phase. During VIEW-2 the socket emits **nothing** —
`FADE` was already set at the click moment in VIEW-1. VIEW-2 lasts 4500ms by
default (mirroring project's FADE duration) and can be exited either by timer or
by an explicit user skip. Both exits emit the same `set-state('FOCUS')` +
`focus(storedImageId)` at VIEW-3 entry; only the moment differs.

**History navigation** (`stepBack`, `stepForward`, `jumpToHistory`) emits **only**
`focus(id)` on the wire — where `id` is the resolved past target. It does **not**
emit `set-state`, **not** change `projectState`, and **not** increment
`imageClick`. Its sole socket purpose is to keep project's camera tracking the
user's UI navigation through past selections. (Originally Phase 4 made history
socket-silent; that was reverted shortly after when it became clear the camera
needed to follow the visible "central image" during history navigation. State
machine semantics are unchanged — only `focus(id)` is restored.)

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
  The user must either confirm OVERVIEW or step back to make room for a new
  sub-branch.
* History navigation (`stepBack`, `stepForward`, `jumpToHistory`) only moves
  `historyIndex`; it never adds, removes, or reorders entries.

Conceptually, the displayed path is always the **currently reconstructed
active traversal**, not a record of every image the user has ever activated.
Active branch depth (`historyIndex + 1`, `[1..10]`) is the meaningful
progression measure for VIEW-3 and the input to OVERVIEW eligibility.
`imageClick` is preserved as a session-level selection trace only and is
**not** an unbounded "how far have we come" gauge.

---

## OVERVIEW eligibility & confirmation

Two pieces of store state:

* `overviewEligible` (derived): `true` when the **currently active branch
  depth** is at or above the threshold AND OVERVIEW has not yet been
  confirmed. Concretely:
  `historyIndex + 1 >= OVERVIEW_THRESHOLD && !overviewConfirmed`.
* `overviewConfirmed` (boolean flag): `false` initially; set to `true` exactly
  once by the `confirmOverview()` store action.

**`imageClick` and `overviewEligible` are not conflated.** `imageClick` is a
monotonic, session-level selection counter and never decreases. Eligibility is
**branch-dependent** — derived from the user's current position in the
bounded active branch. The two diverge any time the user steps backward in
history or activates a new image from an earlier position (which rewrites the
forward portion of the branch).

| Quantity            | Type                  | Bounds   | Mutates on history nav? | Drives OVERVIEW eligibility? |
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
`navigationHistory` as unbounded. Both were later revised: navigation is now a
bounded mutable branch capped at 10, and eligibility tracks the active branch
depth rather than cumulative session activity. The irreversible portion of
OVERVIEW — set by `confirmOverview()` — still uses `overviewConfirmed === true`
as its sole and final latch, exactly as before.)

When the user explicitly confirms:

1. `overviewConfirmed = true`
2. `set-state('OVERVIEW')` emitted exactly once over the socket
3. `imageClick` is **not** touched

After confirmation OVERVIEW is **terminal and irreversible** for the rest of
the session — no further `set-state` emissions occur, `imageClick` is frozen,
and `overviewEligible` collapses to `false` regardless of branch depth.

---

## Defensive structural guard

The post-OVERVIEW mutation prohibition for `activateCentral` is enforced
**structurally**, not by scattered conditional checks. The function uses a hard
early-return guard placed immediately after the precondition checks:

```ts
function activateCentral(id) {
  if (currentView.value !== 'VIEW_3') return
  if (activeCentralImageId.value === id) return

  // ── HARD GUARD — terminal OVERVIEW state. No mutation below. ──
  if (overviewConfirmed.value) {
    emit({ /* central_activate trace */ })   // /api/interaction log
    projectSocket.focus(id)                  // wire log only
    return
  }

  // ── Pre-OVERVIEW only. Provably unreachable post-confirmation. ──
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

### `app/stores/interaction.ts` (atomic rewrite)

* Added state: `imageClick` (number), `overviewConfirmed` (boolean).
* Added derived: `projectState` (typed as `'SINGLE' | 'FADE' | 'FOCUS' | 'OVERVIEW'`),
  `overviewEligible` (boolean — keyed off
  `historyIndex + 1 >= OVERVIEW_THRESHOLD && !overviewConfirmed`, i.e. the
  **active branch depth**, *not* cumulative `imageClick`).
* Added action: `confirmOverview()` — gated by `overviewEligible`; sets the flag
  and emits `set-state('OVERVIEW')` exactly once.
* `selectImage`: removed `projectSocket.focus(id)`; added
  `projectSocket.setState('FADE', 4500)`; increments `imageClick` (0 → 1).
* `enterRelationalView`: adds `projectSocket.setState('FOCUS')` +
  `projectSocket.focus(activeCentralImageId)` on VIEW-3 entry.
* `activateCentral`: pre-OVERVIEW path increments `imageClick` and extends the
  branch; post-OVERVIEW guard is a hard early-return that only logs (no
  mutation). A second structural guard caps the active branch at
  `OVERVIEW_THRESHOLD = 10` entries: when the branch is at its cap, further
  activations log to `/api/interaction` for telemetry but neither mutate the
  store nor emit on the socket. Discarded forward portions of the branch
  (truncated by activating from a non-tip position) are not retained.
* `stepBackInHistory` / `stepForwardInHistory` / `jumpToHistory`: emit
  `projectSocket.focus(activeCentralImageId)` after the mutation so project's
  camera follows the user's history navigation. They do **not** emit
  `set-state` and do **not** touch `imageClick` — the state machine and
  selection counter are unaffected. Phase 2 `/api/interaction` events are
  emitted as well.
* Constants: `FADE_DURATION_MS = 4500`, `VIEW_2_AUTO_ADVANCE_MS = FADE_DURATION_MS`,
  `OVERVIEW_THRESHOLD = 10` — also serves as the active-branch depth cap.

### `app/composables/useProjectSocket.ts`

* Added `setState(name, duration?)` — emits
  `socket.emit('message', { type: 'set-state', payload: { name, duration? } })`.
  Same fire-and-forget semantics as `focus()`.
* Added `onRegister(cb)` — registers a callback that fires when the relay
  acknowledges the `register` handshake. Used by the plugin to emit the boot
  state.

### `app/plugins/projectSocket.client.ts`

* Subscribes via `onRegister(() => setState('SINGLE'))` so `project` is told its
  boot state the moment the relay acknowledges registration.

### `app/components/views/View3Relational.vue`

* Sidebar now shows `projectState` (color-coded) and `imageClick`.
* When `overviewEligible` is `true`, an explicit "confirm overview" button
  appears.
* After confirmation, the eligibility block is replaced by a "terminal state"
  notice; the rest of VIEW-3 remains navigable.

---

## What did NOT change

* `/api/interaction`, `/api/relations/[componentId]`, `/api/mapping` — same surfaces.
* `app/types/events.ts`, `useInteractionEmitter`, `server/utils/eventLog.ts` —
  Phase 2 untouched. The HTTP behavioral log still records every action,
  including history nav (which now emits nothing to the socket).
* `assets/mock/umap_component_*.json` and `pickRelations` — still mock random.
* `interface/`, `project/`, `server/server.js` — untouched.

---

## How to verify

With relay (`node server/server.js` from repo root), `project`, and
`interface_nuxt` (`npm run dev` → `:3050`) all running:

1. Reload the page in a fresh tab. Browser console:
   `[socket] registered { ok: true, role: 'interface' }`.
   CLI listener as `project` should see: `set-state name=SINGLE` (no focus).
2. Click an image in VIEW-1.
   Expect: `set-state name=FADE duration=4500` (no focus).
3. Wait 4.5s (or skip via the VIEW-2 button).
   Expect: `set-state name=FOCUS` + `focus({ id })`.
4. Click related images in VIEW-3.
   Expect: `focus({ id })` per click. `imageClick` counter in sidebar increments.
5. Click `← back` / `forward →` / a history entry.
   Expect: **no socket traffic** (only HTTP `/api/interaction`).
6. Keep clicking related images until the **active branch depth** reaches 10
   (`historyIndex + 1 = 10`). No `set-state` fires; sidebar shows "confirm
   overview" button. Further `activateCentral` calls are now no-ops (branch
   at cap); the wire stays quiet and `imageClick` does not advance.
7. Click `← back` once — button disappears (branch depth = 9). Click
   `forward →` — button reappears (depth = 10). Click `← back` to a much
   earlier index, then click a new related image — the forward branch is
   truncated and replaced; button stays hidden until depth returns to 10.
8. Click "confirm overview" while at depth 10.
   Expect: `set-state name=OVERVIEW` (exactly once).
9. Click related images after confirmation.
   Expect: `focus({ id })` only — no `set-state`. Sidebar shows "overview
   active". Both `imageClick` and the branch are frozen for state purposes.

---

## Open items intentionally deferred

* `view_advance` → `set-state(name)` mapping (no mapping currently).
* Euclidean nearest-neighbor in `pickRelations` — still random until per-component
  UMAPs diverge.
* Reverse channel from `project → interface_nuxt` — not wired.
* Camera targets / path directives — not part of Phase 4 scope.
