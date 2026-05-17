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

`interface_nuxt` is the sole authority for `project`'s render state. The state is
computed explicitly from two store values and emitted over the socket. `project`
never infers, derives, or interprets. The pipeline is **deterministic, not emergent**:

```text
interface_nuxt  →  decides project state from (VIEW + imageClick)
                →  emits set-state(state) and focus(id)
socket          →  transport only
project         →  pure renderer of (state, focus(id), time)
```

### State table

The state is driven by `imageClick` (and, for `FOCUS`, by VIEW-3 being active).
**VIEW-2 does not appear here** — it is a UI-only phase and is not part of project's
state machine.

| Trigger condition                                          | project state |
| ---------------------------------------------------------- | ------------- |
| pre-selection (`imageClick = 0`)                           | `SINGLE`      |
| first VIEW-1 click — at the moment of the click            | `FADE`        |
| VIEW-3 active (any `imageClick`, until OVERVIEW confirmed) | `FOCUS`       |
| user **explicitly confirms** OVERVIEW after `imageClick ≥ 10` | `OVERVIEW`    |

**OVERVIEW is not a threshold-triggered state.** Reaching `imageClick ≥ 10` only
marks OVERVIEW as **eligible**; the system stays in `FOCUS` with the last
`focus(id)` fully rendered. The transition to `OVERVIEW` happens only when the user
performs an explicit confirmation action (e.g. clicking a confirmation button in
VIEW-3) — see *OVERVIEW eligibility & confirmation* below.

### `imageClick` — progression counter

`imageClick` is **strictly monotonic** and counts only **new image selection events**:

* VIEW-1 selection (the first image): **+1**
* VIEW-3 `central_activate` (related-image click): **+1**
* History navigation (`stepBack`, `stepForward`, `jumpToHistory`): **no change**
* VIEW transitions themselves: **no change**

VIEW-3 entry **does not** increment `imageClick` — it reuses the image stored from VIEW-1.

Consequences:

* `OVERVIEW` is **irreversible within a session**. Once `imageClick ≥ 10`, the state
  remains `OVERVIEW` even if the user navigates back in history.
* History navigation never changes project state and never appears on the socket.
* `imageClick` is a progression counter, not a navigation counter.

### Wire behavior (final)

| State      | Emitted from                                                | Wire emission                                          |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| `SINGLE`   | socket-register bootstrap                                    | `set-state('SINGLE')`                                  |
| `FADE`     | `selectImage` (the first VIEW-1 click)                       | `set-state('FADE', 4000–5000)` — no `focus`            |
| `FOCUS`    | `enterRelationalView` (VIEW-3 entry)                         | `set-state('FOCUS')` + `focus(storedImageId)`          |
| `FOCUS` (in flight) | `activateCentral` (each new related-image click)    | `focus(newImageId)`                                    |
| `OVERVIEW` | `confirmOverview()` — explicit user action after `imageClick ≥ 10` | `set-state('OVERVIEW')` — emitted exactly once   |

**VIEW-2** is a UI-only buffer phase. During VIEW-2 the socket emits **nothing**;
project remains in the `FADE` state that was already set at the click moment in
VIEW-1.

**History navigation** in any state (`stepBack`, `stepForward`, `jumpToHistory`)
emits **nothing** to the socket. It is a UI-side revisit of past store values and
does not move the project state machine.

### OVERVIEW eligibility & confirmation

OVERVIEW is a **deliberate transition**, not a threshold trigger. Two pieces of
store state govern it:

* `overviewEligible` (derived): `true` once `imageClick ≥ 10` AND OVERVIEW has not
  yet been confirmed.
* `overviewConfirmed` (boolean flag): `false` initially; set to `true` exactly once
  by the `confirmOverview()` store action.

Flow:

1. User keeps clicking related images in VIEW-3. `imageClick` keeps incrementing.
2. When `imageClick` reaches 10, `overviewEligible` becomes `true`. The system
   **stays in `FOCUS`** — the last `focus(id)` remains active, fully rendered,
   and the user can keep navigating or selecting normally.
3. The VIEW-3 UI surfaces a confirmation control (e.g. a button) only while
   `overviewEligible` is `true`.
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

* Increments **only on explicit user image selection events** *before* OVERVIEW
  is confirmed (VIEW-1 first click; VIEW-3 `central_activate`).
* Never affected by VIEW transitions, history navigation, `confirmOverview()`,
  or any post-OVERVIEW interaction.

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

## VIEW-1

VIEW-1's UI is a disperse-style selection grid of hoverable, clickable images.

While the user has not yet selected anything (`imageClick = 0`), the corresponding
project state is `SINGLE`, emitted via `set-state('SINGLE')` on socket-register
bootstrap. At the moment of the first click, `imageClick` becomes 1 and the system
emits `set-state('FADE', 4000–5000)` — then transitions the UI to VIEW-2.

When the user selects an image:

* the image ID is stored in the global interaction state
* the image becomes the active central image reference
* the system transitions permanently to VIEW-2

The image already exists in memory before becoming visually central later.

---

## VIEW-2

VIEW-2 is a **UI-only** intermediate transition phase. It is mostly textual and
temporal, and emits **nothing** to the socket. The project state during VIEW-2
remains `FADE`, which was already emitted at the moment of the VIEW-1 click that
triggered VIEW-2.

Its role is to create a temporary UI phase between:

* image selection
* relational exploration

The transition to VIEW-3 can later happen:

* automatically after a duration
* or through user action

The transition logic belongs to the global state machine, not to the component itself.

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

Inside VIEW-3:

* every newly activated image is added to navigation history
* previously activated images remain accessible
* the user can reactivate older central images
* reactivating a previous image restores the navigation state at that point in the timeline
* if the user selects a different image from that restored state, the previous forward timeline is discarded and replaced by the new navigation branch

The navigation history therefore behaves as a persistent but rewritable relational memory.

Through interaction and traversal, previously activated images remain available as re-enterable relational states, while future paths remain mutable and can be rewritten through new selections.

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

* import Three.js into interface_nuxt
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
