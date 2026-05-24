# SYSTEM ARCHITECTURE

The system is composed of 3 distinct layers:

interface_nuxt
↓
server
↓
project

Each layer has a strictly different responsibility.

---

## interface_nuxt

interface_nuxt is the interaction and relational interface layer.

It is responsible for:

* user interaction
* global interaction state
* navigation history
* central image selection
* view progression
* displaying relational components
* emitting interaction events to the server

interface_nuxt does NOT:

* compute spatial rendering
* animate cameras
* compute map positions
* manage Three.js rendering
* own spatial visualization systems

The interface produces interaction states, not spatial rendering.

---

## server

The server is the authoritative synchronization layer of the system.

All interaction events must pass through the server.

interface_nuxt never communicates directly with project.

The server is responsible for:

* receiving interaction events
* synchronizing global state
* updating navigation memory
* resolving relational proximities
* querying relational datasets
* computing related images
* broadcasting synchronized updates
* transmitting rendering instructions to project

The server acts as the central orchestration layer between all systems.

---

## project

project is the Feedback visualization system.

It is a spatial rendering layer only.

project is responsible for:

* camera movement
* spatial rendering
* path visualization
* persistent visual memory
* transitions
* map feedback
* spatial interpretation of synchronized states

project does NOT:

* compute relations
* query relational datasets
* resolve proximities
* own interaction logic
* manage navigation state

project only receives synchronized state from the server and spatializes it.

---

## COMPONENTS VS CANVASES

The terminology must remain strict.

Components belong to interface_nuxt.

Canvases belong to project.

Components:

* display relational candidates
* receive synchronized relational state
* emit interaction events

Canvases:

* render spatial representations
* animate camera movement
* visualize paths and memory

Canvases must never query relational datasets directly.

Components must never implement spatial rendering logic.

---

## VIEW FLOW

The views are progressive interface states.

They are not traditional routes or pages.

The progression is:

VIEW-1 → VIEW-2 → VIEW-3

Once the system enters VIEW-3, it must never return to:

* VIEW-1
* VIEW-2

However, navigation inside VIEW-3 remains reversible.

The user must be able to:

* reactivate previous central images
* revisit earlier navigation states
* move backward through navigation history

The irreversible logic only applies to the global progression of views.

---

## DETERMINISTIC PROJECT STATE

`interface_nuxt` is the sole authority for `project`'s render state. State
emissions are computed explicitly from the store and pushed over the socket;
`project` never infers, derives, or interprets. The pipeline is
**deterministic, not emergent**:

```text
interface_nuxt  →  decides which render state to emit from
                     (VIEW, imageClick, historyIndex, overviewConfirmed)
                →  emits set-state(name) and focus(id)
socket          →  transport only
project         →  pure renderer of (state, focus(id), time)
```

### VIEW ≠ STATE — two layers, two vocabularies

`VIEW` and `STATE` are not synonyms. They belong to different layers and use
different vocabularies, and there is **no 1:1 correspondence** between them.

* **VIEW** (`VIEW_1` / `VIEW_2` / `VIEW_3`) is an **interaction phase**, owned
  by `interface_nuxt`. It describes what the user is doing in the UI:
  selecting, buffering, exploring relations.
* **STATE** (`single` / `split` / `overview`) is a **render state**, owned by
  `project`. It describes what is drawn on the spatial canvas: a single
  full-frame map, the 2×2 relational grid, or the zoomed-out grid.

VIEW-2 in particular has **no corresponding render state** — it is the UI
mirror of an in-flight `single → split` morph that was kicked off at the
VIEW-1 click. `interface_nuxt` orchestrates interaction phases; `project`
spatializes render states. They speak past each other deliberately, with the
socket as a one-way translation: interaction events → render-state
directives.

`imageClick` and `historyIndex` are interface concepts that *decide which
render state to emit*, but they are never themselves on the wire. The wire
carries only `set-state(name)` and `focus(id)`, both of which use project's
vocabulary.

### State table

Drivers: the first VIEW-1 click keys the `single → split` morph; explicit
user confirmation **while at branch depth `>= 10`** keys the `split →
overview` transition; bootstrap keys the initial `single`. **VIEW-2 has no
render state** — it is a UI-only buffer that mirrors the in-flight `single
→ split` morph already in motion.

| Interaction event                                                       | Wire emission                          | Resulting render state |
| ----------------------------------------------------------------------- | -------------------------------------- | ---------------------- |
| socket-register bootstrap or reconnect (no clicks yet, `imageClick = 0`) | `path-clear` + `set-state('single')` + `set-mask(0, 0)` | `single` (full reset; mask transparent) |
| first VIEW-1 click                                                      | `set-mask(1, 0)` + `set-state('split', 4500)` + `focus(storedImageId)` | `single → split` (4500ms morph, hidden behind opaque mask) |
| VIEW-3 entry via timer (auto)                                           | `set-mask(0, 400)` + `focus(storedImageId)` (idempotent re-assertion) | `split` (no state change; mask reveals over 400ms) |
| VIEW-3 entry via skip                                                   | `set-mask(0, 0)` + `focus(storedImageId)` (idempotent re-assertion) | `split` (no state change; instant cut to whatever frame project is on) |
| VIEW-3 related-image click (`activateCentral`, pre-overview, pre-cap)   | `focus(newId)` + `path-segment(prevId, newId)`, prefixed by `path-truncate(historyIndex)` if mid-branch | `split` (no state change) |
| VIEW-3 related-image click (`activateCentral`, at cap or post-overview) | post-overview: `focus(newId)` only — at cap: **nothing** on the wire | `split` (no state change; read-only) |
| history nav (`stepBack` / `stepForward` / `jumpToHistory`)              | `focus(historicalId)`                  | `split` (no state change) |
| user **explicitly confirms** overview while at branch depth `>= 10`     | `set-state('overview')`                | `split → overview`     |

