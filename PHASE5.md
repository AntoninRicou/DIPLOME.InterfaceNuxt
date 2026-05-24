# PHASE 5 — NAVIGATION-SNAPSHOT STABILIZATION

## Goal

PHASE 5 is **not a new feature**. It is the stabilization pass that
makes the navigation-snapshot pipe reliable before anything visual
inside `project` starts consuming it.

The pipe established in Step 1 is:

```
interface_nuxt  →  relay  →  project
```

PHASE 5 makes that pipe survive reconnects, stay truthful continuously
(not just at overview time), reject stale snapshots, and document the
new relay-side state contract — **without changing rendering**.

---

## Architectural rule (load-bearing)

`interface_nuxt` remains the **only source of truth** for navigation
state.

* **relay** stores exactly **one latest snapshot** in memory. The
  snapshot itself contains the current navigation branch
  (`navigationHistory` + `historyIndex`), but the relay does not keep
  a timeline of previous snapshots — older snapshots are overwritten,
  not appended. The relay does not mutate, derive, or interpret the
  snapshot.
* **project** receives and stores the snapshot locally, but does not
  derive or mutate it. Project also keeps only the latest snapshot, not
  a history.

The snapshot is a one-way, read-only synchronization channel from
interface to project, with the relay as a stateful but passive
intermediary holding a single value.

---

## Channel separation (load-bearing)

The system now has **two parallel channels** between `interface_nuxt`
and `project`:

* **Render-directive channel** — `focus`, `path-segment`,
  `path-truncate`, `path-clear`, `set-state`, `set-mask`,
  `set-canvas-bg`. Defines ALL visual output in `project`.
* **Navigation-snapshot channel** — `navigation-snapshot`. Stored
  locally in `project` as `navigationState`. Internal state only.

They are **strictly separated**:

* Render directives define ALL visual output in `project`.
* Navigation snapshot is stored only as internal state
  (`navigationState`).
* Snapshot MUST NOT override or modify visual rendering state.
* Snapshot MUST NOT trigger any rendering behavior — no canvas read,
  no camera move, no path mutation, no state-machine transition.

### Priority when both arrive close in time

The relay preserves emission order on a single connection, and a
single store action emits both kinds of messages in a fixed order
(e.g. `activateCentral` emits `focus` + `path-segment` before
`emitSnapshot`). The rule on the receive side mirrors that:

* **Render directives take priority for visuals.** Project applies
  them as soon as they arrive — no waiting, no reordering.
* **Snapshot is applied only after**, for state consistency. It
  updates `navigationState` and nothing else.

If a directive and a snapshot describe the same logical event,
visuals are already correct from the directive by the time the
snapshot lands; the snapshot only records the new branch shape in
`navigationState`.

### Why this rule exists

Without it: `project` risks visual desync (silent, hard to debug) if
a snapshot is ever interpreted as a rendering hint — the canvas
would oscillate between snapshot-driven and directive-driven states.

With it: snapshot becomes a safe **memory layer**, not a competing
renderer. The render-state pipeline from PHASE 4 (plus its three
approved extensions) remains the sole driver of visuals.

This is the **key fix** that makes the snapshot channel safe to add.

---

## 1. Make snapshot sync resilient across reconnects

Navigation history must not disappear because of a reconnect or a
refresh.

**Project refreshes.** On every `register` event from a `project`-role
client, the relay immediately replays its single `latestSnapshot` (if
one exists) to the freshly registered client. No snapshot stored yet →
relay emits nothing; project boots empty as today.

**Interface refreshes.** On every `register` event in
`interface_nuxt`'s socket plugin, the interface immediately re-emits
its current local snapshot to the relay. Added to the existing
`onRegister` callback in `app/plugins/projectSocket.client.ts`, after
the four boot directives (`path-clear`, `set-state('single')`,
`set-mask(0, 0)`, `set-canvas-bg(...)`). Empty branch
(`navigationHistory.length === 0`) is still emitted — empty is truth.

**Either side reconnects mid-session.** Both recoveries are automatic
because both `register` events trigger their respective re-emit /
replay.

Outcome: shared history survives interface refresh, project refresh,
and transient websocket drops on either side.

---

## 2. Emit on every navigation mutation

Today, snapshot emit happens only on `confirmOverview`. PHASE 5
expands coverage to **every store action that mutates** any of:

* `navigationHistory`
* `historyIndex`
* `activeCentralImageId`
* `overviewConfirmed`

That is, exactly these mutators in `app/stores/interaction.ts`:

* `selectImage`
* `enterRelationalView`
* `activateCentral` (pre-overview, pre-cap path only — the existing
  guards already short-circuit the others)
* `stepBackInHistory`
* `stepForwardInHistory`
* `jumpToHistory`
* `confirmOverview`

### Rule

