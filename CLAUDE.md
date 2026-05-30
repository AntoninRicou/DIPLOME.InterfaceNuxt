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

VIEW_0 → VIEW_1 → VIEW_2 → VIEW_3 → VIEW_4

* **VIEW_0 (ONBOARDING)** — gradient-backdrop title screen ("PROXIMA"). Click
  anywhere to advance. No project emissions; the standalone project sits in
  its boot `single` state throughout.
* **VIEW_1 (EXPLANATION)** — gradient backdrop with the structural cross
  drawing from center over the full panel runtime. Two rotating text panels
  describing the tool, 5 s each. A `>` skip chevron is available; the
  advance also fires automatically when the last panel finishes. On
  advance, `enterEntryView` emits a hidden-morph sequence
  (`set-mask(1, 400)` → `set-state('overview', 500)` → `set-mask(0, 400)`)
  so the standalone project transitions `single → overview` behind the
  opaque mask.
* **VIEW_2 (ENTRY)** — canvas-disperse entry phase, an iframe-embedded
  instance of `project` running locally inside `interface_nuxt`. The
  standalone project is in `overview`. Clicking a sprite on the iframe
  fires `selectImage`, which emits only `focus(id)` (no `set-state` —
  project stays in overview) and advances to VIEW_3.
* **VIEW_3 (TRANSITION)** — the four-quadrant zoom-in step. Project starts
  in `overview`. The user clicks four `+` crosses, one centered in each
  quadrant. Each click fires `set-canvas-zoom` so the standalone visually
  morphs canvas-by-canvas from overview to a split-like rendering on the
  selected image (see *VIEW_3 — QUADRANT ZOOM MECHANIC*). When all four
  are zoomed, the modes caption + corner labels + advance `+` button fade
  in. Clicking advance fires `setState('split', 0)` (instant state-name
  flip — no visible change, since the overrides already match split) and
  advances to VIEW_4.
* **VIEW_4 (RELATIONAL)** — the main relational interface. Project is in
  `split`. Four named relation components — **Mirror** (tl), **Trace**
  (tr), **Shift** (bl), **Replay** (br) — surround the centered image (see
  *VIEW_4 — COMPONENT LAYOUT* and *VIEW_4 — RELATION CASCADE*).

Once the system enters VIEW_4, it must never return to:

* VIEW_0
* VIEW_1
* VIEW_2
* VIEW_3

However, navigation inside VIEW_4 remains reversible.

The user must be able to:

* reactivate previous central images
* revisit earlier navigation states
* move backward through navigation history

The irreversible logic only applies to the global progression of views.

### Historical numbering note

Earlier in the project's life, the view chain ran `VIEW-0 → VIEW-2 → VIEW-3`
(numbering with no VIEW-1, since the old DOM-list VIEW-1 had already been
removed). The numbering was shifted to make room for ONBOARDING and
EXPLANATION at the head of the flow:

| Old (pre-rename) | New (current) | Phase alias |
| ---------------- | ------------- | ----------- |
| —                | VIEW_0        | ONBOARDING  |
| —                | VIEW_1        | EXPLANATION |
| VIEW-0           | VIEW_2        | ENTRY       |
| VIEW-2           | VIEW_3        | TRANSITION  |
| VIEW-3           | VIEW_4        | RELATIONAL  |

Some older subsections below were written under the previous numbering and
may still refer to "VIEW-0", "VIEW-2", "VIEW-3". Translate via the table:
the *roles* of those phases are unchanged. The `viewState` store carries
both the positional id (`VIEW_X`) and a role-based phase alias
(`ENTRY` / `TRANSITION` / `RELATIONAL` / ...); guards in `interaction.ts`
go through the phase, not the id (see *VIEW STATE MANAGER*).

---

## VIEW STATE MANAGER

View routing is owned by a dedicated Pinia store at
[`app/stores/viewState.ts`](app/stores/viewState.ts), separate from the
interaction store. It is the **single semantic boundary** between
positional view ids and the components that render them.

### Three concerns, one file

1. **Ordered progression** — the canonical forward chain.

   ```ts
   const VIEW_ORDER: readonly ViewState[] =
     ['VIEW_0', 'VIEW_1', 'VIEW_2', 'VIEW_3', 'VIEW_4'] as const
   ```

2. **Component registry** — view id → component. The *only* place where
   view-id strings meet `.vue` files.

   ```ts
   const REGISTRY: Record<ViewState, Component> = {
     VIEW_0: markRaw(View0Onboarding),
     VIEW_1: markRaw(View1Explanation),
     VIEW_2: markRaw(View2Disperse),
     VIEW_3: markRaw(View3Transition),
     VIEW_4: markRaw(View4Relational),
   }
   ```

   `markRaw` prevents Pinia from making component definitions reactive
   (cheap + avoids devtools warnings).

3. **Role-based phase aliases** — a parallel mapping from positional id to
   semantic phase name. Decouples interaction logic from view numbering.

   ```ts
   export type Phase =
     | 'ONBOARDING' | 'EXPLANATION' | 'ENTRY' | 'TRANSITION' | 'RELATIONAL'

   const PHASE_BY_VIEW: Record<ViewState, Phase> = {
     VIEW_0: 'ONBOARDING',
     VIEW_1: 'EXPLANATION',
     VIEW_2: 'ENTRY',
     VIEW_3: 'TRANSITION',
     VIEW_4: 'RELATIONAL',
   }
   ```

   The `Record<ViewState, Phase>` typing is load-bearing: adding a new
   `ViewState` literal forces a matching `PHASE_BY_VIEW` entry or the file
   fails to compile.

### Public surface

```ts
{
  current: Ref<ViewState>,                  // 'VIEW_0' initially
  activeComponent: ComputedRef<Component>,  // REGISTRY[current.value]
  order: readonly ViewState[],
  is(phase: Phase): boolean,                // PHASE_BY_VIEW[current] === phase
  advance(): void,                          // next id in `order`, no-op at end
  goTo(name: ViewState): void,              // direct set, no-op for unknown
}
```

### Architectural constraints

These are load-bearing — violating any of them re-introduces the coupling
this manager exists to eliminate.

1. **`viewState.ts` must not import `interaction.ts`.** The dependency
   direction is one-way:
   - `pages/index.vue` → `useViewStateStore()`
   - `stores/interaction.ts` → `useViewStateStore()`
   - `stores/viewState.ts` → no app-store imports

2. **`viewState.ts` owns routing concerns only.** Its public surface is
   exactly the six entries above — no socket logic, no navigation history,
   no `selectImage`, no relational logic, no telemetry emissions.

3. **`interaction.ts` owns interaction state and side effects.**
   `selectImage`, `activateCentral`, `enterEntryView`, `enterRelationalView`,
   `navigationHistory`, `historyIndex`, `overviewConfirmed`, `imageClick`,
   all `projectSocket.*` calls, all `useInteractionEmitter` events. Its
   handlers do their existing work and end with `viewState.advance()` /
   `viewState.goTo(...)`.

4. **The registry is the semantic boundary.** View ids and component
   files meet only in `viewState.ts`. Renaming a view id (or inserting a
   new phase) touches the union in `types/interaction.ts` plus
   `viewState.ts` — nothing else.

### `is(phase)` not `=== 'VIEW_X'`

`interaction.ts` guards on the phase, never on the view-id literal:

```ts
// in interaction.ts
function selectImage(id: ImageId) {
  if (!viewState.is('ENTRY')) return       // not: viewState.current !== 'VIEW_2'
  ...
}
function activateCentral(id: ImageId) {
  if (!viewState.is('RELATIONAL')) return  // not: viewState.current !== 'VIEW_4'
  ...
}
```

Renaming `VIEW_4` → `VIEW_5` later only touches `viewState.ts` (registry +
`PHASE_BY_VIEW` + initial); `interaction.ts` compiles clean because the
phase name `RELATIONAL` is untouched. Telemetry payloads
(`view_advance.from`, `view_advance.to`) carry raw view ids — they are
pass-throughs of `viewState.current`, so a rename automatically updates
the wire value with no source edit. That's the correct shape of coupling
(downstream consumers want to know which id, not which phase).

### Render dispatch

[`pages/index.vue`](app/pages/index.vue) renders the active component via
Vue's `<Transition>` wrapper around `<component :is>`:

```vue
<main class="bg-gradient">
  <Transition name="view">
    <component
      :is="viewState.activeComponent"
      :key="viewState.current"
    />
  </Transition>
</main>
```

* `:key="viewState.current"` forces Vue to fully unmount + remount the
  outgoing/incoming component on every view change — preserves the
  lifecycle semantics the original `v-if` / `v-else-if` chain had
  (`onMounted` / `onBeforeUnmount` always fire), which matters because
  several views own timers, hover listeners, or iframe instances.
* `<Transition name="view">` (no `mode`, so default cross-fade) overlaps
  both views during a 350 ms opacity tween. `pointer-events: none` on
  `.view-leave-active` keeps the outgoing view from catching clicks.
* `<main class="bg-gradient">` keeps the day gradient continuous through
  the brief overlap (no dark flash). Per CLAUDE.md's existing specificity
  caveat, `<main>` must NOT declare a scoped `background` — the global
  `.bg-gradient` would lose to the higher-specificity scoped rule.

---

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

* **VIEW** (`VIEW_0` / `VIEW_2` / `VIEW_3`) is an **interaction phase**, owned
  by `interface_nuxt`. It describes what the user is doing in the UI:
  selecting (on the embedded canvas), buffering, exploring relations.
* **STATE** (`single` / `split` / `overview` / `disperse`) is a **render
  state**, owned by `project`. It describes what is drawn on the spatial
  canvas: a single full-frame map, the 2×2 relational grid, the zoomed-out
  grid, or the dispersing-particle field. Only the iframe instance ever
  enters `disperse`; the standalone project window cycles through
  `single` / `split` / `overview` only.

VIEW-2 in particular has **no corresponding render state** — it is the UI
mirror of an in-flight `single → split` morph that was kicked off at the
VIEW-0 click. `interface_nuxt` orchestrates interaction phases; `project`
spatializes render states. They speak past each other deliberately, with the
socket as a one-way translation: interaction events → render-state
directives.

`imageClick` and `historyIndex` are interface concepts that *decide which
render state to emit*, but they are never themselves on the wire. The wire
carries only `set-state(name)` and `focus(id)`, both of which use project's
vocabulary.

### State table

Drivers (current flow, post-rename):
* Bootstrap keys the initial `single`.
* The VIEW_1 → VIEW_2 advance (`enterEntryView`) keys the `single → overview` morph (hidden behind a render-mask fade-out / fade-in).
* The VIEW_2 click (`selectImage`) emits only `focus(id)` — project stays in overview.
* Each VIEW_3 quadrant click (`zoomCanvas`) emits `set-canvas-zoom({canvasIndex, imageId})` — per-canvas cameraZ + position tween onto the selected image, no state-name change (see *PER-CANVAS ZOOM*).
* The VIEW_3 → VIEW_4 advance (`enterRelationalView`) flips the state name to `'split'` instantly (`duration: 0`) — visually a no-op because the four overrides already match split's cameraZ.
* Explicit user confirmation in VIEW_4 (while at branch depth ≥ 10) keys the `split → overview` transition.