**`overview` is not a threshold-triggered state.** Reaching branch depth
`>= 10` (i.e. `historyIndex + 1 >= 10`) only marks overview as **eligible**;
the system stays in `split` with the last `focus(id)` fully rendered. The
transition to `overview` happens only when the user performs an explicit
confirmation action (e.g. clicking a confirmation button in VIEW-3) — see
*overview eligibility & confirmation* below.

> **Project-internal note.** Project also defines a `disperse` render state
> in its `STATES` table; `interface_nuxt` deliberately never emits it. It is
> a project-internal animation mode reserved for project's own future use
> and has no interaction-side trigger.

### `imageClick` — session-level selection counter

`imageClick` is a **strictly monotonic, session-wide selection counter**.
Within the wire-emission logic it serves a **single** structural role:
distinguishing pre-selection (`imageClick === 0` → project is in `single`)
from post-selection (`imageClick > 0` → project has already been told to
morph into `split`). Beyond that boot gate, `imageClick` is preserved as a
historical / telemetry trace on the HTTP `/api/interaction` log — it is
**not** the progression metric for VIEW-3, and it does **not** drive any
further state transition.

The meaningful progression measure inside VIEW-3 is the **active branch
depth** (`historyIndex + 1`), bounded to `[1..10]` (see *NAVIGATION MEMORY*).

`imageClick` counts only new image selection events:

* VIEW-1 selection (the first image): **+1**
* VIEW-3 `central_activate` (related-image click): **+1**, but only while
  `overviewConfirmed === false` and the activation actually extends the branch
* History navigation (`stepBack`, `stepForward`, `jumpToHistory`): **no change**
* VIEW transitions themselves: **no change**

VIEW-3 entry **does not** increment `imageClick` — it reuses the image stored from VIEW-1.

Consequences:

* `overview` is **irreversible within a session**. Once confirmed, project
  stays in `overview` even if the user navigates back in history on the
  interface side.
* History navigation never changes render state. It emits **only** `focus(id)`
  for camera follow — see the state table above.
* `imageClick` is a session-level selection counter, **not** the VIEW-3
  progression metric and **not** the overview eligibility driver. It must
  not be conflated with `historyIndex + 1` (the active branch depth) — see
  *overview eligibility & confirmation* below for the comparison table.

### Wire behavior notes

**VIEW-2** is a UI-only buffer phase. During VIEW-2 the socket emits
**nothing** — project is already morphing into `split` because that emission
fired at the VIEW-1 click moment. VIEW-2 is the UI mirror of that in-flight
morph; it does not have a render state of its own.

**History navigation** (`stepBack`, `stepForward`, `jumpToHistory`) emits
**only** `focus(id)` on the wire, where `id` is the resolved past target.
It does **not** emit `set-state`, does **not** change project's render
state, and does **not** affect `imageClick`. Its sole socket purpose is to
move project's camera to track the user's UI navigation through past
selections.

**VIEW-3 entry emits no `set-state`.** The `single → split` morph is already
underway (or already complete) from the VIEW-1 click, and project's camera
has been tracking `storedImageId` since that click moment. VIEW-3 entry
re-emits `focus(storedImageId)` as an idempotent re-assertion of the same
target the click already established — project's `focusOn` is idempotent,
so this is a no-op confirmation, not a first-time binding. If the user
skips VIEW-2 early, project's morph naturally truncates — no second
`set-state` is needed.

### Boot reset sequence

On every `register` event between `interface_nuxt` and `project` (initial
connect and reconnect), `interface_nuxt` emits the following four
directives, in order:

1. `path-clear`
2. `set-state('single')`
3. `set-mask(0, 0)`
4. `set-canvas-bg(store.canvasBackground)`

This is the canonical session-reset handshake. No aggregate `reset-session`
wire verb exists; composition is sufficient because the wire vocabulary is
deliberately minimal and each constituent already carries clean semantics.

* `path-clear` wipes `pathTrace.segments[]`, the `visited` set, and zeroes
  the endpoint glow buffer. Originally introduced for the legacy demo
  system, it is now formally part of the boot contract — promoted to
  canonical use alongside `path-segment` / `path-truncate`.
* `set-state('single')` transitions `project` to the `single` render
  state. The contract of `single` explicitly includes — beyond layout,
  `cameraZ`, and `drift` — **"no focal target, camera at map origin"**.
  Concretely: on entering `single`, `goTo('single')` resets each ready
  canvas's `targetX/targetY` to `(0, 0)` with `panProgress = 1`, and
  clears any previous point highlight. This makes `set-state('single')`
  alone sufficient to reset camera + focus state without introducing a
  separate `focus-clear` directive.
* `set-mask(0, 0)` snaps the project-side render mask to fully transparent
  with no transition (see *VIEW-2 — RENDER MASK*). Defensive: ensures the
  mask is not stuck visible from a prior session or a crashed transition.
* `set-canvas-bg(store.canvasBackground)` synchronizes project's canvas
  background to the interface-side store value (see *CANVAS BACKGROUND*).
  The interface is the authoritative owner; on every register the current
  store value is re-emitted so a freshly-connected project lands on the
  correct background regardless of its prior state.

Ordering between the four emissions is cosmetic — the four subsystems
(`pathTrace`, `stateManager`, the render mask DOM element, and the
`<body>` `data-canvas-bg` attribute) are independent and do not interact —
but the listed order is preferred so that the path wipe is visible before
the layout transitions away from whatever rendered state preceded the
reconnect.

**Outcome of a hard refresh of `interface_nuxt`:**

| Project state | Reset path |
|---|---|
| `pathTrace.segments[]` + glow | `path-clear` → `pathTrace.clear()` |
| `currentName`, layout, `cameraZ`, drift | `set-state('single')` → `stateManager.goTo('single')` |
| `targetX` / `targetY` / `panProgress` / highlight | `set-state('single')` → `single`-state focus reset (inside `goTo`) |

Together they leave `project` indistinguishable from a cold boot: empty
path, camera at origin, no focal target, layout in `single`, auto-morph
cycle restarted.

**Caveats:**