**One mutation = one emit, after mutation.**

* No reactive watcher.
* No derived auto-sync.
* Explicit call sites only.

The emit is fire-and-forget, placed at the end of the action's
mutation block:

```ts
function activateCentral(id) {
  // … guards, mutation block …
  projectSocket.emitSnapshot(currentSnapshot())
  // … existing focus / path emissions …
}
```

Mutators that already short-circuit (post-overview guard in
`activateCentral`, branch-cap guard in `activateCentral`, no-op guards
in `stepBack`/`stepForward`/`jumpToHistory`) MUST NOT emit — they did
not mutate.

Each emit overwrites the relay's single stored snapshot. The relay
never keeps the previous value.

### Snapshot payload

```ts
type NavigationSnapshot = {
  ts: number
  navigationHistory: ImageId[]
  historyIndex: number
  activeCentralImageId: ImageId | null
  overviewConfirmed: boolean
}
```

The relay stores this verbatim. `project` stores this verbatim. No
field renaming, no derived fields, no transforms at any hop.

---

## 3. Prevent stale snapshots

Add `ts: Date.now()` to every snapshot at emit time.

* **Relay.** Compare `incoming.ts` to `latestSnapshot.ts`. Accept and
  broadcast if `incoming.ts >= latestSnapshot.ts`; otherwise drop and
  log `[relay] dropped stale snapshot`.
* **Project.** Same rule locally. Any received snapshot older than the
  locally stored `navigationState.ts` is ignored.

Purpose: prevent

* reconnect race conditions
* replays arriving out of order
* an older snapshot overwriting newer truth

The timestamp is **ordering protection only**. It is not authoritative
state, not authoritative time, not used for anything beyond the
`>=` comparison. Clock drift between interface and project is
irrelevant because every comparison is against a snapshot produced by
a single interface in a single session.

---

## 4. Document the new architectural contract

Before PHASE 5:

```
relay = stateless transport
```

After PHASE 5:

```
relay = transport + exactly one in-memory shared value (latestSnapshot)
```

That shift needs to be explicit in three places, as short inline
comments — enough that future edits don't silently break sync.

### `server/server.js`

```js
// PHASE 5 — the relay holds exactly one latest snapshot in memory:
// the most recent navigation snapshot from interface_nuxt. The
// snapshot itself contains the current branch (navigationHistory +
// historyIndex); the relay does NOT keep a timeline of previous
// snapshots — each new accepted snapshot overwrites the prior one.
// In-memory only, gated by ts, replayed to project on register.
// The relay does not mutate or interpret it.
```

### `app/stores/interaction.ts`

```ts
// PHASE 5 — every action that mutates navigationHistory,
// historyIndex, activeCentralImageId, or overviewConfirmed MUST
// call projectSocket.emitSnapshot(currentSnapshot()) at the end of
// its mutation block. One mutation = one emit, explicit call site.
```

### `project/src/commands.js`

```js
// PHASE 5 — project stores the latest synchronized navigation
// snapshot (overwritten on each accepted update — no history of
// snapshots is kept) for inspection and future visual consumption.
// Rendering is intentionally NOT wired to navigationState in PHASE 5.
```

These three comments are documentation invariants. Removing one is a
signal that the sync contract has been reworked.

---

## What PHASE 5 does NOT do

PHASE 5 does **no rendering work**. Do not:

* connect canvas visuals to `navigationState`
* modify `set-state`
* modify `focus`
* modify path rendering (`path-segment`, `path-truncate`, `path-clear`)
* modify `set-mask`
* modify `set-canvas-bg`
* replace or reorder the existing render-state pipeline

The render-state pipeline from PHASE 4 and its three approved
extensions (path rendering, render mask, canvas background) remain
untouched.

`project` may log received snapshots for manual inspection, but no
canvas reads `navigationState` in PHASE 5.

---

## Files modified

### `app/types/interaction.ts` (or equivalent)

* Add the `NavigationSnapshot` type.

### `app/composables/useProjectSocket.ts`

* Add `emitSnapshot(snapshot: NavigationSnapshot): boolean` — same
  fire-and-forget shape as `setState`, `focus`, etc.

### `app/stores/interaction.ts`

* Add a local `currentSnapshot()` helper (reads store, returns
  `NavigationSnapshot` with fresh `ts`).
* Call `projectSocket.emitSnapshot(currentSnapshot())` at the end of
  every mutator listed in §2.
* Add the inline architecture comment from §4.

### `app/plugins/projectSocket.client.ts`

* After the existing four boot directives in the `onRegister`
  callback, emit the current snapshot. Runs on every register,
  including reconnects.

### `server/server.js`

* Add `latestSnapshot: NavigationSnapshot | null` module state — one
  slot, overwritten by every accepted update.
