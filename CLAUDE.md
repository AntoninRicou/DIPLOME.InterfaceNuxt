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

`interface_nuxt` is the sole authority for `project`'s render state. The state
is computed explicitly from the store and emitted over the socket. `project`
never infers, derives, or interprets. The pipeline is **deterministic, not
emergent**:

```text
interface_nuxt  →  decides project state from
                     (VIEW, imageClick, historyIndex, overviewConfirmed)
                →  emits set-state(state) and focus(id)
socket          →  transport only
project         →  pure renderer of (state, focus(id), time)
```

`imageClick` keys the `SINGLE → FADE` boot transition only. Inside VIEW-3 the
meaningful progression measure is **active branch depth** (`historyIndex + 1`),
bounded to `[1..10]` — see *NAVIGATION MEMORY* and *OVERVIEW eligibility &
confirmation*. `overviewConfirmed` is the irreversible OVERVIEW latch.

### State table

Drivers: `imageClick` keys `SINGLE` / `FADE`; VIEW-3 entry keys `FOCUS`;
explicit user confirmation **while at branch position `>= 10`** keys
`OVERVIEW`. **VIEW-2 does not appear here** — it is a UI-only phase and is not
part of project's state machine.

| Trigger condition                                                       | project state |
| ----------------------------------------------------------------------- | ------------- |
| pre-selection (`imageClick = 0`)                                        | `SINGLE`      |
| first VIEW-1 click — at the moment of the click                         | `FADE`        |
| VIEW-3 active (any `imageClick`, until OVERVIEW confirmed)              | `FOCUS`       |
| user **explicitly confirms** OVERVIEW while at branch position `>= 10`  | `OVERVIEW`    |

**OVERVIEW is not a threshold-triggered state.** Reaching branch position
`>= 10` (i.e. `historyIndex + 1 >= 10`) only marks OVERVIEW as **eligible**;
the system stays in `FOCUS` with the last `focus(id)` fully rendered. The
transition to `OVERVIEW` happens only when the user performs an explicit
confirmation action (e.g. clicking a confirmation button in VIEW-3) — see
*OVERVIEW eligibility & confirmation* below.

### `imageClick` — session-level selection counter

`imageClick` is a **strictly monotonic, session-wide selection counter**.
Within the project-state machine it serves a **single** structural role:
distinguishing pre-selection (`imageClick === 0` → `SINGLE`) from
post-selection (`imageClick > 0` → `FADE` / `FOCUS`). Beyond that boot gate,
`imageClick` is preserved as a historical / telemetry trace on the HTTP
`/api/interaction` log — it is **not** the progression metric for VIEW-3, and
it does **not** drive any further state transition.

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

* `OVERVIEW` is **irreversible within a session**. Once confirmed, the state
  remains `OVERVIEW` even if the user navigates back in history.
* History navigation never changes project state. It emits **only** `focus(id)`
  for camera follow — see the wire-behavior table above.
* `imageClick` is a session-level selection counter, **not** the VIEW-3
  progression metric and **not** the OVERVIEW eligibility driver. It must
  not be conflated with `historyIndex + 1` (the active branch depth) — see
  *OVERVIEW eligibility & confirmation* below for the comparison table.

### Wire behavior (final)

| State      | Emitted from                                                | Wire emission                                          |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| `SINGLE`   | socket-register bootstrap                                    | `set-state('SINGLE')`                                  |
| `FADE`     | `selectImage` (the first VIEW-1 click)                       | `set-state('FADE', 4000–5000)` — no `focus`            |
| `FOCUS`    | `enterRelationalView` (VIEW-3 entry)                         | `set-state('FOCUS')` + `focus(storedImageId)`          |
| `FOCUS` (in flight) | `activateCentral` (each new related-image click)    | `focus(newImageId)`                                    |
| `OVERVIEW` | `confirmOverview()` — explicit user action while at branch position `>= 10` | `set-state('OVERVIEW')` — emitted exactly once   |

**VIEW-2** is a UI-only buffer phase. During VIEW-2 the socket emits **nothing**;
project remains in the `FADE` state that was already set at the click moment in
VIEW-1.

**History navigation** in any state (`stepBack`, `stepForward`, `jumpToHistory`)
emits **only** `focus(id)` on the wire, where `id` is the resolved past target.
It does **not** emit `set-state`, does **not** change `projectState`, and does
**not** affect `imageClick`. Its sole socket purpose is to move project's camera
to track the user's UI navigation through past selections.

### OVERVIEW eligibility & confirmation

OVERVIEW is a **deliberate transition**, not a threshold trigger. Two pieces of
store state govern it:

* `overviewEligible` (derived): `true` when the **currently active branch
  depth** is at or above the threshold AND OVERVIEW has not yet been
  confirmed. Concretely:
  `historyIndex + 1 >= OVERVIEW_THRESHOLD && !overviewConfirmed`.
* `overviewConfirmed` (boolean flag): `false` initially; set to `true` exactly
  once by the `confirmOverview()` store action.

The eligibility gate is **branch-dependent**, not cumulative. The active
branch is bounded to a maximum depth of `OVERVIEW_THRESHOLD = 10` (see
*NAVIGATION MEMORY*), so:

* OVERVIEW becomes eligible the moment the active traversal **reaches** depth
  10 — i.e. the user has built up a 10-image relational route inside the
  current branch.
* Stepping back below depth 10 (`stepBackInHistory` / `jumpToHistory` to an
  earlier index) **hides** the button — eligibility is recomputed on every
  position change. The user is now mid-branch, not at the tip.
* Returning to the tip (`stepForwardInHistory`), or activating new images
  from an earlier position (which truncates the forward branch and appends),
  re-enables eligibility the moment the active depth is back to 10.
* `imageClick` keeps its own session-counter rules independently of all of
  this; it does **not** gate the button.

`imageClick` and `overviewEligible` must not be conflated:

| Quantity            | Type                  | Bounds   | Mutates on history nav? | Drives OVERVIEW eligibility? |
| ------------------- | --------------------- | -------- | ----------------------- | ---------------------------- |
| `imageClick`        | session selection log | `[0, ∞)` | No                      | No                           |
| `historyIndex + 1`  | active branch depth   | `[1, 10]`| **Yes**                 | **Yes**                      |

The **irreversible** portion of OVERVIEW begins only after
`overviewConfirmed === true`. Up to that point eligibility is fluid and tracks
the active branch depth; once confirmed, the latch is permanent (see
*OVERVIEW — terminal, read-only state* below).

Flow:

1. User keeps clicking related images in VIEW-3. Each new selection appends to
   `navigationHistory` and advances `historyIndex` (active branch depth).
   `imageClick` also ticks for the HTTP log but is not consulted by the state
   machine beyond the initial `SINGLE → FADE` boot gate.
2. When `historyIndex + 1` reaches 10, `overviewEligible` becomes `true`. The
   system **stays in `FOCUS`** — the last `focus(id)` remains active, fully
   rendered. Because the branch is at its maximum depth, no further image can
   be appended; the user must either confirm OVERVIEW or step back to make
   room for a new sub-branch.
3. The VIEW-3 UI surfaces a confirmation control (e.g. a button) only while
   `overviewEligible` is `true`. If the user steps back below depth 10, the
   control disappears; if they return to the tip (or rebuild a sub-branch
   back to depth 10 after stepping back), it reappears.
4. When the user explicitly confirms, `confirmOverview()`:
   * sets `overviewConfirmed = true`
   * emits `set-state('OVERVIEW')` over the socket exactly once
   * does **not** touch `imageClick`

### OVERVIEW — terminal, read-only state

After confirmation OVERVIEW is **terminal and irreversible** for the rest of the
session. The state machine and the interaction logic are both frozen:

* `overviewConfirmed` stays `true`.
* `overviewEligible` becomes `false` (the confirmation control disappears).
* `imageClick` is **frozen** — it never increments again, by any path.
* No further `set-state` emissions occur. The system stays in OVERVIEW.
* `activateCentral` does **not** trigger any state logic — no `imageClick++`,
  no derived-state recomputation, no setState. Interaction logic does not
  re-open in any way.
* `activateCentral` **may** still emit `focus(id)` for log consistency on the
  wire, but `project` **must not** use it for spatial rendering and **must not**
  use it to drive any state change. OVERVIEW is read-only on the spatial side.
* UI-side store mutations (e.g. updating the displayed central image or the
  navigation history view) remain available for read-only exploration of past
  state, but they have no progression effect.

Summary of `imageClick` rules (final):

* Increments **only on explicit user image selection events** that actually
  extend the active branch, *before* OVERVIEW is confirmed (VIEW-1 first
  click; VIEW-3 `central_activate` while not at the branch cap).
* Never affected by VIEW transitions, history navigation, `confirmOverview()`,
  or any post-OVERVIEW interaction.
* Is **not** the OVERVIEW eligibility driver and **not** the VIEW-3
  progression metric. Eligibility is recomputed from the active branch depth
  (`historyIndex + 1`, bounded to `[1..10]`) on every history change.
  `imageClick` is preserved as a session-level selection trace only.

Why this exists: the confirmation step lets the last image be properly anchored
in `FOCUS` before any zoom-out, so the transition to OVERVIEW is intentional and
stable. After OVERVIEW, the user is in a read-only exploration mode — clicks
still register in the UI (and on the wire as log artifacts) but no longer drive
progression or rendering.