* `onRegister` fires on **every** socket connect, including transient
  reconnects mid-session. The current implementation therefore wipes
  `project`'s visuals even when the interface store still holds the full
  `navigationHistory`. This is acceptable for the prototype phase. The
  long-term fix is *replay-from-store on reconnect* — emit `path-clear`,
  then walk `navigationHistory` re-emitting `path-segment` for each edge,
  then `focus(activeCentralImageId)` — deferred until reconnect behavior
  becomes a felt problem.
* If `project` is offline at the moment `interface_nuxt` registers, the
  relay drops the boot emissions; project will boot into its own
  internal default state (`stateManager`'s `initial = 'split'`) and stay
  there until the next interface event arrives. This is a pre-existing
  race in the relay's at-most-once delivery semantics — flagged but out
  of scope for this contract.

### overview eligibility & confirmation

The `split → overview` transition is a **deliberate user action**, not a
threshold trigger. Two pieces of store state govern it:

* `overviewEligible` (derived): `true` when the **currently active branch
  depth** is at or above the threshold AND overview has not yet been
  confirmed. Concretely:
  `historyIndex + 1 >= OVERVIEW_THRESHOLD && !overviewConfirmed`.
* `overviewConfirmed` (boolean flag): `false` initially; set to `true` exactly
  once by the `confirmOverview()` store action.

The eligibility gate is **branch-dependent**, not cumulative. The active
branch is bounded to a maximum depth of `OVERVIEW_THRESHOLD = 10` (see
*NAVIGATION MEMORY*), so:

* The overview button becomes eligible the moment the active traversal
  **reaches** depth 10 — i.e. the user has built up a 10-image relational
  route inside the current branch.
* Stepping back below depth 10 (`stepBackInHistory` / `jumpToHistory` to an
  earlier index) **hides** the button — eligibility is recomputed on every
  position change. The user is now mid-branch, not at the tip.
* Returning to the tip (`stepForwardInHistory`), or activating new images
  from an earlier position (which truncates the forward branch and appends),
  re-enables eligibility the moment the active depth is back to 10.
* `imageClick` keeps its own session-counter rules independently of all of
  this; it does **not** gate the button.

`imageClick` and `overviewEligible` must not be conflated:

| Quantity            | Type                  | Bounds   | Mutates on history nav? | Drives overview eligibility? |
| ------------------- | --------------------- | -------- | ----------------------- | ---------------------------- |
| `imageClick`        | session selection log | `[0, ∞)` | No                      | No                           |
| `historyIndex + 1`  | active branch depth   | `[1, 10]`| **Yes**                 | **Yes**                      |

The **irreversible** portion of overview begins only after
`overviewConfirmed === true`. Up to that point eligibility is fluid and tracks
the active branch depth; once confirmed, the latch is permanent (see
*overview — terminal, read-only state* below).

Flow:

1. User keeps clicking related images in VIEW-3. Each new selection appends to
   `navigationHistory` and advances `historyIndex` (active branch depth).
   `imageClick` also ticks for the HTTP log but is not consulted by the wire
   beyond the initial `single → split` boot gate.
2. When `historyIndex + 1` reaches 10, `overviewEligible` becomes `true`.
   Project **stays in `split`** — the last `focus(id)` remains active, fully
   rendered. Because the branch is at its maximum depth, no further image can
   be appended; the user must either confirm overview or step back to make
   room for a new sub-branch.
3. The VIEW-3 UI surfaces a confirmation control (e.g. a button) only while
   `overviewEligible` is `true`. If the user steps back below depth 10, the
   control disappears; if they return to the tip (or rebuild a sub-branch
   back to depth 10 after stepping back), it reappears.
4. When the user explicitly confirms, `confirmOverview()`:
   * sets `overviewConfirmed = true`
   * emits `set-state('overview')` over the socket exactly once
   * does **not** touch `imageClick`

### overview — terminal, read-only state

After confirmation, project's `overview` is **terminal and irreversible** for
the rest of the session. The wire and the interaction logic are both frozen:

* `overviewConfirmed` stays `true`.
* `overviewEligible` becomes `false` (the confirmation control disappears).
* `imageClick` is **frozen** — it never increments again, by any path.
* No further `set-state` emissions occur. Project stays in `overview`.
* `activateCentral` does **not** trigger any state logic — no `imageClick++`,
  no derived-state recomputation, no `set-state`. Interaction logic does not
  re-open in any way.
* `activateCentral` **may** still emit `focus(id)` for log consistency on the
  wire, but `project` **must not** use it for spatial rendering and **must
  not** use it to drive any state change. `overview` is read-only on the
  spatial side.
* UI-side store mutations (e.g. updating the displayed central image or the
  navigation history view) remain available for read-only exploration of past
  state, but they have no progression effect.

Summary of `imageClick` rules (final):

* Increments **only on explicit user image selection events** that actually
  extend the active branch, *before* overview is confirmed (VIEW-1 first
  click; VIEW-3 `central_activate` while not at the branch cap).
* Never affected by VIEW transitions, history navigation, `confirmOverview()`,
  or any post-overview interaction.
* Is **not** the overview eligibility driver and **not** the VIEW-3
  progression metric. Eligibility is recomputed from the active branch depth
  (`historyIndex + 1`, bounded to `[1..10]`) on every history change.
  `imageClick` is preserved as a session-level selection trace only.

Why this exists: the confirmation step lets the last image be properly anchored
in `split` before any zoom-out, so the transition to `overview` is intentional
and stable. After `overview`, the user is in a read-only exploration mode —
clicks still register in the UI (and on the wire as log artifacts) but no
longer drive progression or rendering.

### Implementation rule — structural guard (defensive)

The post-overview mutation prohibition for `activateCentral` is enforced
**structurally**, not by scattered conditional checks. `activateCentral` MUST
place a hard early-return guard immediately after its existing precondition
checks (VIEW-3 check and same-id dedup), so that **all mutation code below the
guard is provably unreachable** once `overviewConfirmed === true`:

```ts
function activateCentral(id) {
  if (currentView.value !== 'VIEW_3') return
  if (activeCentralImageId.value === id) return

  // ── HARD GUARD — terminal overview state ──
  if (overviewConfirmed.value) {
    emit({ /* central_activate trace */ })   // /api/interaction log
    projectSocket.focus(id)                  // wire log only
    return
  }

  // ── Pre-overview only. Provably unreachable post-confirmation. ──
  // …all store mutations + imageClick++ + emissions live here…
}
```

Rules for this guard:

* **One** guard, **one** return. No `if (!overviewConfirmed)` checks wrapped
  around individual mutations. No flags scattered through the function body.
* The mutation block is a single contiguous region **after** the guard's
  `return`.
* This makes accidental mutation impossible by construction and makes the
  read-only contract auditable at a glance — a reviewer only needs to verify
  the guard exists and the return is unconditional.
* The same principle applies to any future action that needs a terminal-state
  guard: hoist the guard, single early-return, no per-mutation flag plumbing.

### Architectural invariants

* `interface_nuxt` owns `VIEW` + `imageClick` and decides every transition.
* The socket is **transport only**. It never carries `VIEW` or `imageClick` directly —
  only the resolved `set-state(name)` and `focus(id)` directives.
* `project` is a **pure renderer**. It never infers state, never interprets `VIEW`,
  never computes progression rules.
* The system is **deterministic**: given the same sequence of user selections, the
  same sequence of socket emissions occurs.

`/api/interaction` (Phase 2 HTTP log) continues to record the **full** behavioral
trace including history navigation. It is independent of the socket and acts as the
source of truth for behavior history.

---

## VIEW-1 — pre-selection interaction phase (interface_nuxt)

VIEW-1 is the pre-selection interaction phase. It is a UI-only surface where
the user picks the first image. VIEW-1 is **not** a render state — see
*VIEW ≠ STATE* — and has no spatial meaning of its own. While the user is in
VIEW-1, project sits in `single`.

### Behavior

At system bootstrap, `interface_nuxt` registers with the relay and emits
`set-state('single')`, placing project in `single`.

When the first image is selected in VIEW-1:

* the selection is stored in the interaction state
* `imageClick` is incremented (0 → 1)
* the system transitions immediately and permanently to VIEW-2
* `project` receives `set-mask(1, 0)` — snapping the project-side render
  mask to fully opaque so the morph kickoff frame is hidden (see
  *VIEW-2 — RENDER MASK*). This MUST be emitted **before** `set-state`
  in the same bundle; `socket.io-client` preserves emission order
* `project` receives `set-state('split', 4500)` — kicking off a 4500ms
  `single → split` morph **at the click moment**, behind the opaque mask
* `project` also receives `focus(storedImageId)` in the same emission
  bundle — the camera target is bound at click time so the morph and the
  camera convergence are co-causal with the user's selection

VIEW-3 entry emits **no** `set-state` of its own — the morph that was kicked
off here is already in flight (or already complete) by then. VIEW-3 entry
**re-emits** `focus(storedImageId)` as an idempotent re-assertion of the
target established at click time; project's `focusOn` is idempotent by
construction, so this is a no-op confirmation rather than a first-time
binding.

### Split transition duration

The duration of the `single → split` morph is owned by `interface_nuxt` as a
single constant (`SPLIT_TRANSITION_MS = 4500`). It is passed on the wire as
the second argument to `set-state('split', SPLIT_TRANSITION_MS)`, and the
same constant drives VIEW-2's auto-advance timer. So both project's
on-canvas morph and interface's UI buffer derive from one source of truth
inside `interface_nuxt`; project simply executes for whatever duration it is
told.

VIEW-2 is the **UI mirror** of the in-flight morph. By default it lasts the
same `SPLIT_TRANSITION_MS`, but it may be exited early by an explicit user
skip action. The skip is purely a UI-side trigger:

* it does **not** alter the duration already on the wire
* it does **not** affect `imageClick`
* it does **not** introduce any additional render state
* it emits **no** intermediate socket event

Transition timeline:

1. VIEW-1 click → emits `set-mask(1, 0)`, then `set-state('split', 4500)`,
   then `focus(storedImageId)` — bundled, **immediately**, in that order.
   The mask snaps to opaque first so the morph kickoff frame is hidden.
2. VIEW-2 begins and runs for up to 4500ms (or until user skip). Project's
   camera lerps toward `storedImageId` for the duration of the morph,
   behind the opaque mask. The mask hides the spatial morph entirely.
3. On exit, VIEW-3 entry emits `set-mask(0, duration)` and re-emits
   `focus(storedImageId)`. `duration` differs by exit path:
   * auto: `set-mask(0, 400)` — 400ms reveal of the settled split state.
   * skip: `set-mask(0, 0)` — instant cut to whatever frame project is on.

Both exit paths produce the **same** wire identity for `focus`; only the
mask's `duration` differs. Project's response is project's own deterministic
decision — if the morph is still in flight when VIEW-3 entry lands the
camera, project handles the truncation internally.

### Note on the word "disperse"

In `interface_nuxt`, "disperse" is sometimes used informally to describe the
visual arrangement of selectable images in VIEW-1. It is **not** the
emission target — VIEW-1 corresponds to project's `single` render state.
Project also defines a `disperse` render state internally, but
`interface_nuxt` deliberately never emits it; it is project-internal and
reserved for project's own future use.

---

## VIEW-2 — UI transition phase (interface_nuxt)

VIEW-2 is a UI-only transition phase that mirrors project's in-flight
`single → split` morph. It is not a render state — see *VIEW ≠ STATE* —
and the wire emits **nothing** during VIEW-2; the relevant
`set-state('split', SPLIT_TRANSITION_MS)` already fired at the VIEW-1 click
moment.

The morph duration is owned by `interface_nuxt` (`SPLIT_TRANSITION_MS = 4500`).
The same constant drives both:

* the duration argument sent on the wire to project, and
* VIEW-2's auto-advance timer.

So the UI buffer and project's on-canvas morph stay aligned by construction;
there is one source of truth, and it lives in `interface_nuxt`.

### Exit conditions

VIEW-2 can end via two distinct UI triggers, which produce **different**
mask emissions but identical `focus` emissions:

* Automatic completion when the `SPLIT_TRANSITION_MS` timer elapses — emits
  `set-mask(0, 400)` (perceptual reveal) followed by
  `focus(storedImageId)`.
* Optional user skip action in `interface_nuxt` — emits `set-mask(0, 0)`
  (instant cut) followed by `focus(storedImageId)`.

The `focus` emission is identical on both paths and idempotent:

```
focus(storedImageId)            // idempotent re-assertion — no set-state,
                                // focus was already emitted at the click
```

Only the *moment* of VIEW-3 entry and the mask's `duration` differ between
the two triggers. The camera target was bound at click time, so project is
already converging on `storedImageId` regardless of when (or whether)
VIEW-3 re-asserts it; the re-assertion is a defensive confirmation, not a
first-time binding. See *VIEW-2 — RENDER MASK* for the full mask contract.

### Constraints

* Skip does not alter the `set-state('split', …)` duration already on the
  wire — project's morph continues to its natural completion.
* Skip does not affect `imageClick`.
* Skip does not introduce any additional render state.
* Skip does change the mask emission's `duration` (`0` instead of `400`),
  which is a perceptual difference but not a render-state difference.
* `interface_nuxt` owns `SPLIT_TRANSITION_MS`; the wire carries that value
  as the second argument to `set-state('split', …)`.
* VIEW-2 is purely a visual / UX transition layer.
* Transition logic (timer + skip handler) belongs to `interface_nuxt` only.

---

## VIEW-3

VIEW-3 is the main relational interface state.

The previously selected image becomes the active central image.

Around this image:

* 4 relation components react independently
* each component corresponds to a different relational regime
* each component depends on a different relational dataset
* all components receive the same central image reference

The same image therefore generates different proximities depending on the active relational regime.

---

## VIEW-3 — COMPONENT LAYOUT

The 4 relation components are arranged in a fixed 2×2 grid:

[ component-1 ] [ component-2 ]
[ component-3 ] [ component-4 ]

This layout remains stable during VIEW-3.

Each component has:

* its own independent UMAP JSON dataset containing spatial coordinates
* its own proximity computation logic based on those coordinates
* its own relational worldview

However:

* all components share the same central image ID
* all components react to the same navigation state
* the related images displayed inside each component are computed relative to this central image
* the clickable images inside the components therefore represent different relational interpretations of the same central reference

The separation is intentional:

* layout remains stable for readability
* meaning diverges through relational computation

Do NOT spatially drift or reorganize the interface layout itself.

Spatial complexity belongs to the canvas systems inside project.

---

## RELATIONAL RESOLUTION FLOW

The relation components do not resolve proximities locally.

When the active central image changes:

* interface_nuxt emits an interaction event to the server
* the server queries the corresponding relational datasets
* the server computes related images independently for each component
* the server sends synchronized relational results back to interface_nuxt
* each component displays the relations it receives

The components therefore behave as reactive renderers of synchronized relational state.

Each component displays different related images even though they originate from the same central image reference.

---

## PROJECT COMMUNICATION

project never queries relational datasets directly.

project only receives synchronized relational state from the server.

The server is responsible for transmitting:

* active image state
* navigation memory
* relational updates
* camera targets
* rendering instructions

project spatializes and visualizes these synchronized states but does not compute them.

---

## INTERACTION FLOW

A user interaction produces a single interaction event.

This event is sent from interface_nuxt to the server.

The server then becomes responsible for:

* updating synchronized interaction state
* resolving relational proximities
* updating navigation memory
* broadcasting relational updates
* transmitting rendering instructions to project

The consequences of interaction must never be emitted independently by multiple systems.

The server remains the single synchronization authority.

---

## NAVIGATION MEMORY

Inside VIEW-3, navigation history behaves as a **bounded, mutable active
branch** — not an unbounded historical log. The branch has a hard maximum
depth of `OVERVIEW_THRESHOLD = 10` entries.

Mechanics:

* every newly activated image is appended to `navigationHistory`
* `historyIndex` points to the currently active position in that branch
* previously activated images in the current branch remain accessible by
  stepping back / forward / jumping to a past index
* if the user activates a new image while `historyIndex` is **not** at the
  tip of the branch, the forward portion is **destroyed** — `navigationHistory`
  is truncated to `[0..historyIndex]` and the new image is appended,
  replacing the previous forward timeline
* the active branch is capped at 10 entries. Once the branch is at maximum
  depth (`navigationHistory.length === 10` AND `historyIndex` is at the tip),
  no further image can be appended. The user's only progression options are
  `confirmOverview()` or stepping back to make room for a new sub-branch.
* history navigation itself (`stepBack`, `stepForward`, `jumpToHistory`)
  never adds, removes, or reorders entries — it only moves `historyIndex`.

What this means conceptually:

* the displayed path is always the **currently reconstructed active
  traversal**, not a record of every image the user has ever visited across
  every prior branch
* the system visualizes the user's *current relational route*, not the total
  session memory of all activations
* **active branch depth** (`historyIndex + 1`, bounded to `[1..10]`) is the
  meaningful progression measure inside VIEW-3 — it is what gates overview
  eligibility (see *overview eligibility & confirmation*)
* `imageClick` continues to count every new image selection event for the
  HTTP behavioral log (`/api/interaction`), but it is **not** the VIEW-3
  progression metric and **not** an unbounded "how far have we come" gauge;
  it is a session-level selection trace

Re-traversal of prior positions within the active branch is unbounded — the
user can step back and forward freely. Forward paths beyond the active
position are mutable and get rewritten on the next new activation. Branches
discarded by truncation are not retained anywhere; they are gone.

---

## VIEW-3 — PATH RENDERING

VIEW-3 has a **persistent visual path** rendered by `project`. It visualizes
the user's currently reconstructed active branch (see *NAVIGATION MEMORY*)
as a continuous line of segments connecting each successively activated
image, with an additive glow at each endpoint.

The rendered path is **not** a separate memory and **not** a server-side
artifact; it is a pure visual derivation of `navigationHistory` /
`historyIndex` mutations. `interface_nuxt` owns the memory and emits
explicit directives; `project` owns the rendering and never infers, never
derives, never stores. This is the canonical user-driven path-rendering
system — the legacy `pathPlayer` / `simulatePath` machinery in `project`
remains in source but is **never engaged** by `interface_nuxt`.

### Wire vocabulary

Two directives, both flowing from `interface_nuxt` to `project` through the
opaque relay (`server`):

* `path-segment({ fromId, toId })` — append a new visible segment from
  `fromId` to `toId`. Project picks the segment color locally (color is a
  rendering concern, not a wire concern) and animates the new segment's
  `progress` against the current `focus(id)` pan animation, so the segment
  visibly "grows" in sync with camera convergence on the new central image.
* `path-truncate({ keepCount })` — drop all segments after index
  `keepCount`. The surviving last segment is clamped to fully drawn. Used
  to visually destroy a forward branch that was just rewritten by a
  mid-branch activation.

`interface_nuxt` emits **only** these two path directives. Legacy
`'path-simulate'`, `'path-start'`, `'path-clear'` handlers exist inside
`project`'s `commandsManager` but are unreachable in the production user
journey because `interface_nuxt` never emits them.

### Emission rules

Path emissions originate **only** in `activateCentral`, and **only** inside
its pre-overview, pre-cap mutation block. The structural guards described
in *overview — terminal, read-only state* and the branch-cap check ensure
this block is provably unreachable from any other state.

When the mutation block runs, `activateCentral` socket emissions are
produced in this fixed order:

1. `path-truncate({ keepCount: historyIndex })` — **only if mid-branch**
   (`historyIndex < navigationHistory.length - 1`). Emitted **before**
   focus.
2. `focus({ id: newId })` — repositions camera, resets `panProgress` to 0.
3. `path-segment({ fromId: prevId, toId: newId })` — pushes new segment
   with `progress = 0`; will animate against the fresh pan.

Both `prevId` and `truncateKeepCount` are captured **before** the store
mutation runs, so they reference the *previous* active image and the
*previous* `historyIndex` respectively.

The ordering is intentional and load-bearing:

* truncate **before** focus, so the discarded tail is removed before the
  camera starts repositioning visually
* focus **before** segment, so `panProgress` is reset to 0 at the moment
  the new segment is pushed — otherwise the new segment would inherit a
  stale `panProgress = 1` from the previous arrival and skip its
  animation entirely
* `socket.io-client` preserves emission order on a single connection;
  the three messages arrive at `project` in the same order they leave
  `interface_nuxt`

### Actions that do NOT emit path directives

* `selectImage` (VIEW-1 first click) — no path yet exists; there is no
  `prev` to draw from. The first visible segment appears on the **second**
  activation overall, i.e. the first VIEW-3 related-image click.
* `enterRelationalView` (VIEW-2 → VIEW-3 entry) — only re-asserts
  `focus(storedImageId)`. Pushing the initial image into
  `navigationHistory` is a memory event, not a segment event (a single node
  has no edge).
* `stepBackInHistory` / `stepForwardInHistory` / `jumpToHistory` — emit
  **only** `focus(historicalId)`. The visual path already exists; history
  traversal is read-only camera movement through it. **No** `path-segment`,
  **no** `path-truncate`, by design.
* `confirmOverview` — emits only `set-state('overview')`. The path
  permanently freezes as drawn at the moment of confirmation.
* `activateCentral` while at branch cap (`historyIndex + 1 >= 10`) — the
  pre-cap guard returns before any socket emission. No `focus`, no
  `path-segment`, no `path-truncate`. The path is unchanged.
* `activateCentral` after `overviewConfirmed === true` — the hard guard
  returns after emitting only `focus(id)` (for wire-log consistency, per
  *overview — terminal, read-only state*). No path emission. The path
  remains frozen.

### Project-side rendering contract

`project` maintains a single `segments` array inside `pathTrace`, one entry
per visible edge. On wire receipt:

* `path-segment(from, to)`: appends `{ fromId, toId, color, progress: 0 }`;
  clamps the previously-last segment to `progress = 1`.
* `path-truncate(keepCount)`: shrinks `segments` to length `keepCount`;
  clamps the new last segment to `progress = 1`; clears the glow buffer so
  endpoints at discarded nodes disappear on the next tick.

The pushed segment animates its `progress` against the camera's
`panProgress` (which was just reset by `focus`), so each segment visibly
grows as the camera converges on the new central image. The animation is
project-internal; `interface_nuxt` does not orchestrate it.

### Invariants

* The visual path always equals `navigationHistory[0..historyIndex]`
  rendered as `historyIndex` segments. Preserved by construction:
  * appending: `path-segment` adds exactly one segment
  * truncating: `path-truncate(historyIndex)` drops everything past the
    surviving prefix **before** the new segment is appended
* History traversal never mutates the rendered path — only the camera
  moves through pre-existing geometry.
* Once `overviewConfirmed === true`, the path is permanently frozen for
  the rest of the session. No code path can append, truncate, or clear it.
* The path is **client-only visual state**. It is not persisted on the
  server, not in `localStorage`, not on the wire beyond the per-event
  directives. Page reload destroys it; subsequent activations rebuild it
  from the next user interactions.
* Color is chosen inside `project` per segment. `interface_nuxt` is
  color-blind by design — the wire stays minimal.

---

## VIEW-2 — RENDER MASK

VIEW-2 has a **project-side render mask** — a fullscreen DOM overlay
rendered by `project` directly above its four canvas containers. It exists
to physically hide the `single → split` morph during the VIEW-2 buffer
phase, since `interface_nuxt` and `project` occupy separate viewports and
an `interface_nuxt` DOM overlay cannot reach `project`'s canvas.

The mask is **a perceptual veil only**:

* DOM/CSS overlay (`<div id="render-mask">`), no WebGL, no shader
* no participation in `project`'s render loop
* no interaction with the state machine, point system, path renderer,
  focus state, or any other project subsystem
* opacity is the only animated property
* zero spatial meaning

This is the **second explicit project-side exception** to the "do not
modify project" rule, alongside the path-rendering directive surface (see
*VIEW-3 — PATH RENDERING*). Both exceptions are scoped tightly: pure
rendering surfaces driven by explicit `interface_nuxt` directives, with no
project-side interpretation, derivation, or interaction logic.