* On incoming `navigation-snapshot`: apply the `ts` gate, then store
  (overwriting the previous value) and broadcast to `project`-role
  clients.
* On `register` from a `project`-role client, emit `latestSnapshot`
  to that client if present.
* Add the inline architecture comment from §4.

### `project/src/commandsManager.js`

* Route incoming `'navigation-snapshot'` to `actions.applyNavigationSnapshot(payload)`.

### `project/src/commands.js`

* Add `applyNavigationSnapshot(payload)`:
  * apply the local `ts` gate (drop if older);
  * store as `navigationState` (overwriting the previous value);
  * log `[snapshot] received ts=… history=N index=K confirmed=…`.
* Add the inline architecture comment from §4.

---

## What did NOT change

* The render-state pipeline (`set-state`, `focus`, path directives,
  `set-mask`, `set-canvas-bg`).
* `/api/interaction` (Phase 2 HTTP log) — same surface, independent
  channel.
* Branch-cap, overview-confirmation, and structural-guard semantics
  from PHASE 4.
* The four-step boot reset sequence. The PHASE 5 snapshot re-emit
  happens **after** the four directives, never in place of any.
* `project`'s rendering. No canvas reads `navigationState`.

---

## How to verify

With relay, `project`, and `interface_nuxt` all running:

1. **Baseline boot.** Reload `interface_nuxt`. On the wire, in order:
   `path-clear`, `set-state('single')`, `set-mask(0, 0)`,
   `set-canvas-bg(...)`, then `navigation-snapshot` with an empty
   history. Project logs the received snapshot.

2. **Mutation coverage.** Walk a session: VIEW-1 click → several
   VIEW-3 activations → step back → step forward → jump → confirm
   overview. At each step, exactly one `navigation-snapshot` on the
   wire and one `[snapshot] received` in project's console.

3. **Project reconnect.** Build a branch of depth 5. Reload only the
   project tab. Relay replays the (single) latest snapshot on
   register; project's `navigationState` matches the interface store.

4. **Interface reconnect.** Build a branch of depth 5. Reload only
   the interface tab. Interface re-emits on register; relay
   broadcasts; project's `navigationState` stays consistent (subject
   to `ts` gating).

5. **Timestamp gating.** Inject a manually crafted stale snapshot
   (older `ts`) into the relay. Expect: relay log
   `[relay] dropped stale snapshot`, no broadcast, project's
   `navigationState` unchanged.

6. **No-mutation no-emit.** Trigger an `activateCentral` on the same
   id as `activeCentralImageId` (same-id dedup guard) or at the
   branch cap. No `navigation-snapshot` appears on the wire.

7. **Single-slot relay.** After any sequence of mutations, the relay
   holds exactly one snapshot — the most recent accepted one. No
   timeline or list of prior snapshots exists.

8. **Channel separation.** Inject a `navigation-snapshot` into
   `project` with no preceding render directives (e.g. via the relay's
   replay-on-register, or a manual emit). Confirm:
   * `navigationState` updates and the `[snapshot] received` log line
     appears;
   * the canvas does NOT redraw, the camera does NOT move, the state
     machine does NOT transition, no path geometry changes;
   * the only side effect is local state + log.

9. **Architecture comments present.** Grep `PHASE 5` in
   `server/server.js`, `app/stores/interaction.ts`,
   `project/src/commands.js`. Each location has the comment from §4.

If all nine pass, PHASE 5 is done.

---

## Open items intentionally deferred

* **Relay-side persistence.** `latestSnapshot` is in-memory only; a
  relay restart loses it until the next interface emit.
* **Snapshot timeline / history of snapshots.** Out of scope. PHASE 5
  deliberately holds one slot per side. If a future phase needs to
  replay a session offline, that is a separate persistence concern.
* **Multi-tab interface conflict resolution.** Two open interface
  tabs would race snapshots. `ts` gating makes the outcome
  deterministic (last-write-wins), but the conflict itself is not
  resolved. Single-tab is the supported scenario.
* **Reverse channel `project → interface_nuxt`.** Deferred, as in
  PHASE 4.
* **Visual consumption of `navigationState` in `project`.** Overview
  spatialization, breadcrumbs, branch restore, replay — all deferred.
  PHASE 5 only guarantees the data is trustworthy.
* **`view_advance` → `set-state(name)` mapping.** Deferred, as in
  PHASE 4.

---

## Short version

PHASE 5 stabilizes `navigation-snapshot` as one shared read-only
synchronization channel between `interface_nuxt` and `project`,
strictly separated from the render-directive channel (snapshot is a
memory layer, never a renderer): replay on reconnect, emit on every
navigation mutation, reject stale snapshots with timestamp gating,
and document the new relay-side state contract (one in-memory slot,
no timeline of past snapshots) — without changing rendering yet.