### Implementation rule — structural guard (defensive)

The post-OVERVIEW mutation prohibition for `activateCentral` is enforced
**structurally**, not by scattered conditional checks. `activateCentral` MUST
place a hard early-return guard immediately after its existing precondition
checks (VIEW-3 check and same-id dedup), so that **all mutation code below the
guard is provably unreachable** once `overviewConfirmed === true`:

```ts
function activateCentral(id) {
  if (currentView.value !== 'VIEW_3') return
  if (activeCentralImageId.value === id) return

  // ── HARD GUARD — terminal OVERVIEW state ──
  if (overviewConfirmed.value) {
    emit({ /* central_activate trace */ })   // /api/interaction log
    projectSocket.focus(id)                  // wire log only
    return
  }

  // ── Pre-OVERVIEW only. Provably unreachable post-confirmation. ──
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

## VIEW-1 — pre-selection UI state (interface_nuxt)

The VIEW-1 pre-selection state uses the existing disperse layout as a UI-only
interaction surface. It is **not** a project state and has no spatial meaning.

### State behavior

At system bootstrap, `project` is in `SINGLE`.

When the first image is selected in VIEW-1:

* the selection is stored in the interaction state
* `imageClick` is incremented (0 → 1)
* the system transitions immediately and permanently to VIEW-2
* `project` receives `set-state('FADE', 4500)`

**No `focus(id)` is emitted at this stage.**

The first `focus(id)` is emitted only later, upon VIEW-3 entry, together with
`set-state('FOCUS')` + `focus(storedImageId)`.

### FADE duration is project-deterministic

`set-state('FADE', 4500)` carries a **fixed** project-side duration of 4500ms.
`interface_nuxt` never extends, shortens, or otherwise modifies this duration —
project is the source of truth for FADE timing.

VIEW-2 is the **UI mirror** of this state. By default it lasts the same 4500ms,
but it may be exited early by an explicit user skip action. The skip is purely
a UI-side trigger:

* it does **not** modify project-side FADE
* it does **not** affect `imageClick`
* it does **not** introduce any additional project state
* it emits **no** intermediate socket event

Transition timeline:

1. VIEW-1 click → emits `set-state('FADE', 4500)` **immediately**.
2. VIEW-2 begins and runs for up to 4500ms (or until user skip).
3. On either exit, VIEW-3 entry emits `set-state('FOCUS')` + `focus(storedImageId)`.

Both exit paths produce the **same** deterministic emission sequence; only the
timing of step 3 varies. Project's response to that emission is project's own
deterministic decision.

### Semantic role of "disperse"

`disperse` is strictly a **UI layout term** describing the visual arrangement of
selectable images. It does **not** correspond to any `project` rendering mode.

---

## VIEW-2 — UI transition phase (interface_nuxt)

VIEW-2 is a UI-only transition phase **derived from** the project-side `FADE`
state.

`project` defines FADE duration (4500ms) as **immutable configuration for
transition timing**.

`set-state('FADE', 4500)` is emitted immediately upon the VIEW-1 selection
event, triggering the transition into VIEW-2. The project-side `FADE` is
deterministic and is not modified by user interaction; VIEW-2 is the UI
interpretation of this state.

### Exit conditions

VIEW-2 can end via two equivalent UI triggers:

* Automatic completion when the 4500ms FADE duration elapses.
* Optional user skip action in `interface_nuxt`.

Both triggers result in the same deterministic transition at VIEW-3 entry:

```
set-state('FOCUS') + focus(storedImageId)
```

Only the *moment* of VIEW-3 entry varies between the two triggers.

### Constraints

* Skip does not modify project-side FADE.
* Skip does not affect `imageClick`.
* Skip does not introduce any additional project state.
* `project` remains the source of truth for FADE timing (4500ms).
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
  meaningful progression measure inside VIEW-3 — it is what gates OVERVIEW
  eligibility (see *OVERVIEW eligibility & confirmation*)
* `imageClick` continues to count every new image selection event for the
  HTTP behavioral log (`/api/interaction`), but it is **not** the VIEW-3
  progression metric and **not** an unbounded "how far have we come" gauge;
  it is a session-level selection trace

Re-traversal of prior positions within the active branch is unbounded — the
user can step back and forward freely. Forward paths beyond the active
position are mutable and get rewritten on the next new activation. Branches
discarded by truncation are not retained anywhere; they are gone.

---

# CURRENT DEVELOPMENT SCOPE

Current phase:
interface_nuxt prototype

For now, only work inside:

interface_nuxt

Do not modify project yet.

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