### Wire vocabulary

One directive, flowing from `interface_nuxt` to `project`:

* `set-mask({ opacity, duration })` — animate the mask's opacity to the
  given value over `duration` milliseconds. `opacity ∈ [0, 1]`,
  `duration` is clamped to `>= 0`. When `duration === 0` the change is
  instantaneous (no CSS transition).

`opacity` and `duration` are the only values on the wire. Color, z-index,
layout, positioning, and animation easing are project-internal rendering
concerns. `interface_nuxt` is color-blind and easing-blind by design.

### Emission rules

`interface_nuxt` emits `set-mask` at exactly **four** moments:

| Moment                                                    | Emission              | Effect                                                |
| --------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| socket-register (boot or reconnect)                       | `set-mask(0, 0)`      | Defensive: ensure mask is transparent on cold boot.   |
| First VIEW-1 click, **before** `set-state('split', 4500)` | `set-mask(1, 0)`      | Snap mask to opaque, hide morph kickoff frame.        |
| VIEW-3 entry via timer (auto path)                        | `set-mask(0, 400)`    | Fade reveal of settled split state over 400ms.        |
| VIEW-3 entry via skip (user action)                       | `set-mask(0, 0)`      | Instant cut; user explicitly chose to bypass reveal.  |

The reveal duration `400` is owned by `interface_nuxt` as the constant
`MASK_REVEAL_MS`. It runs on the wire as `set-mask(0, 400)`; the constant
itself is not on the wire.