| Interaction event                                                          | Wire emission                          | Resulting render state |
| -------------------------------------------------------------------------- | -------------------------------------- | ---------------------- |
| socket-register bootstrap or reconnect (no clicks yet, `imageClick = 0`)    | `path-clear` + `set-state('single')` + `set-mask(0, 0)` + `set-canvas-bg(store.canvasBackground)` | `single` (full reset; mask transparent) |
| VIEW_0 → VIEW_1 (`viewState.advance()` from `View0Onboarding` click)        | **nothing**                             | `single` (unchanged)   |
| VIEW_1 → VIEW_2 auto-end-of-panels or skip (`enterEntryView`)               | `set-mask(1, 400)` → `set-state('overview', 500)` (after 400 ms) → `set-mask(0, 400)` (after 900 ms) | `single → overview` (morph hidden behind the opaque mask; total 1.3 s) |
| VIEW_2 → VIEW_3 (`selectImage`, iframe sprite click)                        | `focus(id)` only                       | `overview` (no state change; `focus` is highlight-only per *FOCUS-IN-OVERVIEW*) |
| VIEW_3 quadrant cross click (`zoomCanvas`)                                  | `set-canvas-zoom({ canvasIndex, imageId: activeId })` | `overview` (no state-name change; per-canvas cameraZ + position tween — see *PER-CANVAS ZOOM*) |
| VIEW_3 → VIEW_4 advance-control click (`enterRelationalView('skip')`)       | `set-state('split', 0)` + `focus(activeId)` | `overview → split` (instant flip, no visible change — the four per-canvas overrides already render at split's cameraZ; flip releases the overrides) |
| VIEW_4 related-image click (`activateCentral`, pre-overview, pre-cap)       | `focus(newId)` + `path-segment(prevId, newId)`, prefixed by `path-truncate(historyIndex)` if mid-branch | `split` (no state change) |
| VIEW_4 related-image click (`activateCentral`, at cap or post-overview)     | post-overview: `focus(newId)` only — at cap: **nothing** on the wire | `split` or `overview` (no state change; read-only) |
| history nav (`stepBack` / `stepForward` / `jumpToHistory`)                  | `focus(historicalId)`                  | unchanged — but `focus` pans the camera only when state is not `overview` (see *FOCUS-IN-OVERVIEW*) |
| user **explicitly confirms** overview while at branch depth `>= 10`         | `set-state('overview')`                | `split → overview`     |
| transient hover feedback (`store.setHighlight(id)` from any view)           | `set-highlight({ id: string \| null })` | no render-state change — perceptual overlay only (see *SET-HIGHLIGHT*) |

**`overview` is not a threshold-triggered state.** Reaching branch depth
`>= 10` (i.e. `historyIndex + 1 >= 10`) only marks overview as **eligible**;
the system stays in `split` with the last `focus(id)` fully rendered. The
transition to `overview` happens only when the user performs an explicit
confirmation action (e.g. clicking a confirmation button in VIEW-3) — see
*overview eligibility & confirmation* below.

> **`disperse` render state.** Project's fourth render state, used by the
> VIEW-0 canvas-embed instance only. The standalone project window (the
> relay-connected one) **never** receives `set-state('disperse')`; that
> render state is reached exclusively by the iframe instance, which boots
> directly into `disperse` via the `?embed=1` URL flag and **does not
> connect to the socket relay at all** (see *VIEW-0 — CANVAS ENTRY PHASE*
> and *CURRENT DEVELOPMENT SCOPE* exception #4). The wire vocabulary
> therefore still carries only `single` / `split` / `overview` as
> `set-state` targets; `disperse` is configured at iframe boot, not pushed
> over the wire.

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

* VIEW-0 selection (the first image, picked on the embedded canvas): **+1**
* VIEW-3 `central_activate` (related-image click): **+1**, but only while
  `overviewConfirmed === false` and the activation actually extends the branch
* History navigation (`stepBack`, `stepForward`, `jumpToHistory`): **no change**
* VIEW transitions themselves: **no change**

VIEW-3 entry **does not** increment `imageClick` — it reuses the image stored from VIEW-0.

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
fired at the VIEW-0 click moment. VIEW-2 is the UI mirror of that in-flight
morph; it does not have a render state of its own.

**History navigation** (`stepBack`, `stepForward`, `jumpToHistory`) emits
**only** `focus(id)` on the wire, where `id` is the resolved past target.
It does **not** emit `set-state`, does **not** change project's render
state, and does **not** affect `imageClick`. Its sole socket purpose is to
move project's camera to track the user's UI navigation through past
selections.

**VIEW-3 entry emits no `set-state`.** The `single → split` morph is already
underway (or already complete) from the VIEW-0 click, and project's camera
has been tracking `storedImageId` since that click moment. VIEW-3 entry
re-emits `focus(storedImageId)` as an idempotent re-assertion of the same
target the click already established — project's `focusOn` is idempotent,
so this is a no-op confirmation, not a first-time binding. If the user
skips VIEW-2 early, project's morph naturally truncates — no second
`set-state` is needed.

### Boot reset sequence

On every `register` event between `interface_nuxt` and `project` (initial
connect and reconnect), `interface_nuxt` emits the following directives,
in order:

1. `path-clear`
2. `set-state('single')`
3. `set-mask(0, 0)`
4. `set-canvas-bg(store.canvasBackground)`
5. `set-corner-labels(false)`
6. `set-canvas-text(i, '', '')` for `i ∈ {0,1,2,3}`
7. `set-center-caption('')`

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
* `set-corner-labels(false)` + four-up `set-canvas-text(i, '', '')` +
  `set-center-caption('')` clear every **component-title** surface on
  project so a fresh-mounted interface can never inherit a stale reveal
  from a previous session (e.g. interface reload during VIEW_4 leaving
  `body[data-corner-labels="visible"]` set; without these clears the
  labels would re-appear the next time project hit split or overview).
  CSS also gates each of these surfaces on `:not([data-state="single"])`
  (see *Component-title invariant* below) so they cannot render in the
  boot `single` state regardless of attribute hygiene — the data clears
  here are belt-and-braces.

Ordering between the emissions is cosmetic — the four subsystems
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
| `body[data-corner-labels]` | `set-corner-labels(false)` → attribute cleared |
| Each `.canvas-text` `.visible` + textContent | `set-canvas-text(i, '', '')` × 4 → class removed + text emptied |
| `#center-caption` `.visible` + textContent | `set-center-caption('')` → class removed + text emptied |

Together they leave `project` indistinguishable from a cold boot: empty
path, camera at origin, no focal target, layout in `single`, every
component-title surface empty, auto-morph cycle restarted.

### Component-title invariant

**No component title may render while project is in `single`.** The rule
is enforced **structurally** in `project/src/style.css` by the
`:not([data-state="single"])` guard on every visibility selector that
controls a component-title surface:

* `body[data-corner-labels="visible"]:not([data-state="single"]) .corner-label { opacity: 1 }`
* `body:not([data-state="single"]) .canvas-text.visible { opacity: 1 }`
* `body:not([data-state="single"]) #center-caption.visible { opacity: 1 }`

Why this is needed: corner labels, canvas-texts, and the centre caption
each carry their own DOM state (data-attribute on `<body>`, `.visible`
classes on the elements). That state is set during VIEW_3 / VIEW_4 by
interface emissions, but project's `set-state` directives never clear
it — so an interface reload mid-session can leave the project DOM
holding "labels revealed" while the boot reset sends project back to
`single`. The CSS guard makes this impossible to perceive: the first
visible appearance of any component title is gated on project being out
of `single`, which in the canonical flow means **the moment all four
VIEW_3 quadrant crosses have been clicked and the user has advanced
toward `split`** (corner labels + centre caption fade in then, on both
screens, via the 1 s VIEW_3 reveal timer).

The boot-reset clears (#5–#7 above) are belt-and-braces: they keep the
underlying data-attribute / `.visible` state honest so the structural
guard never has to mask a divergence between data and visuals. The
invariant holds **even if** one of the clears were skipped — the CSS
rule is the load-bearing piece.

**Second-layer defensive clear in `enterEntryView`.** The boot reset
only fires on a full interface reload (socket re-register). A *hot
reload* (Vite HMR refreshing the module without socket disconnect)
doesn't trigger it, so a developer iterating in dev mode can leave
project's `body[data-corner-labels="visible"]` set from a previous
test of the full flow. The CSS guard hides those labels in `single`,
but the moment the first state transition fires (`enterEntryView`'s
`single → overview` morph), the gate opens and the stale labels would
fade in under the revealing mask. To close that window, `enterEntryView`
re-emits `setCornerLabels(false)` + four-up `setCanvasText('', '')` +
`setCenterCaption('')` immediately after `viewState.advance()`, before
the mask snap. These are no-ops on a cold-booted project but eliminate
hot-reload leak in development.

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
  extend the active branch, *before* overview is confirmed (VIEW-0 first
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

## VIEW_0 — ONBOARDING (interface_nuxt)

VIEW_0 is the title screen, mounted by
[`View0Onboarding.vue`](app/components/views/View0Onboarding.vue). Pure
gradient backdrop (`.bg-gradient` global utility from `app.vue`), no
project emissions, no interaction state mutations. The user sees a
"Proxima" title (7rem, ABC Otto Medium Italic, with `letter-spacing:
-0.02em`) and a short hint line "No image belong to one place"
(Neue Kabel Medium, 0.85rem). Clicking anywhere on the section calls
`handleClick()` which sets `fadingOut = true` (triggering a 500ms
opacity fade-out keyframe on both the title and hint) and after
`FADE_OUT_MS = 500ms` calls `viewState.advance()` — matches the same
500ms cubic-bezier easing used by VIEW_1/VIEW_2/VIEW_3's rotating-text
fades for visual continuity across the view chain. See *TYPOGRAPHY
SYSTEM* and *ROTATING-TEXT SYSTEM* for the shared timing parameters.

ONBOARDING is the phase alias for VIEW_0 (`PHASE_BY_VIEW.VIEW_0`).
`interaction.ts` has no guards on `is('ONBOARDING')` today — there are no
side-effectful interactions in this phase. Future telemetry hooks (e.g.
"session_started" emission on first click) would live behind a new
function in `interaction.ts` called from `View0Onboarding`, not on the
direct `viewState.advance()` path.

The standalone project stays in its boot `single` state throughout (see
*Boot reset sequence*). Nothing on the wire during VIEW_0.

**Custom text-shadow effects (currently disabled):** the Proxima title
carries an InDesign-style stack — cream-coloured glyph body (`#f9ecd0`)
with 4 tight dark inner-edge layers simulating an inset shadow + 2
blue-gray outer atmospheric halo layers. The subtitle carries an
elaborate 11-layer blue halo (8 solid blue-gray core + 3 feathered
rim, max 380px). Both are commented out behind `TEMP DISABLED`
markers in the stylesheet to remove their paint cost while transitions
are being tuned; uncomment to restore. See *TYPOGRAPHY SYSTEM > Text
halo* for the shared `--halo` cascade.

---

## VIEW_1 — EXPLANATION (interface_nuxt)

VIEW_1 is the introductory text phase, mounted by
[`View1Explanation.vue`](app/components/views/View1Explanation.vue).
Gradient backdrop, the structural cross (split into ::before + ::after
pseudo-elements for animation; see *View cross rendering* below), and a
sequence of text panels rotating at a fixed cadence:

```ts
const PANELS = [
  'Proxima is a tool for exploration of a visual corpus through modes of proximity.',
  'It allows you to engage with images for alternative perspectives.',
]
const PANEL_MS = ROTATE_PANEL_MS  // shared via app/utils/rotateText.ts
```

A `setInterval` advances the panel index every `ROTATE_PANEL_MS` (4s);
when the tick fires while the index is already at the last panel,
the timer calls `advance()` which sets `captionVisible = false`
(triggers Vue Transition leave) and after `ROTATE_FADE_OUT_MS` (500ms)
calls `store.enterEntryView()` to advance to VIEW_2. A `>` skip
chevron in the lower portion of the viewport also calls `advance()`
for manual skip — same smooth fade-then-advance path.

Caption animation uses Vue `<Transition name="caption" mode="out-in"
appear>` with the `--rotate-*` CSS vars driving every fade. VIEW_1 is
the only rotating-text consumer that uses Vue's native `appear` —
VIEW_2 and VIEW_3 work around it with a JS-gated first render
(see *ROTATING-TEXT SYSTEM*).

### Cross-draw animation

The cross is drawn from the centre outward over the *full panel runtime*
(`PANELS.length × PANEL_MS` — 10 s by default). Each line tweens its
`transform: scaleX/scaleY` from 0 to 1, `linear` easing, so the cross
finishes at exactly the moment the last panel ends. Duration is bound to
CSS via a custom property on the section root:

```vue
<section :style="{ '--cross-draw-duration': `${crossDurationMs}ms` }">
```

```css
.view-1::before {
  /* horizontal line */
  animation: cross-draw-h var(--cross-draw-duration, 10000ms) linear forwards;
  transform-origin: center;
}
@keyframes cross-draw-h { from { transform: scaleX(0); } to { transform: scaleX(1); } }
```

`transform-origin: center` is load-bearing — the line expands symmetrically
from the centre rather than from an edge. Same shape for `::after` with
`scaleY`. Skipping the view mid-draw is fine; the cross unmounts with the
view, no explicit cleanup needed.

### `enterEntryView()` — hidden-morph to overview

The advance from VIEW_1 to VIEW_2 is the moment the standalone project
transitions from `single` (boot state) to `overview`. The transition is
hidden behind the render mask for a clean visual:

```ts
function enterEntryView() {
  if (!viewState.is('EXPLANATION')) return
  const from = viewState.current
  viewState.advance()
  emit({ type: 'view_advance', from, to: viewState.current, ... })

  const FADE_MS = 400
  const MORPH_MS = 500
  projectSocket.setMask(1, FADE_MS)
  setTimeout(() => projectSocket.setState('overview', MORPH_MS), FADE_MS)
  setTimeout(() => projectSocket.setMask(0, FADE_MS), FADE_MS + MORPH_MS)
}
```

* `t = 0`: emit `set-mask(1, 400)` — project mask starts fading to opaque.
* `t = 400 ms`: emit `set-state('overview', 500)` — morph happens behind
  the now-opaque mask.
* `t = 900 ms`: emit `set-mask(0, 400)` — fade reveals the settled
  overview.

Total: ~1.3 s symmetric fade-out → morph → fade-in on the project screen.
Unlike VIEW_2's mask hold (which absorbs the morph asymmetrically — opaque
at the click moment, reveal at VIEW_3 entry), this one is symmetric
because there is no in-view hold timer to absorb anything; the mask alone
bookends the morph.

EXPLANATION is the phase alias for VIEW_1. No guards on
`is('EXPLANATION')` outside `enterEntryView` itself.

---

## VIEW_2 — CANVAS ENTRY PHASE (interface_nuxt)

VIEW_2 is the entry interaction phase. The user picks the first image by
clicking a sprite in an **iframe-embedded instance of `project`** running
locally inside `interface_nuxt`'s page (the `View2Disperse` component
mounts the iframe at `${projectUrl}?embed=1`). VIEW_2 is **not** a render
state — see *VIEW ≠ STATE* — and has no spatial meaning of its own. The
standalone project window (the relay-connected one) sits in `single`
throughout VIEW-0 and is completely unaffected by what happens in the
iframe.

This replaces the earlier DOM-based VIEW-1. VIEW-1 has been removed
entirely: there is no DOM list of selectable thumbnails, no fallback path,
no entry-routing branch. The canvas is the only entry surface.

### Rotating entry caption

VIEW_2 also displays a two-sentence rotating intro `.entry-caption`
at the upper centre of the viewport (`top: 4vh`), overlaying the
iframe at `z-index: 12`. Content:

```ts
const ENTRY_PANELS = [
  "Here's a corpus from scientific and encyclopedic publications (15th–20th century), structured to classify and organize knowledge within Western systems.",
  'Engage with this corpus through alternative readings and contribute to Proxima.',
]
```

The first sentence is too long for one line so `.entry-caption` uses
`max-width: 60vw` with normal wrapping (unlike VIEW_1's and VIEW_3's
captions which use `white-space: nowrap`).

Timing is sourced entirely from shared parameters — see *ROTATING-TEXT
SYSTEM* for the full contract. VIEW_2 uses the JS-gated first-render
workaround (no Vue `appear`) because the iframe load races with Vue's
appear-class reflow. After the last sentence's display time, the
caption auto-fades; the sprite-click handler (via `view0:image-click`
postMessage from the iframe) treats "already faded" as "advance
immediately", "still visible" as "fade-then-advance" — same shape as
VIEW_1's `advance()` flow.

### Iframe contract: `?embed=1`

The iframe URL carries an `?embed=1` flag. Inside `project`'s `main.js`,
that flag activates **embed mode**, which:

* initialises `stateManager` directly into `disperse` (skipping the
  state-table guard that normally blocks `single → disperse`),
* **does not call `setupSocketBridge`** — the iframe instance is
  intentionally **disconnected from the socket relay**, so it never
  receives `set-state`, `focus`, `set-mask`, `set-canvas-bg`,
  `set-highlight`, or any other interface_nuxt emission,
* once canvas-1 is ready, calls `enterDisperse()` and `enablePicking({
  onHover, onClick })`,
* applies the `'big'` highlight preset (the iframe never goes through
  `goTo`, which is where presets are normally chosen per state),
* sets `body[data-canvas-bg = 'gradient']` inline so the disperse field
  sits on the same day backdrop as the rest of project.

Embed mode is the **fourth scoped project-side exception** (see *CURRENT
DEVELOPMENT SCOPE* exception #4). Its surface is small and tightly
scoped: a URL flag, an alternate boot path that swaps `initial` and
skips the socket bridge, and a picker (`enablePicking`) that posts back
out via `postMessage`. There is no state-machine interpretation, no
relational logic, and nothing on the wire from this instance.

### Hover + click protocol: `postMessage`

The iframe's `enablePicking` callback hands two events to
`window.parent.postMessage(...)`:

* `{ type: 'view0:image-hover', imageId: string | null }` — emitted on
  every change of hovered sprite (or `null` on hover-out). The parent
  uses this both to drive its DOM-centered preview overlay and to
  forward the same id to the standalone project via
  `store.setHighlight(id)` (see *SET-HIGHLIGHT*).
* `{ type: 'view0:image-click', imageId: string }` — emitted on click.
  The parent passes `imageId` straight into `store.selectImage(...)`,
  which is the same store action the old DOM VIEW-1 used; from there
  the existing socket emission sequence runs untouched.

The parent (`View0Disperse.vue`) validates `event.origin` against
`config.public.projectUrl`'s origin before accepting any message;
mismatches are warned and dropped.

`postMessage` is the **only** out-of-iframe channel; the iframe still
does **not** talk to the relay.

### Click semantics on the canvas

`enablePicking` uses **screen-space proximity** hit testing instead of
pixel-exact raycasting: it picks the nearest sprite within
`hoverRadiusPx` (default 36 px) of the cursor. Two consequences relevant
to the contract:

* hover stays usable on fast-moving disperse sprites — the radius is
  generous enough that small wandering targets remain grabbable,
* the click event reuses the **most recent hover index** (`lastHoverIndex`
  inside `enablePicking`) rather than re-picking on the click. This
  guarantees the id sent in `view0:image-click` is the same id that
  drove the DOM preview and the standalone project's halo — they cannot
  diverge.

Additionally, while a sprite is hovered its position is **frozen** in the
disperse drift loop (anchor is back-solved continuously so drift resumes
seamlessly on hover-out). Combined with the click-reuses-last-hover
rule, this eliminates the "the image moved out from under the cursor at
click time" race.

### Selection flow

When `view0:image-click` reaches the parent and `store.selectImage(id)`
fires (guard: `currentView === 'VIEW_0'`):

* the selection is stored in `activeCentralImageId`
* `imageClick` is incremented (0 → 1)
* `currentView` jumps directly to `VIEW_2` (no intermediate VIEW-1)
* the existing VIEW-2 timer (`startView2Timer`) starts
* `project` receives `set-mask(1, 0)` — snapping the project-side render
  mask to fully opaque so the morph kickoff frame is hidden (see
  *VIEW-2 — RENDER MASK*). MUST be emitted **before** `set-state` in
  the same bundle; `socket.io-client` preserves emission order
* `project` receives `set-state('split', 500)` — kicking off a fast 500ms
  `single → split` morph **at the click moment**, behind the opaque
  mask. The morph completes long before the mask reveals on either exit
  path (auto at `VIEW_2_AUTO_ADVANCE_MS = 10500`, or skip), so VIEW-3
  entry always reveals a fully-settled `split` frame
* `project` also receives `focus(storedImageId)` in the same emission
  bundle — the camera target is bound at click time so the morph and
  the camera convergence are co-causal with the user's selection

The wire identity here is the same as it was in the DOM VIEW-1 era;
only the source of the click changed. The iframe receives none of these
emissions (it's not on the relay) and is unmounted on the
VIEW-0 → VIEW-2 transition anyway.

### Hover preview (DOM-centered overlay)

While the user is hovering sprites, `View0Disperse` keeps a small
**hover stack** of recent `imageId`s and renders them at viewport
centre via the same `CentralImage` component VIEW-2 uses. Geometry
matches VIEW-2's `.central-slot` exactly (`top: 50%`, `left: 50%`,
`width: 22vmin`, `height: 22vmin`), so the click → VIEW-2 handoff lands
the just-clicked image at pixel-stable position and size.

Stack mechanics (interface-only, never on the wire):

* the **pinned** entry (the sprite currently under the cursor) never
  expires while hovered;
* on hover change, the previous pin is demoted to **expiring** with a
  lifetime of `STICKY_HOLD_MS = 1000`, then peeled out via a 1400 ms
  opacity-only fade (no fade-in — entries appear instantly);
* re-hovering an expiring sprite re-pins it with a fresh lifetime, no
  duplicates;
* `CentralImage`'s `TransitionGroup` handles the leave transition;
  ongoing transform/width/height transitions for stack reshuffles are
  independent.

### Standalone project — unaffected by VIEW-0

The standalone project window receives the canonical boot sequence
(`path-clear` + `set-state('single')` + `set-mask(0, 0)` +
`set-canvas-bg`) on register and stays in `single` until the VIEW-0
click fires the `set-state('split', 500)` sequence. The hover halo on
the standalone is driven separately via `set-highlight` (see
*SET-HIGHLIGHT*) — it is **not** triggered by `view0:image-hover`
directly, but by the parent forwarding the same id through
`store.setHighlight(...)`.

### Split transition duration and VIEW-2 buffer duration — decoupled

Two **independent** constants, both owned by `interface_nuxt`:

* `SPLIT_MORPH_MS = 500` — duration of project's canvas morph. Passed on
  the wire as the second argument to `set-state('split', SPLIT_MORPH_MS)`.
  Short on purpose: the morph runs entirely behind the opaque mask, so the
  exact duration is cosmetic; keeping it short guarantees the morph is
  finished long before any plausible mask reveal.
* `VIEW_2_AUTO_ADVANCE_MS = 10500` — duration of the VIEW-2 UI buffer
  (mask hold). Drives the auto-advance timer only. Never on the wire.

These were previously a single coupled constant (`SPLIT_TRANSITION_MS =
10500`). Coupling them caused a real bug: if the user skipped at any
moment, the mask snapped to transparent while project was still mid-morph,
exposing the in-flight transition. Decoupling them makes the morph always
finish before either exit path reveals, so the mask reveal always shows a
settled `split` frame.

VIEW-2 remains the **UI mirror** of the (short) in-flight morph plus the
deliberate hold time. By default the buffer lasts `VIEW_2_AUTO_ADVANCE_MS`
but it may be exited early by an explicit user skip action. The skip is
purely a UI-side trigger:

* it does **not** alter the duration already on the wire
* it does **not** affect `imageClick`
* it does **not** introduce any additional render state
* it emits **no** intermediate socket event

Transition timeline:

1. VIEW-0 click → emits `set-mask(1, 0)`, then `set-state('split', 500)`,
   then `focus(storedImageId)` — bundled, **immediately**, in that order.
   The mask snaps to opaque first so the morph kickoff frame is hidden.
2. Project completes the `single → split` morph in 500ms, behind the
   opaque mask. Project's camera also begins lerping toward
   `storedImageId` at click time.
3. VIEW-2 continues running for up to `VIEW_2_AUTO_ADVANCE_MS = 10500`
   (or until user skip). During this hold, project sits in fully-settled
   `split` with no in-flight transition; only the camera-follow lerp may
   still be converging.
4. On exit, VIEW-3 entry emits `set-mask(0, duration)` and re-emits
   `focus(storedImageId)`. `duration` differs by exit path:
   * auto: `set-mask(0, 400)` — 400ms reveal of the settled split state.
   * skip: `set-mask(0, 0)` — instant cut. Because the morph completed at
     t≈500ms, the revealed frame is settled regardless of when skip fires
     (the only edge case is skip within the first 500ms, where a brief
     morph tail may be visible).

Both exit paths produce the **same** wire identity for `focus`; only the
mask's `duration` differs.

---

## VIEW_3 — TRANSITION (interface_nuxt)

VIEW_3 is the **quadrant zoom-in step** between the disperse selection
(VIEW_2) and the relational grid (VIEW_4). Project is in `overview`
throughout VIEW_3; the standalone visually morphs from overview to a
split-equivalent rendering one canvas at a time, driven by user clicks on
four `+` crosses (one centered in each quadrant). When all four are
zoomed, a caption + corner labels + advance control fade in, and the user
clicks the advance to enter VIEW_4.

VIEW_3 is **not** a project render state — see *VIEW ≠ STATE*. The
canvas-by-canvas visual change is achieved by per-canvas cameraZ
overrides at the project layer (see *PER-CANVAS ZOOM*). The wire emits
`set-canvas-zoom` once per cross click; no `set-state` during VIEW_3
(project stays in overview by name).

VIEW_3 also displays a two-sentence rotating intro `.intro-caption` at
the upper centre — "You selected one image from 4,993 fragments" then
"Click on the crosses to reveal new related images through different
modes of proximity". Timing comes from the shared `--rotate-*` CSS
vars and `ROTATE_PANEL_MS`; see *ROTATING-TEXT SYSTEM* for the full
contract. Like VIEW_2, VIEW_3 uses the JS-gated first-render
workaround (no Vue `appear`) because its many child elements (corner
labels, 4 quadrant crosses, 4 ProximityPanels, CentralImage stack)
mounting simultaneously race with Vue's appear-class reflow. The
caption's leave fires from either path: timer-driven after the last
sentence's display time, OR triggered by the watcher on
`store.allCanvasesZoomed` (last cross clicked); both flip
`introVisible` to false. VIEW_3 itself doesn't auto-advance — only
the caption clears the way.

### Predecessor (pre-rename)

This phase replaces what used to be VIEW-2 (a passive 10.5-second mask
hold that bracketed an automatic `single → split` morph). The mask-hold
model was retired together with the auto-advance timer (`view2Timer`,
`view2RemainingMs`, `VIEW_2_AUTO_ADVANCE_MS`, `MASK_REVEAL_MS`,
`startView2Timer` / `stopView2Timer`) — all of that infrastructure has
been removed from `interaction.ts`. The current VIEW_3 has no in-phase
timer; advance is entirely user-driven.

### Layout

[`View3Transition.vue`](app/components/views/View3Transition.vue) renders
on the gradient backdrop with the structural cross (same split-pseudo
pattern as VIEW_1, no draw animation — static). Foreground elements:

* **Four quadrant crosses** at the quadrant centres
  (25/25, 75/25, 25/75, 75/75 of the viewport). Each is a `+` glyph
  button styled with the same warm tan colour as the structural cross.
  Click handler: `store.zoomCanvas(i)`. The cross hides (fade + pointer-
  events: none) once its canvas has been zoomed.
* **Per-quadrant text** at the same position the cross occupied. Hidden
  initially; fades in (600 ms, 200 ms after the cross fades out) when
  the canvas is zoomed. Each text describes the mode of proximity for
  that quadrant — Mirror / Trace / Shift / Replay (see the QUADRANT_TEXTS
  array in the component source).
* **Central image** at viewport centre, 22vmin × 22vmin (same geometry
  as VIEW_4's `.center-anchor`, so the swap is pixel-stable).
* **Modes caption** at the bottom (`bottom: 3 rem`). Hidden until the
  4-second post-zoom delay; fades in with a small slide.
* **Corner labels** at the four outer viewport corners (`top: 0; left: 0`
  etc.) showing `MIRROR` / `TRACE` / `SHIFT` / `REPLAY`. Same pixel
  positions as VIEW_4's `RelationComponent` `.quarter-tag`, so they sit
  put across the VIEW_3 → VIEW_4 swap. Subtle warm halo via layered
  `text-shadow` to lift them off the gradient. Hidden initially; fade in
  on the same trigger as the caption.
* **Advance control** — a `+` glyph at the top centre of the viewport,
  visually identical to VIEW_4's `.interpret-control` but a separate
  `.advance-control` button. Click → `store.enterRelationalView('skip')`.
  Hidden initially; fades in 500 ms after the caption (CSS
  `transition-delay`) so the reveal cascades caption → corner labels →
  advance.

### Timeline (`canvasZoomed[]` and `allCanvasesZoomed` are reactive store state)

```
t = 0          user clicks 1st cross   →  setCanvasZoom(0, activeId)
                                       →  canvasZoomed[0] = true
                                       →  cross 0 fades out, text 0 fades in,
                                          canvas 0 tweens overview → split
... user clicks 2nd, 3rd, 4th crosses (any order, no time pressure)
t = N          user clicks 4th cross   →  canvasZoomed = [t,t,t,t]
                                       →  allCanvasesZoomed = true
                                       →  watch in View3Transition fires
t = N + 4000   showCaption = true      →  caption + corner labels fade in
t = N + 4500   advance-control fades in (CSS transition-delay)
t = future     user clicks +           →  store.enterRelationalView('skip')
                                       →  setState('split', 0) + focus(id)
                                       →  viewState.advance() to VIEW_4
```

The `4000 ms` caption delay and the `500 ms` advance-control delay are
tunables at the top of the `<script setup>` block in
`View3Transition.vue`. No auto-advance from VIEW_3 to VIEW_4 — the
advance fires only on the user's click of the `+` control.

### `store.zoomCanvas(i)` (interface_nuxt → project)

```ts
function zoomCanvas(canvasIndex: number) {
  if (!viewState.is('TRANSITION')) return
  if (canvasIndex < 0 || canvasIndex > 3) return
  if (canvasZoomed.value[canvasIndex]) return    // idempotent
  const id = activeCentralImageId.value
  if (!id) return
  canvasZoomed.value = canvasZoomed.value.map((v, i) => i === canvasIndex ? true : v)
  projectSocket.setCanvasZoom(canvasIndex, id)
}
```

Pure side-effect handler. No state-machine reinterpretation, no router
calls — just the wire emission + local flag flip for the UI gating.

### `store.enterRelationalView(reason)`

The reason param (`'auto'` | `'skip'`) is stored in `view2ExitReason` and
consumed by VIEW_4's reveal-overlay animation. Today only the `'skip'`
path is reachable (the advance-control click); the `'auto'` path is
reserved for any future timed advance.

The function emits:

* `set-state('split', 0)` — instant state-name flip. Project's per-canvas
  overrides already match `split`'s cameraZ (0.2), so flipping the name
  with duration 0 produces no visible change while releasing the
  overrides (cleared on every `goTo`) and unlocking the pan-on-focus
  behaviour for VIEW_4's history nav and relational clicks.
* `focus(activeCentralImageId)` — idempotent re-assertion of the camera
  target, in case the future per-canvas zoom paths drifted from each
  other.

It also resets `canvasZoomed = [false, false, false, false]` so that
re-entering VIEW_3 (no path today, but defensive) starts clean.

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

## VIEW_4 — COMPONENT LAYOUT

The 4 relation components are arranged in a fixed 2×2 grid:

[ Mirror (tl) ] [ Trace (tr)  ]
[ Shift  (bl) ] [ Replay (br) ]

Each component is identified by a position name (`tl` / `tr` / `bl` / `br`,
matching project's `STATES.split.rects` ordering) and rendered with a
human-readable label via the `<RelationComponent>` prop `label`:

* **Mirror** (top-left, `component_1`) — visual structures, shapes,
  textures. Highlights recurring visual form.
* **Trace** (top-right, `component_2`) — lexical / historical sources
  linked to the image. Retraces a subject field.
* **Shift** (bottom-left, `component_3`) — semantic embeddings related
  to the image. Shifts the reading laterally through meaning.
* **Replay** (bottom-right, `component_4`) — previous user selections
  including this image. The collaborative trace of past navigations;
  contributions accumulate into an evolving map.

The names are rendered in each component's outer corner via the
`.quarter-tag` span (see `RelationComponent.vue`), pixel-positioned
identically to the VIEW_3 corner labels so the labels sit put across the
VIEW_3 → VIEW_4 swap.

This layout remains stable during VIEW_4.

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

* `selectImage` (VIEW-0 first click) — no path yet exists; there is no
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

## VIEW-2 / VIEW-3 — CENTRAL IMAGE STACK

The **central image stack** is the interface-side visualization of the
user's currently active relational reference: the same `navigationHistory`
prefix that the project-side path renders as edges, rendered here as a
**deck of stacked thumbnails** centered on screen (VIEW-2) or between the
four relation panels (VIEW-3). It is a purely DOM component owned by
`interface_nuxt` — `project` is unaware of it, and nothing about it
crosses the socket.

The stack is the visual companion to *VIEW-3 — PATH RENDERING*: path
draws the **edges** of `navigationHistory`, central stack draws the
**nodes**. Both are derived views of the same underlying interaction
memory.

### Component surface

One reusable component, `app/components/CentralImage.vue`, mounted in
two places:

* `View2Transition.vue` — centered in the VIEW-2 buffer screen, replacing
  the earlier textual "selected image / id" block.
* `View3Relational.vue` — at the existing `.center-anchor` slot, between
  the four `RelationComponent` panels. Inherits the existing
  `.suppressed` interpretation-mode rule (opacity + blur).

The component is **presentational and dumb**: it accepts three props —
`ids: ImageId[]`, `activeIndex: number`, `expanded: boolean` — and reads
no store. The parent view binds those props to the store's derived
values.

Each id is rendered via `AtlasThumb` (the existing atlas-resolution
component), giving every layer its **natural aspect ratio**, not a forced
square. Layers are absolutely positioned and centered via
`translate(-50%, -50%)`; the `.center-anchor` box only sets the centering
reference — it does **not** clip the layers (no `overflow: hidden`), so
images of different aspect ratios show their edges around each other.

### Derived store state

`centralStack` and `centralStackActiveIndex` are **computed** values
exposed from the interaction store. There is no independent stack array
or mutation helper — the stack is a view of the existing
`navigationHistory` / `historyIndex` / `activeCentralImageId` triple:

```ts
centralStack = navigationHistory.length > 0
  ? navigationHistory
  : (activeCentralImageId ? [activeCentralImageId] : [])

centralStackActiveIndex = navigationHistory.length > 0 ? historyIndex : 0
```

The VIEW-2 fallback exists because `navigationHistory` only receives its
first push at VIEW-3 entry (see *NAVIGATION MEMORY* and the
`enterRelationalView` flow in *VIEW-0*), but the central image needs to
render during VIEW-2 right after the VIEW-0 selection. The fallback
yields the single-element deck `[activeCentralImageId]` until the first
real navigation entry exists.

`imageClick` is **not** consulted. It remains the session-level
selection counter; the stack is a structural view of the active branch,
not of cumulative click history.

### Rendering rules

The component computes per-layer `transform` and `z-index` from
`(i, activeIndex, ids.length, expanded)`. Three concerns are layered on
top of each other:

1. **Z-order.** The layer at `activeIndex` is elevated to `z = n + 1`
   (top of the deck). All other layers keep their nav-history order
   (`z = i + 1`). The active image is therefore **always visually on
   top**, regardless of where it sits in `navigationHistory`.
2. **Stack mode** (`expanded === false`). Every layer piles at the
   **exact geometric center** via `translate(-50%, -50%) scale(1)`. The
   active sits on top via z-index; older layers sit underneath at full
   opacity with no positional offset. History nav and new activations do
   not displace any layer — only the z-index rotation moves the active
   to the top. Peek-out around the active is driven entirely by
   per-image dimensions (item 4), not by a stagger animation.
3. **Circle mode** (`expanded === true`, gated on
   `store.overviewConfirmed`). Each layer is placed at
   `angle_i = -π/2 + (i / n) * 2π`, radius `RADIUS_VMIN = 22`. The
   active layer scales to `SCALE_ACTIVE = 0.5`, others to
   `SCALE_OTHER = 0.35`. Ordering follows `centralStack` (= nav history)
   index, starting at 12 o'clock and walking clockwise.
4. **Per-image natural dimensions.** Each layer is sized from its source
   pixel dims in the atlas metadata, scaled by a single
   `VMIN_PER_PIXEL` factor with two stable per-image modulations:
   * a **hash-derived size variation** keyed off the image id — breaks
     the visual collision created by the source atlas normalizing most
     images to a 500px max edge (so two portraits with identical aspect
     no longer render at identical size);
   * an **aspect-balance penalty** that reduces the overall scale of
     extreme-aspect images (no aspect distortion), so ribbons don't
     visually dominate squares.
   Both modulations are deterministic — same image id always yields the
   same footprint. Same-aspect images therefore don't collapse to
   identical visual sizes, and peek-out between stacked layers in stack
   mode is a structural consequence of these dimensions, not an
   animation effect.

A single CSS transition on `transform` (700ms, `cubic-bezier(0.22, 0.61,
0.36, 1)`) drives every visual change: stagger reshuffles on history
nav, deck-to-circle expansion on `confirmOverview()`, and circle staying
put thereafter. Z-index changes are instantaneous (not transitionable)
but coincide with transforms, so the active layer's rise to the top
reads as a clean "card flip to front."

### Behavior across interaction events

| Interaction event                                     | Effect on `centralStack`              | Effect on `activeIndex`        |
| ----------------------------------------------------- | -------------------------------------- | ------------------------------- |
| VIEW-0 first click (`selectImage`)                    | `[id]` (VIEW-2 fallback)               | `0`                             |
| VIEW-3 entry (`enterRelationalView`)                  | `[id]` (now via `navigationHistory`)   | `0`                             |
| VIEW-3 related click (`activateCentral`, pre-cap, pre-overview) | append (and truncate forward if mid-branch) | new `historyIndex`         |
| `stepBack` / `stepForward` / `jumpToHistory`          | unchanged (deck preserved)             | new `historyIndex` (active rises to top z) |
| `activateCentral` at cap or post-overview             | unchanged                              | unchanged                       |
| `confirmOverview`                                     | unchanged                              | unchanged (deck animates into circle)      |

The two structural behaviors that came from the user-side requirement
"the right image comes back to top on history nav" and "above images are
removed when picking a new mid-branch image" are both **automatic
consequences** of the derived design:

* History nav doesn't touch `navigationHistory` (per *NAVIGATION MEMORY*
  and *VIEW-3 — PATH RENDERING*), so the deck stays — only
  `activeIndex` moves and the component re-renders with a new top
  layer.
* Mid-branch `activateCentral` already truncates `navigationHistory`
  forward before appending; since `centralStack` *is* that array, the
  forward entries disappear from the deck in the same tick the new
  entry is added. This mirrors `path-truncate` on the wire and
  preserves the "deck = active branch" invariant.

### Invariants

* `centralStack` always equals `navigationHistory` once VIEW-3 has been
  entered; before that, it equals `[activeCentralImageId]` or `[]`.
* `centralStackActiveIndex` always equals `historyIndex` once VIEW-3 has
  been entered; before that, it is `0` (or unused if the stack is
  empty).
* The active image is **always** the visually top layer of the deck, in
  every mode (stack or circle).
* The deck is **client-only visual state**. Not persisted on the server,
  not in `localStorage`, not on the wire. Page reload destroys it;
  subsequent interactions rebuild it from `navigationHistory`.
* No new socket vocabulary. `CentralImage` is a pure DOM view of
  existing interaction state — it does **not** add a project-side
  exception in the sense of *VIEW-3 — PATH RENDERING*,
  *VIEW-2 — RENDER MASK*, or *CANVAS BACKGROUND*.
* `imageClick` is independent and must not be conflated with the
  stack's length or active index.

---

## VIEW_4 — RELATION OVAL

Inside each `RelationComponent`, the four candidate suggestion cells sit
on a **shared invisible ellipse** centred on the central image — not a
list, grid, vector cascade, or scattered constellation. All sixteen
cells across the four quadrants together trace a single continuous oval
encircling the central image. This is the layout *inside* the 2×2
quadrant grid defined in *VIEW_4 — COMPONENT LAYOUT*.

### Polar ellipse model

```text
cell_position = ellipse_centre + ( RX·cos θ_i , RY·sin θ_i )
```

* **ellipse_centre** — the inner corner of each `.rel` (where the four
  quadrants meet — the viewport-centre intersection, i.e. the central
  image's anchor). Set via one `top|bottom: 0` + one `left|right: 0`
  per quadrant so the cell's anchored corner sits exactly at this
  intersection.
* **RX, RY** — single shared x/y semi-axes (`vw` and `vh` respectively)
  so the ellipse stretches with the viewport's aspect ratio. A square
  viewport yields a circular arc; landscape stretches the oval
  horizontally; portrait stretches it vertically. The arc therefore
  always genuinely fills each quadrant rather than sitting in a
  concentric circle in a `vmin` cage.
* **θ_i** — uniformly spaced interior angles within the quadrant's 90°
  slice: `quadrant_base + (i + 0.5) × 22.5°` for `i ∈ {0..3}` → cells at
  `11.25°, 33.75°, 56.25°, 78.75°` from each quadrant's base angle. The
  quadrant base angles (CSS-screen convention: 0° = +x, 90° = +y down)
  are `BR: 0°`, `BL: 90°`, `TL: 180°`, `TR: 270°` — chosen so the signs
  of `cos`/`sin` already point outward into the right viewport quadrant
  without any per-quadrant sign flip.
* **No radius progression** — all sixteen cells share the same `RX` and
  `RY`. The visual continuity of the oval depends on this; per-cell
  radius variation reads as four independent concentric arcs, not as a
  single ring.

The `(x, y)` offsets are precomputed once at module load and stored in a
static `CELL_OFFSETS` table keyed by `position → i`, each value a
`vw`/`vh` string. Each cell binds them as inline CSS custom properties
`--cell-x` / `--cell-y`. The `.cell` transform reads them as:

```css
transform: translate(
  calc(var(--cell-x) + var(--center-shift-x)),
  calc(var(--cell-y) + var(--center-shift-y))
) scale(var(--cell-scale));
```

### Centre-on-oval anchoring

Cells are pinned by the corner of their CSS box closest to the inner
corner of their `.rel` (e.g. BR-quadrant cells set `top: 0; left: 0` so
their top-left sits at the viewport centre). Then a per-quadrant
`--center-shift-x` / `--center-shift-y` of `±50%` shifts the cell by
half its own bounding box — the sign points from the anchored corner
toward the cell's centre:

```
TL ─ corner anchor BR (bottom: 0; right: 0;) → shift (+50%, +50%)
TR ─ corner anchor BL (bottom: 0; left: 0;)  → shift (-50%, +50%)
BL ─ corner anchor TR (top: 0;    right: 0;) → shift (+50%, -50%)
BR ─ corner anchor TL (top: 0;    left: 0;)  → shift (-50%, -50%)
```

The cell's **centre** therefore lands on the oval, not its inner
corner. This matters because `AtlasThumb fit="width"` gives every cell
a fixed 12vmin width but lets the height vary by image aspect — a tall
portrait (24vmin tall) and a wide landscape (6vmin tall) both pivot
from their geometric centre instead of drifting outward by half-height
along the curve.

### Tuning

`RX` / `RY` are the only two values to tune (in
`RelationComponent.vue`'s `<script setup>`):

* **Larger** values push the oval out toward the viewport edges and
  give each cell more breathing room from the central image.
* **Smaller** values tighten the ring around the central image.
* Keep `RX` and `RY` similar in magnitude (typical: 30–40 each). A
  large mismatch reads as an awkward oval rather than a confident
  ellipse.

There is no `DR` (radius step), no `CELL_INSET_DEG` (angular margin),
no per-axis step in `vw`/`vh`. The single-oval invariant means tuning
is two numbers, not a parameter sweep.

### Latent → focal grammar

Preserved on top of the oval layout:

* **Field default**: cells at near-zero opacity, pointer-events off — a
  quiet latent layer over the backdrop.
* **Component hover**: cells fade in and re-enable interaction.
* **Cell focus** (`:hover` or `:focus-visible`): focused cell amplifies
  via `--cell-scale` plus border-color + box-shadow; siblings soften
  via `:has()`.
* **Stagger reveal**: `--reveal-delay = i × 80ms` (forward) or
  `(3 - i) × 80ms` (reverse) based on cursor entry direction.
  `revealDirection` is set in `onMouseEnter` from the cursor's
  normalised distance to the .rel's inner corner — close to inner =
  forward (cell-1 first), close to outer = reverse (cell-4 first).

### Cell rendering contract

Cells contain `AtlasThumb` instances and render **bare** — no padding,
no visible background, no visible border in the default state. A
transparent 1px border preserves a layout slot so hover's `border-color`
can fill in without shifting layout. Cell width is fixed at 12vmin;
cell height follows from each thumb's intrinsic aspect ratio.

Z-index stacks **cell-1 frontmost, cell-4 backmost** — innermost
(most-relevant) suggestion paints above the others. Since cells on the
oval don't actually overlap, the stack only matters for the focused
cell (z=5 on `:hover`/`:focus-visible`) and the whole-quadrant lift
(`.rel:hover { z-index: 50 }`) keeping the cells above the central
image deck during cell amplification.

Hierarchy reading (cell-1 closest, cell-4 furthest) is conveyed by the
z-index stacking and the `--reveal-delay` stagger — **not** by radius.

The server returns up to 8 related images per component; the client
slices to 4 for the oval. Increasing this number requires extending
the per-cell index rules (`cell-1` … `cell-N`) and the `N_CELLS`
constant in `CELL_OFFSETS`'s computation.

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
| First VIEW-0 click, **before** `set-state('split', 500)` | `set-mask(1, 0)`      | Snap mask to opaque, hide morph kickoff frame.        |
| VIEW-3 entry via timer (auto path)                        | `set-mask(0, 400)`    | Fade reveal of settled split state over 400ms.        |
| VIEW-3 entry via skip (user action)                       | `set-mask(0, 0)`      | Instant cut; user explicitly chose to bypass reveal.  |

The reveal duration `400` is owned by `interface_nuxt` as the constant
`MASK_REVEAL_MS`. It runs on the wire as `set-mask(0, 400)`; the constant
itself is not on the wire.

The ordering at the VIEW-0 click moment is **load-bearing**:

* `set-mask(1, 0)` MUST be emitted **before** `set-state('split', 500)`.
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
morph. The mask hold and the morph derive from two **independent**
`interface_nuxt`-owned constants:

* `SPLIT_MORPH_MS = 500` — keys `set-state('split', …)` on the wire.
* `VIEW_2_AUTO_ADVANCE_MS = 10500` — keys the VIEW-2 auto-advance timer
  (mask hold duration).

The mask is snapped to opaque at click time and remains opaque until the
auto-advance fires (at `VIEW_2_AUTO_ADVANCE_MS`) or the user skips. The
morph completes long before either exit path, so the revealed frame is
always a settled `split`. The decoupling exists for exactly this reason —
when they were a single coupled constant, skipping mid-buffer exposed an
in-flight morph.

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

* Any non-VIEW-3 action (VIEW-0 selection, VIEW-2 skip, etc.).
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

## SET-HIGHLIGHT — TRANSIENT PERCEPTION PRIMITIVE

`set-highlight` is a **third interaction primitive**, sitting alongside
`selectImage → set-state / focus / mask` (navigation) and the persistent
visual surfaces (path, mask, canvas background). It exposes a
**transient, ephemeral spatial-feedback channel**: "draw a hover halo on
the project canvas at this image id, or clear it." Nothing more.

### Why this primitive exists

The user-facing intent is that hovering an image in *any* view of
`interface_nuxt` should also light up the same image on project's
canvas — so when the user hovers a sprite on the VIEW-0 disperse field,
they can see "where this image lives" on the standalone project's
`single` map. The same channel is available to any future view (a
VIEW-3 relation-cell hover, the central-stack deck, etc.); the per-view
decision is just *whether* to call the emitter, not anything about the
primitive.

### Wire vocabulary

One directive, flowing from `interface_nuxt` to `project`:

* `set-highlight({ id: string | null })` — highlight the sprite for `id`
  on every ready canvas (or clear all highlights with `null`).

`id` is the only value on the wire. The visual treatment (sprite
scaling, glow size, easing, per-state preset) is **owned entirely by
project's `pointsManager`** and is not a wire concern.

### Store action

`store.setHighlight(id: ImageId | null)` is the single call site for
views. It forwards to `projectSocket.setHighlight(id)`. It **must not**
mutate any persisted store value:

* it does **not** touch `navigationHistory`, `historyIndex`,
  `activeCentralImageId`, `imageClick`, `overviewConfirmed`,
  `centralStack`, or `currentView`,
* it does **not** affect view progression,
* it is **not** persisted to the `/api/interaction` log,
* it is **not** rate-limited at the store layer — pointer events are
  already coalesced by the browser, and the project handler is
  idempotent for repeat same-id calls.

This independence is non-negotiable: highlight is a **global ephemeral
perception channel**, not part of navigation state.

### Emission rules

`store.setHighlight` is callable from any view's hover handler.
Currently wired:

* VIEW-0 `view0:image-hover` postMessage handler — forwards the iframe's
  hovered id to the standalone project.

Reserved for future use (views are free to add):

* VIEW-3 relation-cell hover, central-stack hover, history-thumbnail
  hover, anywhere else hover semantics make sense.

There is no implicit emission — every `set-highlight` call originates
from a view choosing to forward a hover.

### Project-side rendering contract

`project/src/commandsManager.js` registers `'set-highlight'` →
`actions.setHighlight(payload)`. `actions.setHighlight` iterates every
ready app and calls `app.object.highlight(id)`, which delegates to
`pointsManager.highlight(id)`. That function:

* sets per-instance `highlightTargetT[i]` (1 for the new primary, 0 for
  the previous primary if any), adds the affected indices to an
  `activeHighlights` Set,
* runs an exponential-smoothing tick each frame to ease scale + glow
  toward their targets with `easeInOutCubic`,
* keeps the glow anchored at `lastPrimaryIndex` during fade-out so the
  halo eases out in place rather than cutting.

The visual magnitude is **state-dependent**: `stateManager.goTo`
chooses a preset per render state (`big` for `single` / `overview` /
`disperse`, `default` for `split`) and broadcasts the preset to every
canvas. The wire does **not** carry preset info — it's a
project-internal rendering decision tied to camera proximity (far
cameras need amplification, close cameras don't).

### Iframe instance and `set-highlight`

The iframe (`?embed=1`) instance is not connected to the relay, so it
**does not receive** `set-highlight`. Its own hover halo is driven
locally by `enablePicking`'s `setHover()` → `points.highlight(id)`,
not over the wire. The wire-driven halo is only visible on the
relay-connected **standalone** project window.

### Invariants

* `set-highlight` never touches `project`'s state machine, render loop,
  point system positions, path renderer, focus state, or camera. It is
  **purely a visual emphasis on a single instance**.
* The highlight is **client-only visual state**. Not persisted, not on
  the server, not in `localStorage`, not on the wire beyond the
  per-event directive.
* Same shape as `set-mask` and `set-canvas-bg`: a scoped perceptual
  primitive driven by an explicit `interface_nuxt` directive, with
  zero project-side interpretation.
* Independent of `set-state` and `focus`: a `set-highlight(id)` can be
  emitted in any render state at any time, and conversely view
  progression events never emit `set-highlight` implicitly.

---

## PER-CANVAS ZOOM — VIEW_3 quadrant directive

`set-canvas-zoom` is the wire directive that drives VIEW_3's
canvas-by-canvas transition from `overview` to a split-equivalent
rendering. Each cross-click in VIEW_3 fires one of these and the
project canvas it addresses tweens its cameraZ (and its camera position)
onto the selected image, independently of the other three canvases.

This is a **sixth explicit project-side exception** to "do not modify
project". It is scoped tightly: a per-canvas cameraZ + position override
layer in `stateManager`, one new handler in `commands`, one new param on
`focusOn` in `app.js`, registration in `commandsManager`. No state-machine
reinterpretation, no spatial-rendering inference, no relational logic.

### Wire vocabulary

```
set-canvas-zoom({ canvasIndex: 0|1|2|3, imageId: string })
```

* **`canvasIndex`** — which of the four canvases to act on. Order matches
  project's `STATES.split.rects`: 0 = top-left, 1 = top-right,
  2 = bottom-left, 3 = bottom-right.
* **`imageId`** — the target image. The canvas tweens its camera onto
  this point in its dataset and applies the perceptual halo.

### Emission rules

Emitted exclusively by `store.zoomCanvas(canvasIndex)` (see *VIEW_3 —
TRANSITION*). One emission per quadrant cross click; idempotent if the
canvas is already zoomed (`canvasZoomed[i]` short-circuits before the
emit). Never emitted from any other view phase or any other interaction.

### Project-side rendering contract

Three components participate.

**`stateManager` — per-canvas cameraZ override (`canvasOverrides[]`)**

Each entry in `canvasOverrides` is either `null` (canvas follows the
state-level `current.cameraZ` as usual) or a tween record:

```js
{ fromZ, toZ, t, duration }   // duration in seconds; t is progress 0→1
```

The tick loop reads:

```js
apps.forEach((a, i) => {
  let z = current.cameraZ
  const override = canvasOverrides[i]
  if (override) {
    override.t = Math.min(1, override.t + dt / override.duration)
    const e = easeInOutCubic(override.t)
    z = override.fromZ + (override.toZ - override.fromZ) * e
  }
  a.object.setCameraZ(z)
})
```

`setCanvasOverride(canvasIndex, targetZ, duration = 0.6)` starts an
override; `goTo()` clears every override at the start of any state
transition. The override clear-on-`goTo` ensures `setState('split', 0)`
(emitted by `enterRelationalView` for the VIEW_3 → VIEW_4 advance)
releases the per-canvas pinning — the state-level `current.cameraZ` then
takes over for all four canvases. The clear is visually a no-op because
the override target (`SPLIT_CAMERA_Z = 0.2`) already equals split's
state-level cameraZ.

**`commands.setCanvasZoom({ canvasIndex, imageId })`**

Three actions per call, in order:

1. `stateManager.setCanvasOverride(i, SPLIT_CAMERA_Z, 1.5)` — start the
   cameraZ tween.
2. `app.setHighlightPreset('default')` on that canvas — switch from
   overview's `'big'` preset to split's `'default'`, so the rendered
   sprite size + glow at the new (close) cameraZ match a real split.
3. `app.focusOn(imageId, { pan: true, panDuration: 1.5 })` — drives the
   camera position tween (time-based; see below) onto the image, with
   `pan: true` explicitly bypassing the overview pan-suppression rule
   (see *FOCUS-IN-OVERVIEW*).

**`app.focusOn(pointId, { pan, panDuration })` — time-based position tween**

`focusOn` accepts two options. When `panDuration > 0`, the existing
frame-based LERP for camera position is replaced by a `positionTween`
that interpolates `camera.position.{x,y}` from current to target over
`panDuration` seconds with `easeInOutCubic`. This is what lets the
per-canvas zoom's lateral pan converge in lockstep with the cameraZ
tween — without it, the LERP's exponential tail leaves the camera
drifting for seconds after the zoom completes. Default `panDuration = 0`
preserves the original LERP path for every existing caller; only
`setCanvasZoom` opts in.

### Durations

| Constant         | Value | Where                              | Why                                    |
| ---------------- | ----- | ---------------------------------- | -------------------------------------- |
| `SPLIT_CAMERA_Z` | 0.2   | `commands.js setCanvasZoom`        | Matches `STATES.split.cameraZ`.        |
| `ZOOM_DURATION`  | 1.5 s | `commands.js setCanvasZoom`        | Matches `goTo`'s default transition. Slow enough that the per-canvas zoom reads as deliberate, not a snap. |

### Invariants

* `set-canvas-zoom` never changes `currentName` — project's state stays
  `overview` during the entire VIEW_3 sequence. The "looks like split"
  perception is purely the four overrides converging on split's cameraZ.
* Overrides clear on every `goTo`. There is no "permanent canvas pin"
  mode — once `set-state` fires (e.g. via `enterRelationalView` for the
  VIEW_3 → VIEW_4 advance), control returns to the state machine.
* `focusOn`'s default behaviour (LERP, no positionTween) is preserved
  for all existing callers. Only `set-canvas-zoom` passes `panDuration`.
* Highlight preset is per-canvas: `setCanvasZoom` only switches the
  preset on its target canvas. The other three keep their `'big'`
  preset until `goTo('split')` resets them en masse.

---

## VIEW_4 — QUADRANT HOVER ZOOM (per-canvas camera zoom / unzoom)

Once VIEW_4 is mounted (project in `split`, all four canvases zoomed on
the active central image), hovering a quadrant in the interface drives
the **other three canvases to unzoom to overview** so the user can see
the full map context for those canvases, while the hovered quadrant's
canvas stays zoomed on the central image. Moving the cursor onto the
central image (which is a hit zone) returns all four canvases to the
default zoomed state. Moving between quadrants (j → k) demotes j
(unzoom) and promotes k (re-zoom).

The mechanism extends the per-canvas override infrastructure documented
in *PER-CANVAS ZOOM* with a symmetric inverse directive and a per-canvas
focus-pan suppression flag.

### Wire vocabulary

```
set-canvas-overview({ canvasIndex: 0|1|2|3, durationSec?: number })
set-canvas-zoom({ canvasIndex, imageId, durationSec? })   // re-used here
```

* **`set-canvas-overview`** is the symmetric inverse of
  `set-canvas-zoom`: it lifts one canvas back to the overview cameraZ
  (3.5) and pans its camera to map origin (0, 0). The optional
  `durationSec` tunes the tween; default 0.6s for internal callers,
  1.8s when emitted from VIEW_4 hover.
* **`set-canvas-zoom`** is re-used (not extended) — VIEW_4 hover emits
  it with `imageId = activeCentralImageId` and the matching
  `durationSec` to re-zoom a previously-unzoomed canvas.

Both directives carry an optional `durationSec` so VIEW_4 hover pacing
(1.8s) is independent of VIEW_3's per-cross zoom-in pacing (1.5s
default).

### Emission rules

All emissions originate from `store.setQuadrantHover(canvasIndex | null)`
in the interaction store, called by:

* **`RelationComponent.vue onMouseEnter`** → `setQuadrantHover(QUADRANT_INDEX[position])`
  (entered a quadrant).
* **`View4Relational.vue .center-anchor @mouseenter`** →
  `setQuadrantHover(null)` (entered the central image hit zone — see
  *VIEW_4 hit-area sizing* below).

`setQuadrantHover` is gated to `viewState.is('RELATIONAL')` and
`!overviewConfirmed` — never fires in VIEW_0/1/2/3 nor after overview
is confirmed.

The action computes the diff between the previous and next hover state
and emits only what changed:

| Transition       | Wire emissions                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `null → k`       | `setCanvasOverview(j, 1.8)` for j ∈ {0..3} \ {k} (3 others unzoom)                            |
| `j → null`       | `setCanvasZoom(j', activeCentralImageId, 1.8)` for j' ∈ {0..3} \ {j} (the 3 that were unzoomed re-zoom) |
| `j → k` (j ≠ k)  | `setCanvasOverview(j, 1.8)` (the canvas just left unzooms) + scheduled `setCanvasZoom(k, activeCentralImageId, 1.8)` 150 ms later (the canvas just entered re-zooms) |

The 150 ms lead delay on `j → k` is implemented via `setTimeout` and
read by the user as "the leaving canvas moves first, then the entering
canvas catches up". Pending timers are cancelled on every
`setQuadrantHover` call so rapid hover changes don't queue stale
emissions.

`activeCentralImageId` is read **at emit time**, not at the start of
the hover. This is what gives the "overview canvases silently update
their target, hovered canvas retargets smoothly" semantic without any
per-canvas bookkeeping on the project side — see *History nav during
hover* below.

### Store-side bookkeeping

```ts
const view4HoveredQuadrant = ref<number | null>(null)
const view4CanvasInOverview = ref<boolean[]>([false, false, false, false])
```

`view4CanvasInOverview` mirrors the actual project-side per-canvas
state. It is **only** updated when an emission is sent (not when a
delayed zoom-in is scheduled), so a cancelled timer correctly leaves
the canvas marked as "still in overview" and the next hover transition
naturally re-emits the zoom-in.

`HOVER_DURATION_SEC = 1.8` and `HOVER_LEAD_MS = 150` are the only
tunables.

### Project-side rendering contract

Three additions, all scoped to the existing per-canvas surface from
*PER-CANVAS ZOOM*:

**`app.setCameraTarget({ x, y, panDuration })`** — new method that
sets `targetX` / `targetY` and configures a `positionTween` against
explicit map coordinates without binding a focus target. Used by
`setCanvasOverview` to pan the camera to map origin. The default
`focusOn` path (which requires a `pointId`) is preserved for every
existing caller.

**`stateManager.setCanvasOverride(i, targetZ, duration, { suppressFocusPan })`**
— the override record now carries a `suppressFocusPan` boolean.
Default false; `setCanvasOverview` sets it true. The flag persists past
tween completion (the override record stays pinned at `toZ`).

The seeding of new overrides was also fixed in the same pass: when a
new override replaces an in-flight one, `fromZ` is computed from the
*interpolated* current z (using the previous override's eased `t`),
not from `prev.toZ`. Without this, rapid hover changes caused a
visible cameraZ snap to the previous target before animating to the
new one.

**`stateManager.shouldPanCanvas(i): boolean`** — returns
`!override?.suppressFocusPan`. Consulted by `commands.focusOnId` per
canvas:

```js
function focusOnId(pointId) {
  const globalOverview = stateManager.state === 'overview'
  apps.forEach((a, i) => {
    if (!a.isReady) return
    const pan = !globalOverview && stateManager.shouldPanCanvas(i)
    a.object.focusOn(pointId, { pan })
  })
}
```

So history-nav `focus(id)` emissions still update the perceptual halo
on every canvas (cell `.highlight` always runs), but only canvases
without a `suppressFocusPan` override actually pan their camera.

**`commands.setCanvasOverview(payload)`** — three actions per call, in
order:

1. `stateManager.setCanvasOverride(i, OVERVIEW_CAMERA_Z, duration, { suppressFocusPan: true })`
   — start the cameraZ tween up to 3.5.
2. `app.setHighlightPreset('big')` on that canvas — the inverse of
   `setCanvasZoom`'s preset switch to `'default'`; at the far overview
   cameraZ, sprites need amplification to read.
3. `app.setCameraTarget({ x: 0, y: 0, panDuration: duration })` — pan
   the camera to map origin in lockstep with the cameraZ tween.

### History nav during hover

The non-trivial behaviour is what happens when the user navigates
history (`stepBack` / `stepForward` / `jumpToHistory`) while a quadrant
is hovered. Those actions emit `focus(newId)` over the wire. With
per-canvas pan suppression:

* **Hovered canvas** (no override): `shouldPanCanvas(i) = true`, the
  canvas LERP-pans to the new image. The visible image follows the
  user's history navigation.
* **Unzoomed canvases** (override with `suppressFocusPan: true`):
  `shouldPanCanvas(i) = false`, the camera position stays pinned at
  (0, 0). But `points.highlight(newId)` still runs internally, so the
  active-image halo updates on the overview map. The user sees where
  the active image is on the wider context.

When the user later returns the cursor to the central image
(`setQuadrantHover(null)`), the re-zoom emissions read
`activeCentralImageId` at emit time — landing on the **latest** image,
not the one active when the hover started.

The same logic applies to `activateCentral` (clicking a related
image) during hover.

### Path-segment timer fallback

`pathTrace.addSegment` accepts an optional `useTimer` flag carried per
segment. When true, the segment animates over `SEGMENT_DRAW_DURATION
= 1.0s` on its own clock instead of riding `panProgress`. This is
necessary because pan-suppressed canvases have `panProgress` pinned at
1 (no camera motion), so the previous `last.progress = panProgress`
logic drew new segments instantly.

`commands.addPathSegment` decides per-canvas:

```js
apps.forEach((a, i) => {
  if (!a.isReady) return
  const useTimer = !stateManager.shouldPanCanvas(i)
  a.object.addPathSegment(fromId, toId, color, useTimer)
})
```

So when the user clicks a related image while hovering a quadrant:
- The hovered canvas's path segment grows with its LERP pan (as before).
- The three unzoomed canvases' segments grow on the 1.0s timer.
- All four finish drawing around the same wall-clock moment.

### VIEW_4 hit-area sizing

`.center-anchor`'s hit area must match the visible silhouette of the
active central image — otherwise large images extend past the hit area
(cursor on image → no hover) and small images leave dead zones inside
(hover with no image under cursor). Implementation in
`View4Relational.vue`:

```ts
const centerAnchorStyle = computed(() => {
  if (store.overviewConfirmed) return {}
  const id = store.activeCentralImageId
  if (!id) return {}
  const dims = naturalDimsVmin(id)  // from useCentralImageDims
  return { width: `${dims.width}vmin`, height: `${dims.height}vmin` }
})
```

`.center-anchor`'s width/height is **not** transitioned. The active
layer in the central image deck is a fresh TransitionGroup mount on
each `activateCentral` — it paints at its target dims instantly. A
700 ms transition on the anchor would lag the hit area behind the
visible image for those 700 ms. The hit area must snap in lockstep.

`.center-anchor`'s z-index is `60` (above `.rel:hover { z-index: 50 }`)
so when a quadrant is hovered and `.rel` lifts, the cursor moving onto
the central image area still hits `.center-anchor` first — `.rel:hover`
drops false automatically (cursor designates `.center-anchor` not
`.rel`), and `setQuadrantHover(null)` fires. Without the lift, the
quadrant's hover state would persist while the cursor was visually on
the central image.

### Durations and constants

| Constant                | Value   | Where                                       | Why                                       |
| ----------------------- | ------- | ------------------------------------------- | ----------------------------------------- |
| `OVERVIEW_CAMERA_Z`     | 3.5     | `commands.js setCanvasOverview`             | Matches `STATES.overview.cameraZ`.        |
| `HOVER_DURATION_SEC`    | 1.8 s   | `interaction.ts setQuadrantHover`           | Match unzoom and re-zoom; "deliberate" feel. |
| `HOVER_LEAD_MS`         | 150 ms  | `interaction.ts setQuadrantHover`           | Lead delay on `j → k` so unzoom visibly starts before re-zoom. |
| `SEGMENT_DRAW_DURATION` | 1.0 s   | `pathTrace.js addSegment`                   | Timer fallback for pan-suppressed canvases; roughly matches LERP settle time. |

### Invariants

* `setQuadrantHover` is gated to `RELATIONAL` phase + `!overviewConfirmed`.
  Never fires outside VIEW_4.
* `view4CanvasInOverview` only flips when an emission is actually
  emitted (not when scheduled). A cancelled timer leaves the canvas
  correctly marked.
* `activeCentralImageId` is read at emit time, not at hover-start time
  — so re-zooms after history navigation land on the latest image.
* `setCanvasOverview` never changes `currentName` — project's state
  stays `split` during the entire VIEW_4 hover sequence. The "three
  canvases unzoomed" perception is purely the three overrides
  converging on overview's cameraZ.
* `suppressFocusPan` only takes effect on `focusOnId` (the wire-driven
  focus). The `setCanvasZoom`'s direct `app.focusOn` call still pans
  unconditionally because the user has explicitly asked that canvas to
  zoom onto the selection.
* `app.setCameraTarget` is independent of `app.focusOn` — it does not
  call `points.setFocus`, so the persistent focus halo (the central
  image's glow) is preserved across unzoom.

---

## FOCUS-IN-OVERVIEW — read-only spatial rule

When the standalone project is in `overview`, `focus(id)` arriving on the
wire drives the perceptual highlight but **does not move the camera**.
This is the codified, generalised form of the post-confirmOverview rule
documented under *overview — terminal, read-only state*: overview is
read-only on the spatial side, regardless of whether `overviewConfirmed`
is true or false.

### Project-side implementation

Two layers, both inside the existing files.

**`commands.focusOnId(pointId)`** — the wire handler:

```js
function focusOnId(pointId) {
  if (!pointId) return
  const pan = stateManager.state !== 'overview'
  apps.forEach(a => {
    if (a.isReady) a.object.focusOn(pointId, { pan })
  })
}
```

The `pan = stateManager.state !== 'overview'` check is the entire rule.
When in any non-overview state (`single`, `split`), pan flows through
normally.

**`app.focusOn(pointId, { pan, panDuration })`** — the canvas method:

```js
function focusOn(pointId, { pan = true, panDuration = 0 } = {}) {
  ...
  if (pan) {
    // existing pan + LERP/tween path
  } else {
    // log only — `[focusOn] highlight-only (pan suppressed)`
  }
  points.highlight(pointId)   // always runs, regardless of pan
}
```

`points.highlight(pointId)` always runs, so the user still gets visual
confirmation that the click registered (the halo on the standalone
sprite). Only the camera target / panProgress / panStartDist mutations
are skipped.

### Why `setCanvasZoom` bypasses this rule

`set-canvas-zoom` calls `app.focusOn(id, { pan: true, ... })` directly,
**not** through `focusOnId`. That is intentional: the user is explicitly
asking that one canvas to zoom onto the selection — the "read-only"
default is the right behaviour for unsolicited focus arrivals, but
`set-canvas-zoom` is solicited. The wire emission is separate, the
handler is separate, the pan suppression is bypassed by construction.

### Interaction with VIEW_4 history nav

`activateCentral`, `stepBackInHistory`, `stepForwardInHistory`,
`jumpToHistory` all emit `focus(id)` for VIEW_4 navigation. After
`enterRelationalView` flipped the state name to `'split'`, the check
`stateManager.state !== 'overview'` is true, so pan flows through and
the camera follows the user as before. After `confirmOverview` flips to
`'overview'`, pan suppression engages — the wire emissions still arrive
(for log consistency, per *overview — terminal, read-only state*), but
they only drive the halo, never the camera.

### Invariants

* The rule is enforced **structurally** in `focusOnId`, not by
  per-handler conditionals. Adding a new focus emitter automatically
  inherits the rule.
* `points.highlight(pointId)` is preserved on every path — overview is
  read-only spatially, not perceptually.
* The rule does not affect `single`'s focus-clear behaviour
  (`goTo('single')` still resets `targetX/targetY` to `(0, 0)`). That
  is a state-transition side effect, not a focus-handler effect.

---

## DISPERSE SMOOTHNESS — per-sprite burst↔drift in pointsManager

`pointsManager.tickDisperse` was restructured to eliminate a global
synchronisation gate that produced a visible "every sprite halts at
its anchor, waits for the slowest one to finish, then every sprite
resumes drifting together" freeze frame at the end of the burst phase.

This is a **seventh project-side exception**, scoped to `tickDisperse`
only. No spatial-distribution changes, no socket changes, no embed
changes, no hover-freeze changes; `enterDisperse` / `exitDisperse` are
untouched.

### Previous shape (removed)

A two-phase state machine:

```js
if (disperse.phase === 'burst') {
  // animate all sprites toward spawn position with easeOutCubic
  // when EVERY sprite has progress >= 1 (allDone):
  //   set every anchor at once
  //   flip phase to 'drift'
  //   reset driftElapsed
}
if (disperse.phase === 'drift') {
  // sin-sum oscillation around anchors, single shared driftElapsed
}
```

Two problems:

1. **Global sync.** A sprite that finished its burst quickly (low
   `delay`, short `duration`) sat motionless at its anchor for up to
   ~0.36 s waiting for the slowest sprite. Then every sprite started
   drifting in unison.
2. **Velocity discontinuity.** `easeOutCubic` decelerates to v=0 at
   the burst end. Drift starts with non-zero velocity (the sine
   derivative). The combined effect read as "all stop → all jolt
   into motion".

### Current shape

A single per-sprite dispatch with lazy anchors and a short per-sprite
fade-in:

```js
disperse.burstElapsed += dt
const FADE_IN_SEC = 0.6

for (let i = 0; i < count; i++) {
  const p = disperse.per[i]
  const sinceStart = disperse.burstElapsed - p.delay
  const burstProgress = clamp(sinceStart / p.duration, 0, 1)

  if (burstProgress < 1) {
    // burst — unchanged easeOutCubic to spawn
    const e = easeOutCubic(burstProgress)
    positions[i].x = p.spawnX * e
    positions[i].y = p.spawnY * e
  } else {
    // drift — anchor set lazily on this sprite's first drift frame
    let a = disperse.anchor.get(ids[i])
    if (!a) {
      a = { x: p.spawnX, y: p.spawnY }
      disperse.anchor.set(ids[i], a)
    }
    const sinceBurstEnd = sinceStart - p.duration
    const t = sinceBurstEnd / disperse.cycleSpeed
    const fadeIn = Math.min(1, sinceBurstEnd / FADE_IN_SEC)
    const wd = disperse.wanderDistance * fadeIn
    // sin-sum dx/dy around anchor, * wd
    // hover-freeze back-solve preserved
  }
  writeInstance(i)
}
```

Key properties:

* **No global gate.** Each sprite transitions to drift the moment its
  own burst completes. The field stays alive throughout — no synchronised
  freeze frame.
* **Per-sprite drift time.** `sinceBurstEnd` is calculated per sprite, so
  each sprite's sine oscillation starts at its individual t=0.
* **Per-sprite amplitude fade-in.** `wd = wanderDistance * fadeIn`
  ramps drift amplitude from 0 to 1 over 0.6 s, so velocity at the burst
  → drift handoff stays continuous on a per-sprite basis. The
  asynchronous staggering across the field hides any residual per-sprite
  velocity transient.
* **Lazy anchor.** `disperse.anchor` is populated incrementally as
  each sprite finishes its burst, rather than in one global sweep when
  the phase flipped. Identical final values, just timed individually.

### What is preserved

* Burst feel — identical. Same `easeOutCubic`, `spawnX/Y`, `delay`,
  `duration`.
* Drift steady-state — identical. Once a sprite is past its 0.6 s
  fade-in, `wd = disperse.wanderDistance` exactly. All sine frequencies,
  phases, base-subtraction values untouched.
* Hover freeze — unchanged. The back-solved-anchor identity
  `position = anchor + (dx, dy)` still holds.
* Spatial distribution — `rMax`, the `Math.sqrt(Math.random())` radius,
  the random angle: all unchanged.
* `enterDisperse` / `exitDisperse` — not touched. `disperse.phase` is
  still set to `'burst'` on entry; it's just never read inside the tick
  anymore. Same for `driftElapsed`. The orphan state is left in place
  so the public surface stays stable.

---

## SET-CANVAS-TEXT — per-canvas interpretation overlay

`set-canvas-text` is the wire directive that paints a title + body block
onto a specific project canvas. It mirrors interface_nuxt's
`.proximity-panel` content (the Mirror / Trace / Shift / Replay
descriptive text) on the project side so the interface-side panel and
the canvas-side overlay appear simultaneously, with identical typography,
centred inside the same quadrant.

This is the **tenth project-side exception**. Scoped tightly: a single
DOM block per container, a CSS rule mirroring `.proximity-panel`'s
typography, one handler in `commands.js`, registration in
`commandsManager.js`. No render-loop, state-machine, or interaction-
logic participation.

### Wire vocabulary

```
set-canvas-text({ canvasIndex: 0|1|2|3, title: string, body: string })
```

* **`canvasIndex`** — which canvas to act on. Order matches project's
  `STATES.split.rects`: 0 = top-left, 1 = top-right, 2 = bottom-left,
  3 = bottom-right. Same mapping as `set-canvas-zoom` and the
  `component_${i+1}` ids in `view3Interpretations`.
* **`title`** / **`body`** — the text content. Empty strings (or
  missing fields) clear the overlay and hide the block.

Project is content-blind: it stores `textContent` and toggles a
`.visible` class. All interpretation copy lives in
`interface_nuxt/app/view3/view3Interpretations.ts`, keyed by
`componentId`.

### Emission rules

Three call sites in `interaction.ts`, all keyed to mirror an existing
interface-side reveal so both screens animate together:

| Moment                                              | Emission                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| VIEW_3 quadrant cross click (`zoomCanvas(i)`)       | `set-canvas-text(i, title, body)` for that quadrant's componentId — mirrors the per-cross interface `.quadrant-text.visible` reveal, gated on `canvasZoomed[i]`. |
| VIEW_3 → VIEW_4 advance (`enterRelationalView`)     | `set-canvas-text(i, '', '')` for all four — clears the carried-over overlay so VIEW_4 starts blank (matches interpretation mode = OFF). |
| VIEW_4 interpret-control toggle (`toggleView3Interpretation`) | ON → `set-canvas-text(i, title, body)` for all four; OFF → `set-canvas-text(i, '', '')` for all four. |

Emissions are independent of the persistent render-state pipeline
(`set-state` + `focus` + path directives) and of `set-canvas-zoom`. The
overlay is a pure perceptual layer — adding or clearing it never
touches camera state, point system, or path renderer.

### Project-side rendering contract

`project/index.html` adds one block per container:

```html
<div id="container-N" class="container">
  <span class="corner-label" data-position="..."></span>
  <div class="canvas-text" data-canvas="N-1">
    <p class="canvas-text-title"></p>
    <p class="canvas-text-body"></p>
  </div>
</div>
```

`.canvas-text` CSS in `project/src/style.css` exactly mirrors the
global `.proximity-panel` block in `interface_nuxt/app/app.vue` (fixed
30em width, serif, colour `#595b54`, identical title + body sizes),
centred absolutely inside its container via `top/left: 50%` +
`translate(-50%, -50%)`. Fades on opacity only, gated by `.visible`.

On wire receipt of `set-canvas-text(payload)`:

```js
function setCanvasText(payload) {
  const i = payload?.canvasIndex
  if (typeof i !== 'number' || i < 0 || i > 3) return
  const el = document.querySelector(`.canvas-text[data-canvas="${i}"]`)
  if (!el) return
  const title = typeof payload.title === 'string' ? payload.title : ''
  const body = typeof payload.body === 'string' ? payload.body : ''
  el.querySelector('.canvas-text-title').textContent = title
  el.querySelector('.canvas-text-body').textContent = body
  el.classList.toggle('visible', !!(title || body))
}
```

### Invariants

* `set-canvas-text` never touches `project`'s state machine, render
  loop, point system, path renderer, focus state, or camera. It is
  **purely a DOM textContent + class mutation** on a single element.
* The overlay is **client-only visual state**. Not persisted on the
  server, not in `localStorage`, not on the wire beyond the per-event
  directive. Page reload destroys it; subsequent interactions rebuild
  it from the next emission.
* Same shape as `set-mask`, `set-canvas-bg`, `set-corner-labels`: a
  scoped perceptual primitive driven by an explicit `interface_nuxt`
  directive, with zero project-side interpretation.
* Content is owned by `interface_nuxt` (`view3Interpretations.ts`);
  project never lookup-resolves an id to text. Adding a new component
  is therefore an interface-side change — project carries no
  componentId table.
* Boot handshake does **not** emit `set-canvas-text`. The overlay is
  empty by default (no `.visible` class), which is the correct cold-
  boot state.

---

## SET-CENTER-CAPTION — viewport-centred overlay text

`set-center-caption` is the wire directive that paints a single short
sentence at viewport centre on the project side. It mirrors
interface_nuxt's `.modes-caption` element (in `View3Transition.vue`)
exactly, so both screens reveal the line of copy at the same beat —
currently the 1 s timer that fires after the user clicks the fourth
VIEW_3 quadrant cross.

This is the **eleventh project-side exception**. Scoped tightly: one
DOM element at body level, a CSS rule, one handler in `commands.js`,
registration in `commandsManager.js`. No render-loop, state-machine,
or interaction-logic participation.

### Wire vocabulary

```
set-center-caption({ text: string })
```

* **`text`** — the string to render. Empty string (or missing field)
  clears the caption and hides the element.

Project is content-blind. The copy lives interface-side in
`View3Transition.vue` as the `MODES_CAPTION` constant, which is
rendered into the interface `.modes-caption` element and *also* passed
through `store.setCenterCaption(text)` to the wire.

### Emission rules

Two call sites in `interaction.ts`, both keyed to existing
interface-side reveals so both screens animate in lockstep:

| Moment                                                          | Emission                                                |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| 1 s after fourth VIEW_3 quadrant cross click                    | `set-center-caption(MODES_CAPTION)` — fade in.    |
| VIEW_3 → VIEW_4 advance (`enterRelationalView`)                 | `set-center-caption('')` — clear before VIEW_4 mounts. |

Emissions are independent of `set-state`, `focus`, path directives,
and the per-canvas `set-canvas-text`. The caption is a pure perceptual
overlay layered on top of project's canvas; adding or clearing it
never touches camera state, point system, or path renderer.

### Project-side rendering contract

`project/index.html` adds one element at body level, sibling to
`render-mask`:

```html
<p id="center-caption" aria-hidden="true"></p>
```

`#center-caption` CSS in `project/src/style.css` mirrors interface's
`.modes-caption` typography (serif, colour `#595b54`, single-line
`white-space: nowrap`, same font size + line height) and pins itself
to viewport centre via `position: fixed; top/left: 50%;
transform: translate(-50%, -50%)`. Fades on opacity only, gated by a
`.visible` class. `z-index: 1001` sits above `render-mask` so the
caption is never veiled.

On wire receipt of `set-center-caption(payload)`:

```js
function setCenterCaption(payload) {
  const el = document.getElementById('center-caption')
  if (!el) return
  const text = typeof payload?.text === 'string' ? payload.text : ''
  el.textContent = text
  el.classList.toggle('visible', !!text)
}
```

### Invariants

* `set-center-caption` never touches `project`'s state machine, render
  loop, point system, path renderer, focus state, or camera. It is
  **purely a DOM textContent + class mutation** on a single element.
* The caption is **client-only visual state**. Not persisted on the
  server, not in `localStorage`, not on the wire beyond the per-event
  directive. Page reload destroys it; the next VIEW_3 traversal
  rebuilds it.
* Same shape as `set-mask`, `set-canvas-bg`, `set-corner-labels`, and
  `set-canvas-text`: a scoped perceptual primitive driven by an
  explicit `interface_nuxt` directive, with zero project-side
  interpretation.
* Content is owned by `interface_nuxt` (`MODES_CAPTION` constant in
  `View3Transition.vue`). Project carries no copy of the string.
* Boot handshake does **not** emit `set-center-caption`. The element
  is empty by default (no `.visible` class), which is the correct
  cold-boot state.
* Single-element design: the directive supports **one** centred
  caption slot at a time. Reuse is fine — emit a new `text` and it
  replaces the previous one — but two concurrent centred captions
  would require a second slot.

---

## VIEW-3 — VISUAL CONTINUITY WITH PROJECT

`interface_nuxt`'s surface is composed to read as **one continuous field
with project**, not as a separate UI floating over project's canvas.
Several structural decisions support this — the atmospheric backdrop is
shared across all three views, the grid cross is VIEW-3-specific (it
mirrors project's split/overview marker), and a global viewport reset
keeps the surface flush. All are **presentational invariants**, not
visual polish.

### Atmospheric backdrop mirrored from project

Project's two `body[data-canvas-bg="..."]` rules — `black` and `gradient`
— are mirrored into `interface_nuxt` as **two global unscoped utility
classes in `app.vue`**: `.bg-black` and `.bg-gradient`. The 10-layer
multi-radial gradient stacks are copied verbatim from
`project/src/style.css`, along with `background-attachment: fixed`,
`background-size: 100vw 100vh`, and `background-position: 0 0`.

All three views opt in by applying the class on their root element:

| View    | Class binding                                  | Behavior                                              |
| ------- | ---------------------------------------------- | ----------------------------------------------------- |
| VIEW-0  | inline `body[data-canvas-bg="gradient"]` (iframe boot) | always day (the disperse entry surface; never toggled). |
| VIEW-2  | hardcoded `bg-gradient`                        | always day (one-shot transition buffer, no toggle).   |
| VIEW-3  | dynamic `bg-${store.canvasBackground}`         | toggleable via VIEW-3's `night`/`gradient` buttons.   |

The same `setCanvasBackground` store action that mutates VIEW-3's class
binding also emits the `set-canvas-bg` wire directive to project (see
*CANVAS BACKGROUND*), so both `interface_nuxt` and `project` switch
modes in lockstep from one state source.

Specificity caveat: because the gradient classes are **global and
unscoped**, any scoped `background: ...` rule on a view's root element
will silently win against them (Vue scoped styles add a data-attribute
that bumps specificity). Views must therefore **not** declare a scoped
`background` on the root they apply `.bg-*` to — set color, padding,
transitions, etc. there, but leave `background` to the global class.

Consequence on VIEW-3 specifically: the `.grid` container and every
`RelationComponent` panel have **no background of their own**. Adding
any fill — even a translucent gap color or a hover lift — tints the
entire surface and breaks the continuity. Spatial separation between
quadrants comes from the grid cross (below) and the cells themselves,
not panel fills.

If project's gradient values change in `style.css`, the two app.vue
classes must update with them. This is the single point of duplication;
it exists because the two systems must visually agree as one
atmosphere.

### Grid cross mirrored from project

`.view-3::before` reproduces project's `body::before` cross — two 1px
`linear-gradient` lines crossing at 50%/50%, inset 1.5% from viewport
edges, in project's exact stroke color. The cross is unconditionally
visible in VIEW-3 because VIEW-3 only ever mounts while project is in
`split` or `overview` (the same conditions project gates its own cross
on). The 2×2 component split then aligns pixel-for-pixel with project's
canvas seams.

### Global viewport reset

`app.vue` declares an unscoped global style that zeroes
`html` / `body` / `#__nuxt` margin and padding and sets
`overflow: hidden`. Without it, the browser's default 8px body margin
pushes the viewport-sized VIEW-3 surface past the viewport, producing a
16px scroll range on each axis. The reset is global because the issue
is global — any page using `100vw / 100vh` is affected.

---

## TYPOGRAPHY SYSTEM

The interface uses two custom font families served from
`interface_nuxt/public/fonts/`, registered via `@font-face` in
`app/app.vue`'s global `<style>` block (also mirrored in
`project/src/style.css` so the project canvas overlays render the same
families):

* **ABC Otto** — display + body family (Regular + MediumItalic faces,
  `.woff2` primary + `.woff` fallback). Applied globally via
  `html { font-family: 'ABC Otto', serif }`. Drives the Proxima title,
  rotating intro panels, corner labels, quadrant titles, etc.
* **Neue Kabel** — geometric sans, Medium + MediumItalic faces
  (`.otf` only — trial license). Applied to body text inside the
  proximity panel (`.proximity-panel-body` interface +
  `.canvas-text-body` project), giving the interpretation text a
  distinct geometric voice from the surrounding ABC Otto.

### Font loading + preload

`@font-face` declarations use `font-display: swap` so text always
renders (in fallback) immediately, then swaps to the real font when
it arrives. To minimise the visible FOUT swap moment (which was
producing inconsistent renders between page refreshes — the inset
shadow stack on Proxima depends on glyph shape, so a fallback-to-real
swap visually re-rasterises the shadow), `nuxt.config.ts` declares
`<link rel="preload" as="font" crossorigin="anonymous">` tags for the
four critical font files in `app.head.link`. The browser starts
downloading fonts before it parses CSS, so by the time the
`@font-face` rules are computed, the files are already in cache and
the swap is invisible.

`crossorigin="anonymous"` is **required** even for same-origin font
preloads — without it the preload is fetched but the CSS request
triggers a second download.

### Label-size sync contract — `--label-size` CSS custom property

Three typographic tiers share a single font-size, locked via the
`--label-size` custom property defined on `:root` in BOTH
`app/app.vue` AND `project/src/style.css` (currently `1.15rem`):

1. **Corner labels** — `.corner-label` global rule in both apps. Also
   referenced by `RelationComponent.vue`'s scoped style for z-index +
   glow keyframe, but not for typography.
2. **Quadrant title texts** — `.proximity-panel-title` (interface) +
   `.canvas-text-title` (project).
3. **Rotating intro text** — `.caption` (VIEW_1), `.entry-caption`
   (VIEW_2), `.intro-caption` (VIEW_3).

**Two rules govern the relationship:**

* **Full typographic mirror** between `.corner-label` and the
  quadrant titles — same `font-size`, `font-weight: 500`,
  `font-style: italic`, `letter-spacing: 0.015em`. When one
  property changes, all three selectors update in lockstep.
  font-family is inherited (ABC Otto via `html`).
* **Size-only sync** for rotating intro text — only `font-size`
  follows `--label-size`. Weight, italic, and tracking are
  independent per view.

To resize the tier, edit `--label-size` in BOTH `:root` blocks (the
two apps have separate CSS scopes). Never hardcode a font-size on any
of those selectors; if a new element joins the tier, point it at
`--label-size` too.

### Text halo system — `--halo` CSS custom property (currently disabled)

A project-wide blue-gray text halo (multi-layer `text-shadow`)
defined as `--halo` in both apps' `:root`, with the cascade applied
via `body { text-shadow: var(--halo) }`. text-shadow is an inherited
CSS property, so the rule propagates to every text node automatically;
selectors that need a custom shadow (corner-label warm pulse,
VIEW_0's Proxima inset stack, VIEW_0's elaborate subtitle halo,
VIEW_3's cross-glow keyframe) just declare their own text-shadow and
override the inherited value.

**Status: temporarily commented out** in both apps' `body` rule (and
in VIEW_0's `.caption` + `.hint`) so transition timing can be tested
without the paint cost of N text elements running multi-layer
shadows. Each `TEMP DISABLED` block in the codebase carries a
comment block; uncomment to re-enable. The `--halo` variable
definitions remain in `:root` so the recipe is documented and
parameterised — they're inert without the consuming `body` rule.

**Why this matters when re-enabling:** at the original recipe
(11 layers, max 380px reach) the paint cost was substantial,
especially with VIEW_4's hover-zoom animation re-rasterising shadows
each frame. The tightened recipe (4 layers, max 18px) is much
lighter; if re-enabling causes jank, reduce the rim alpha or drop
the outermost layer. See *VIEW_0 — ONBOARDING* for VIEW_0-specific
shadow details (inset stack on Proxima + elaborate subtitle halo —
both also currently disabled).

---

## ROTATING-TEXT SYSTEM

Three views (`VIEW_1`, `VIEW_2`, `VIEW_3`) display rotating intro
sentences that fade in, hold, cycle through, and fade out. All three
share IDENTICAL timing parameters via shared CSS custom properties +
shared TypeScript constants. Change a value once in the source and
every consumer updates.

### Shared parameters

**CSS custom properties in `app/app.vue`'s `:root`** (visual fade
timing):

| Variable | Meaning | Current value |
|---|---|---|
| `--rotate-fade-ms` | Duration used for appear, enter, AND leave fades. | `500ms` |
| `--rotate-fade-easing` | Easing curve for every fade. | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` |
| `--rotate-appear-delay` | Hold before the first sentence drifts in (lets the view-level cross-fade settle first). | `1400ms` |
| `--rotate-empty-beat` | Empty pause between sentences (enter-delay under `mode="out-in"`). | `200ms` |

**TypeScript constants in `app/utils/rotateText.ts`** (timer cadence,
imported by all three views):

| Constant | Meaning | Current value |
|---|---|---|
| `ROTATE_PANEL_MS` | How long each sentence sits at full opacity before the timer ticks. | `4000ms` |
| `ROTATE_FADE_OUT_MS` | Duration of the leave animation; drives the `setTimeout` that delays the next view advance until the leave completes. **Must equal `--rotate-fade-ms`** numerically (the CSS var and the JS constant are two halves of the same number). | `500ms` |

### Three consumers

Each view wraps its rotating `<p>` in `<Transition name="..."
mode="out-in">` with `:key` driving sentence-to-sentence remount, and
a script-side ref driving the exit leave:

| View | File | Class prefix | Sentence array | Visibility ref | Exit trigger |
|---|---|---|---|---|---|
| VIEW_1 | `View1Explanation.vue` | `.caption-*` | `PANELS` | `captionVisible` | timer (calls `advance()` after last panel) |
| VIEW_2 | `View2Disperse.vue` | `.entry-*` | `ENTRY_PANELS` | `entryCaptionVisible` | sprite click in iframe via `view0:image-click` postMessage, OR timer after last sentence |
| VIEW_3 | `View3Transition.vue` | `.intro-*` | `INTRO_PANELS` | `introVisible` | 4th quadrant cross clicked (watcher on `store.allCanvasesZoomed`), OR timer after last sentence |

Each view's stylesheet declares `.{prefix}-enter-active`,
`.{prefix}-enter-from`, `.{prefix}-leave-active`, `.{prefix}-leave-to`
rules that reference the `--rotate-*` vars. Style is opacity-only —
no transform drift. The base caption rule
(`.caption` / `.entry-caption` / `.intro-caption`) sets
`transform: translateX(-50%)` for centring, which would override any
drift on the transition hooks via CSS cascade anyway.

### `appear` vs JS-gated first render — VIEW_1 uses Vue, VIEW_2 + VIEW_3 use JS

**VIEW_1** uses Vue's native `<Transition appear>` with the
`.caption-appear-active` rule applying the `--rotate-appear-delay`
transition-delay. This works on VIEW_1 because nothing else is loading
at mount time — the view-level cross-fade settles cleanly before
Vue's appear classes are removed.

**VIEW_2** can't use Vue's appear: the iframe load + the parent
view-level transition's reflow commit styles before Vue's
appear-from class can register, so the `--rotate-appear-delay`
silently doesn't apply and the first sentence drifts in immediately.

**VIEW_3** has the same problem from a different cause — its many
child elements (corner labels, 4 quadrant crosses, 4 ProximityPanel
components, CentralImage stack) all mount at once, producing a
similar reflow race.

For both, the workaround is identical:

1. The visibility ref starts `false` (e.g. `entryCaptionVisible = ref(false)`).
2. `<Transition>` does **not** have `appear`.
3. `onMounted` reads `--rotate-appear-delay` and `--rotate-empty-beat`
   from the CSS at runtime via `getComputedStyle`, then
   `setTimeout`s the ref to `true` after `appearDelay − emptyBeat` ms.
4. When the ref flips true, Vue Transition's `enter-*` classes fire.
   The enter-active rule has its own `--rotate-empty-beat` delay
   built in, so the total time from view mount to first sentence
   visible is `(appearDelay − emptyBeat) + emptyBeat + fadeMs =
   appearDelay + fadeMs` — exactly matching VIEW_1's Vue-appear path.

The JS reads the CSS vars at runtime, so any `:root` tweak
automatically propagates to all three views — no second edit needed.

VIEW_2 and VIEW_3 stylesheets therefore have NO `.*-appear-*` rules;
only `.*-enter-*` and `.*-leave-*`. VIEW_1 keeps its
`.caption-appear-*` rules.

### Last-sentence auto-fade

All three views auto-fade their last sentence after its full
`ROTATE_PANEL_MS` display time, even if the view doesn't auto-advance.
The timer's setInterval increments the sentence index each tick; on
the tick AFTER the last sentence becomes current (i.e. once the last
sentence has had its full `ROTATE_PANEL_MS` of display), the visibility
ref flips false → Vue leave animation runs.

* **VIEW_1** — flipping `captionVisible` to false also calls
  `enterEntryView()` via setTimeout (advances the view).
* **VIEW_2** — flipping `entryCaptionVisible` to false JUST hides the
  caption; the view stays on VIEW_2 until the user clicks a sprite.
  The sprite-click handler treats "already faded" as "advance
  immediately" so the user isn't blocked.
* **VIEW_3** — flipping `introVisible` to false JUST hides the
  caption; the view stays on VIEW_3 until the user clicks all 4
  quadrant crosses. The `store.allCanvasesZoomed` watcher also flips
  `introVisible` false (defensive — handles the case where the user
  clicks crosses before the last-sentence timer fires).

### Exit fade-then-advance

When a view DOES advance after the last sentence (VIEW_1) or after a
user click (VIEW_2's sprite click), the pattern is:

1. Set the visibility ref to false → Vue Transition leave runs.
2. `setTimeout(advance, ROTATE_FADE_OUT_MS)` waits for the leave
   animation to finish before triggering the view-level transition.

This avoids the harsh-cut where the view-level cross-fade overlapped
with the still-visible caption. The setTimeout duration MUST equal
`--rotate-fade-ms`.

### Visual continuity with VIEW_0's exit

VIEW_0's title + subtitle fade-out (on click) uses the same
`500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` timing for visual
continuity across the view chain, but is implemented as a keyframe
animation gated by a `fadingOut` flag (not Vue Transition) because
the title and subtitle aren't conditionally rendered — they're always
present. The click handler sets `fadingOut = true`, the CSS animation
runs over 500ms, then `setTimeout(viewState.advance, 500)` advances.

---

# CURRENT DEVELOPMENT SCOPE

Current phase:
interface_nuxt prototype

For now, only work inside:

interface_nuxt

Do not modify project, **with twelve explicit exceptions**:

1. The user-driven path-rendering directive surface inside `project` —
   `path-segment`, `path-truncate`, and the `pathTrace` primitive they
   drive — is the canonical visual path system and is permitted to
   evolve. The legacy `pathPlayer` / `simulatePath` machinery in
   `project` must remain untouched and unreferenced from
   `interface_nuxt`. See *VIEW-3 — PATH RENDERING*.
2. The render-mask directive surface inside `project` — `set-mask`, the
   `<div id="render-mask">` DOM element, and its CSS — is a perceptual
   veil over project's canvas during phase transitions. It is a pure
   DOM/CSS overlay with no render-loop, state-machine, or interaction-
   logic participation. See *VIEW-2 — RENDER MASK*.
3. The canvas-background directive surface inside `project` —
   `set-canvas-bg`, the `body[data-canvas-bg="..."]` selector rules in
   `style.css`, and the `<body>` `data-canvas-bg` attribute — is a
   perceptual presentation toggle for the canvases' backdrop. It is a
   pure DOM/CSS overlay with no render-loop, state-machine, or
   interaction-logic participation. See *CANVAS BACKGROUND*.
4. The VIEW_2 (formerly VIEW-0) canvas-embed surface inside `project` —
   the `?embed=1` URL flag in `main.js`, the alternate boot path it
   activates (boots directly into `disperse`, skips the socket bridge,
   applies the `big` highlight preset, sets the gradient backdrop
   inline), and the `enablePicking({ onHover, onClick })` API in `app.js`
   that posts `view0:image-hover` / `view0:image-click` messages back to
   `window.parent` via `postMessage`. This instance is **detached from
   the relay** — it neither sends nor receives any wire event. See
   *VIEW_2 — CANVAS ENTRY PHASE*.
5. The transient highlight directive surface inside `project` —
   `set-highlight`, the `actions.setHighlight` handler in `commands.js`,
   and the per-instance eased highlight + state-keyed preset machinery in
   `pointsManager.js` (`highlight`, `setHighlightPreset`, the active-set
   tick, the glow follow). It is a pure perceptual emphasis on a single
   instance with no render-loop, state-machine, or interaction-logic
   participation. See *SET-HIGHLIGHT*.
6. The **per-canvas zoom directive surface** — `set-canvas-zoom`, the
   `actions.setCanvasZoom` handler in `commands.js`, the
   `canvasOverrides[]` array + `setCanvasOverride` method in
   `stateManager.js`, the per-canvas cameraZ interpolation in the
   `stateManager.tick` loop, and the `panDuration` option on
   `app.focusOn` (with the `positionTween` slot in the animate loop).
   Drives VIEW_3's canvas-by-canvas overview → split visual transition.
   No state-machine reinterpretation, no spatial-rendering inference. See
   *PER-CANVAS ZOOM*.
7. The **focus-in-overview pan-suppression rule** in
   `commands.focusOnId` — when `stateManager.state === 'overview'`, pass
   `{ pan: false }` to `app.focusOn` so the camera target is not moved
   but the perceptual halo still runs. Codifies the "overview is
   read-only spatially" rule (previously implicit, post-confirmOverview
   only) for any overview state. See *FOCUS-IN-OVERVIEW*.
8. The **per-sprite burst↔drift dispatch** in `pointsManager.tickDisperse`
   — single-loop replacement of the previous two-phase `burst` / `drift`
   state machine with its global synchronisation gate. Each sprite
   transitions individually, with a per-sprite 0.6 s amplitude fade-in
   for velocity continuity. Scoped to `tickDisperse` only; burst feel
   and drift steady-state are unchanged. See *DISPERSE SMOOTHNESS*.
9. The **component corner labels** rendered on the project canvases —
   four `<span class="corner-label" data-position="...">` elements
   added to each `<div id="container-*">` in `project/index.html`
   (Mirror / Trace / Shift / Replay, one per canvas, matching
   interface_nuxt's `.corner-label`), a `.corner-label` block in
   `project/src/style.css` whose typography + warm glow exactly mirror
   the global `.corner-label` in `interface_nuxt/app/app.vue`, and the
   `set-corner-labels({ visible })` wire directive that gates their
   opacity. Handler `actions.setCornerLabels` in `commands.js` toggles
   `body[data-corner-labels]`; CSS reveals the labels via
   `body[data-corner-labels="visible"]:not([data-state="single"]) .corner-label { opacity: 1 }`
   (the `:not([data-state="single"])` guard is the *Component-title
   invariant* — see the section under *Boot reset sequence*).
   `interface_nuxt` defers the reveal until the user **clicks the top
   advance cross** in VIEW_3, i.e. from inside `enterRelationalView`
   (`projectSocket.setCornerLabels(true)`). The wire emission lands at
   the same beat as project's `setState('split', 0)` and VIEW_4's mount
   (which renders its own always-visible RelationComponent corner
   labels), so both screens show MIRROR / TRACE / SHIFT / REPLAY in
   sync as VIEW_4 takes over. Once revealed the labels stay visible
   across subsequent state transitions (split / overview) until the
   next boot. **One-shot glow pulse on appearance.** Both sides define
   matching `@keyframes corner-label-glow` (project/src/style.css,
   RelationComponent.vue) — a 3.5 s ease-out swell of the warm cream
   `text-shadow` peaking at 28 % then settling slowly back to the
   static glow. Peak stack reaches a 340 px outer halo so the four
   tags draw the eye to the corners before they recede. On project, the animation is attached to the same visibility
   rule that fades the labels in, so the rule starting to match
   triggers the pulse. On interface, the animation lives on
   `RelationComponent`'s scoped `.corner-label`, firing on mount of
   VIEW_4. Both timings are identical so the four tags pulse in
   lockstep. Pure DOM + CSS + a thin handler — no render-loop,
   state-machine, or interaction-logic participation. See *VIEW_4 —
   COMPONENT LAYOUT*.
10. The **per-canvas text overlay** — `set-canvas-text`, the four
    `<div class="canvas-text" data-canvas="...">` blocks (title + body)
    added to each `<div id="container-*">` in `project/index.html`, a
    `.canvas-text` block in `project/src/style.css` whose typography
    exactly mirrors the global `.proximity-panel` in
    `interface_nuxt/app/app.vue`, and `actions.setCanvasText` in
    `commands.js`. Driven by interface emissions in `zoomCanvas` (per-
    canvas reveal on VIEW_3 cross click), `enterRelationalView` (clear
    all four on VIEW_3 → VIEW_4 transition), and
    `toggleView3Interpretation` (reveal/clear all four on the VIEW_4
    interpret-control toggle). Content lives entirely in
    `view3Interpretations.ts`; project is content-blind. Pure DOM +
    CSS + a thin handler — no render-loop, state-machine, or
    interaction-logic participation. See *SET-CANVAS-TEXT*.
11. The **centred-caption overlay** — `set-center-caption`, the
    `<p id="center-caption">` element added at body level in
    `project/index.html`, a `#center-caption` block in
    `project/src/style.css` mirroring interface_nuxt's `.modes-caption`
    typography (single line, serif, viewport-centred), and
    `actions.setCenterCaption` in `commands.js`. Driven by interface
    emissions on the 1 s VIEW_3 caption timer (`store.setCenterCaption(text)`)
    and cleared on the VIEW_3 → VIEW_4 advance
    (`enterRelationalView`). Content lives interface-side
    (`MODES_CAPTION` constant in `View3Transition.vue`); project is
    content-blind. Pure DOM + CSS + a thin handler — no render-loop,
    state-machine, or interaction-logic participation. See
    *SET-CENTER-CAPTION*.
12. The **VIEW_4 quadrant hover-zoom surface** — `set-canvas-overview`
    (symmetric inverse of `set-canvas-zoom`), the `suppressFocusPan`
    flag on `canvasOverrides[]` records in `stateManager.js`, the
    `shouldPanCanvas(i)` helper consulted by `commands.focusOnId` for
    per-canvas pan suppression, `actions.setCanvasOverview` in
    `commands.js`, the `app.setCameraTarget({ x, y, panDuration })`
    method on each canvas for explicit position panning without
    binding a focus target, the interpolated-z seeding in
    `setCanvasOverride` (so rapid hover changes don't snap), the
    optional `durationSec` field on both `set-canvas-zoom` and
    `set-canvas-overview` payloads, and the `useTimer` per-segment
    flag on `pathTrace.addSegment` (with the
    `SEGMENT_DRAW_DURATION = 1.0 s` fallback) for path segments drawn
    on pan-suppressed canvases. Drives VIEW_4's hover-driven
    "three canvases unzoom, hovered canvas stays zoomed" behaviour and
    its symmetric return on mouse-out. Extends exception #6
    (PER-CANVAS ZOOM) with the inverse direction and the focus-pan
    suppression rule. No state-machine reinterpretation; project
    stays in `split` throughout. See *VIEW_4 — QUADRANT HOVER ZOOM*.

All twelve exceptions are scoped tightly: pure rendering / configuration
surfaces driven by explicit `interface_nuxt` directives (or, in the
VIEW_2 embed case, by an out-of-band `postMessage` channel for the
canvas-pick input). No project-side interpretation, derivation, or
interaction logic is permitted inside any of them.

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