The ordering at the VIEW-1 click moment is **load-bearing**:

* `set-mask(1, 0)` MUST be emitted **before** `set-state('split', 4500)`.
* `socket.io-client` preserves emission order on a single connection, so
  `project` applies the mask snap before it begins the morph. Without that
  ordering the user would briefly see the morph kickoff frame.

The skip exit path is **structurally different** from the auto exit:

* Auto: `set-mask(0, 400)` — perceptual reveal.
* Skip: `set-mask(0, 0)` — perceptual cut. Whatever frame `project` is
  currently rendering becomes visible the moment the user clicks skip.

Both paths preserve the same wire identity for `focus(storedImageId)` at
VIEW-3 entry; only the `set-mask` emission's `duration` differs.

### Synchronization

There is **no coordinated synchronization** between the mask and the
morph. Both timelines derive from the same `interface_nuxt`-owned constant
`SPLIT_TRANSITION_MS = 4500`, which keys both the `set-state('split', …)`
duration and the VIEW-2 auto-advance timer. The mask is snapped to opaque
at click time and remains opaque until the auto-advance fires (at
`SPLIT_TRANSITION_MS`) or the user skips. They cannot drift because there
is nothing to coordinate.

### Actions that do NOT emit `set-mask`

* VIEW-3-internal actions (`activateCentral`, `stepBack`, `stepForward`,
  `jumpToHistory`, `confirmOverview`) — the mask is not used inside
  VIEW-3.
* `enterRelationalView` other than as described above — only one mask
  emission per VIEW-3 entry, at entry.
* History navigation — emits **only** `focus(id)`, never `set-mask`.

### Project-side rendering contract

`project` exposes one DOM element, `<div id="render-mask">`, sibling to
the four `<div id="container-*">` canvas containers. Default CSS:

* `position: fixed; inset: 0` — covers the full viewport
* `pointer-events: none` — never intercepts input
* `z-index: 1000` — above all four canvases
* `opacity: 0` — transparent by default
* `background: #1a1a1a` — color chosen inside `project`

On wire receipt of `set-mask(opacity, duration)`:

* If `duration === 0`: set `transition: none`, then set `opacity` — change
  is instantaneous.
* If `duration > 0`: set `transition: opacity ${duration}ms linear`, force
  a reflow (`void el.offsetWidth`), then set `opacity` — change animates.

The forced reflow is required so the browser registers the new transition
value before the opacity change; without it consecutive style assignments
can be batched and the transition skipped.

### Invariants

* `set-mask` never touches `project`'s state machine, render loop, point
  system, path renderer, or focus state. It is **purely a DOM style
  mutation** on a single element.
* The mask is **client-only visual state**. Not persisted on the server,
  not in `localStorage`, not on the wire beyond the per-event directive.
* Color and easing are project-internal. `interface_nuxt` only sends
  `opacity` + `duration`.
* `set-mask` does NOT participate in the deterministic render-state
  pipeline (`set-state` + `focus` + path directives). It is a pure
  perceptual overlay layered on top.
* Boot handshake idempotency: `set-mask(0, 0)` at register is defensive —
  it leaves the mask transparent regardless of prior state.
* The mask is a **physical companion** to the interface-side VIEW-2
  surface and VIEW-3 reveal overlay, which mask `interface_nuxt`'s own
  viewport. The two surfaces are independent — each system masks itself.

---

## CANVAS BACKGROUND

VIEW-3 exposes a user-facing toggle to swap project's canvas background
between two presentation modes — `'black'` and `'gradient'`. The actual
backgrounds live in `project`'s CSS; `interface_nuxt` only sends an
explicit mode directive.

The background swap is **a perceptual presentation toggle only**:

* CSS rules selecting on `body[data-canvas-bg="..."]`, no WebGL, no shader
* no participation in `project`'s render loop
* no interaction with the state machine, point system, path renderer,
  focus state, or any other project subsystem
* the only mutation is a single DOM `data-canvas-bg` attribute on `<body>`
* zero spatial meaning

This is the **third explicit project-side exception** to the "do not
modify project" rule, alongside the path-rendering directive surface (see
*VIEW-3 — PATH RENDERING*) and the render-mask directive surface (see
*VIEW-2 — RENDER MASK*). All three exceptions are scoped tightly: pure
rendering surfaces driven by explicit `interface_nuxt` directives, with no
project-side interpretation, derivation, or interaction logic.

### Wire vocabulary

One directive, flowing from `interface_nuxt` to `project`:

* `set-canvas-bg({ mode })` — set `body[data-canvas-bg]` to the given mode.
  `mode ∈ { 'black', 'gradient' }`. Unknown modes are dropped with a warning.

`mode` is the only value on the wire. Color, gradient stops, attachment,
and any other style detail are project-internal rendering concerns. The
set of available modes is fixed and defined by `project`'s CSS;
`interface_nuxt` only references modes by name.

### Emission rules

`interface_nuxt` emits `set-canvas-bg` at:

| Moment                                       | Emission                              | Effect                                       |
| -------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| socket-register (boot or reconnect)          | `set-canvas-bg(store.canvasBackground)` | Sync project to interface-side store value. |
| User clicks `black` or `gradient` in VIEW-3  | `set-canvas-bg(mode)`                 | Apply the user's selection.                  |

The interface holds the authoritative value as `canvasBackground` in the
store. On every register — including reconnects — the current store value
is re-emitted so a freshly-connected project lands on the correct
background regardless of its prior state.

### Actions that do NOT emit `set-canvas-bg`

* Any non-VIEW-3 action (VIEW-1 selection, VIEW-2 skip, etc.).
* Any VIEW-3 progression action (`activateCentral`, `confirmOverview`,
  history navigation, etc.) — the background is orthogonal to render
  state and never changes implicitly.

### Project-side rendering contract

`project` selects on `body[data-canvas-bg="<mode>"]` in `style.css`. Each
mode rule fully overrides `.container`'s background to the corresponding
presentation. The default (no attribute set) falls back to `#000000` so a
cold boot before any wire emission is well-defined.

On wire receipt of `set-canvas-bg({ mode })`:

* Validate `mode` is one of the accepted values; drop with a warning
  otherwise.
* Set `document.body.dataset.canvasBg = mode`. No render-loop interaction,
  no style mutation beyond the attribute.

### Invariants

* `set-canvas-bg` never touches `project`'s state machine, render loop,
  point system, path renderer, or focus state. It is **purely a DOM
  attribute mutation** on `<body>`.
* The background mode is **client-only visual state**. Not persisted on
  the server, not in `localStorage`, not on the wire beyond the per-event
  directive.
* All presentation specifics (colors, gradients, attachment) are
  project-internal. `interface_nuxt` only sends the mode name.
* `set-canvas-bg` does NOT participate in the deterministic render-state
  pipeline (`set-state` + `focus` + path directives). It is a pure
  perceptual presentation toggle layered on top.
* Boot handshake: `set-canvas-bg(store.canvasBackground)` is emitted at
  every register so project's background reflects the interface store on
  reconnect.
* The set of available modes is **owned by project's CSS**. Adding a new
  mode requires adding both a `body[data-canvas-bg="..."]` rule in
  `project/src/style.css` AND extending the accepted-modes validation in
  `project/src/commands.js`'s `setCanvasBg` AND `interface_nuxt`'s
  `setCanvasBg` emitter typing.

---

# CURRENT DEVELOPMENT SCOPE

Current phase:
interface_nuxt prototype

For now, only work inside:

interface_nuxt

Do not modify project, **with three explicit exceptions**:

1. The user-driven path-rendering directive surface inside `project` —
   `path-segment`, `path-truncate`, and the `pathTrace` primitive they
   drive — is the canonical visual path system and is permitted to
   evolve. The legacy `pathPlayer` / `simulatePath` machinery in
   `project` must remain untouched and unreferenced from
   `interface_nuxt`. See *VIEW-3 — PATH RENDERING*.
2. The render-mask directive surface inside `project` — `set-mask`, the
   `<div id="render-mask">` DOM element, and its CSS — is a perceptual
   veil over project's canvas during the VIEW-2 buffer phase. It is a
   pure DOM/CSS overlay with no render-loop, state-machine, or
   interaction-logic participation. See *VIEW-2 — RENDER MASK*.
3. The canvas-background directive surface inside `project` —
   `set-canvas-bg`, the `body[data-canvas-bg="..."]` selector rules in
   `style.css`, and the `<body>` `data-canvas-bg` attribute — is a
   perceptual presentation toggle for the canvases' backdrop. It is a
   pure DOM/CSS overlay with no render-loop, state-machine, or
   interaction-logic participation. See *CANVAS BACKGROUND*.

All three exceptions are scoped tightly: pure rendering surfaces driven
by explicit `interface_nuxt` directives. No project-side interpretation,
derivation, or interaction logic is permitted inside any of them.

At this stage:

* project remains isolated
* relation datasets are temporary JSON mocks
* websocket synchronization is still partial
* no final visual design exists yet
* no final camera choreography exists yet
* no LLM interpretation layer exists yet

The current goal is only to validate:

* interaction flow
* state progression
* navigation memory
* server orchestration
* relational synchronization
* reversible navigation
* relation propagation
* synchronized state updates

The current server layer mainly exists to prepare the future websocket-based synchronization layer between:

* interface_nuxt
* project

The long-term architecture relies on a persistent websocket connection through which synchronized interaction states will be transmitted from the server to project in real time.

project should temporarily be treated as a passive receiver that will later subscribe to the interaction state generated by interface_nuxt through this websocket synchronization layer.

---

# DEVELOPMENT RULES

Do not:


* duplicate relation logic across layers
* bypass the server
* create direct interface/project communication
* introduce premature optimization
* implement final visual polish yet
* move relational computation into project
* move spatial logic into interface_nuxt

Focus on:

* clean state flow
* synchronization
* separation of responsibilities
* reactive architecture
* reversible navigation inside VIEW-3
* server-centered orchestration
* stable interaction state propagation
* relational consistency across systems

The project is not a single application.

It is a distributed system of synchronized interpretative layers.
