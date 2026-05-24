# DISPERSE PHASE — implementation plan

Replace the active VIEW-1 entry path with a **disperse canvas** entry point
owned by `project`. Keep VIEW-1 in Nuxt as dormant legacy behind a feature
flag.

---

## Goal

- DISPERSE CANVAS is the only real entry point.
- It handles interaction (hover, click) and emits a single
  `select-image(id)` event on selection.
- After the event, the existing VIEW-2 / VIEW-3 flow runs unchanged.
- VIEW-1 in Nuxt remains in source as legacy, reachable only behind a
  feature flag (for rollback / debugging). Not part of production flow.

---

## Feature flag

- `USE_DISPERSE_CANVAS` — single source of truth.
- **Where:**
  - `interface_nuxt/nuxt.config.ts` runtimeConfig (so it's reachable in
    store + plugin)
  - `project/vite.config.js` `define` (so `import.meta.env.USE_DISPERSE_CANVAS`
    works in project)
- **Default:** `true` (new system on).
- **`false`:** restores today's exact behavior (VIEW-1 Nuxt page + project
  boots into `single`).

---

## Wire layer — one new verb

- **`select-image({ id })`** — emitted by **project → interface_nuxt** when
  the user picks an image on the disperse canvas.
- The server is already a symmetric relay; no server change required.
- This is the first reverse-direction verb. Reserved for direct
  canvas-originated user input.

---

## Project changes (`project/`)

| # | File | Change |
|---|------|--------|
| 1 | `src/commandsManager.js` (or wherever socket emits live) | Add `emitSelectImage(id)` helper |
| 2 | `src/components/pointsManager.js` | Add `pickAt(clientX, clientY)` helper: raycast against InstancedMesh → `instanceId` → `ids[i]` |
| 3 | `src/app.js` | When in `disperse` state: attach `pointermove` → `points.highlight(idFromPick)`; attach `click` → emit `select-image(id)` |
| 4 | `src/app.js` or `src/main.js` | If `USE_DISPERSE_CANVAS`: on boot, call `enterDisperse()` directly (no wait for wire) |
| 5 | `src/stateManager.js` | Verify `disperse` is a valid initial state |

---

## Interface_nuxt changes

| # | File | Change |
|---|------|--------|
| 6 | `app/composables/useProjectSocket.ts` | Add `onMessage(type, cb)` (or `onSelectImage(cb)`) for incoming relay messages |
| 7 | `app/stores/interaction.ts` | Add `'DISPERSE'` initial state when flag is on; add handler that does what `selectImage(id)` does today but is callable from `DISPERSE` instead of `VIEW_1` |
| 8 | `app/types/interaction.ts` | Add `'DISPERSE'` to `ViewState` union |
| 9 | `app/plugins/projectSocket.client.ts` | Wire `onSelectImage` to the store handler; remove boot emission of `set-state('single')` when flag is on (project owns its own boot) |
| 10 | `app/components/views/View1Disperse.vue` | Keep file as legacy fallback. Render only when flag is off. Otherwise the route is dormant |
| 11 | Wherever the view switch lives | When flag is on: skip VIEW-1, start in DISPERSE state |

---

## CLAUDE.md update

- Add new section: **DISPERSE — entry phase** describing the new flow.
- Mark **VIEW-1 — pre-selection interaction phase** as LEGACY (kept for
  rollback).
- Update the state table: add `select-image(id)` reverse verb; replace
  "first VIEW-1 click" row with "disperse canvas click."
- Drop the "`interface_nuxt` deliberately never emits disperse" line (still
  factually true under new flow: project enters disperse on its own, no
  wire needed).
- Add a one-liner: **wire is now bidirectional**; reverse-direction verbs
  reserved for direct user input on project's canvas.

---

## Out of scope (explicit)

- No change to VIEW-2, VIEW-3, relations, path rendering, mask, canvas-bg.
- No change to atlas builder.
- No change to relation components or AtlasThumb (still used in VIEW-3).
- No new server code.

---

## Order of work — each step independently testable

1. **Project: picking** — add `pickAt` + `pointermove` highlight + console
   log the picked id on click. **Test:** open project, see hover glow, see
   id in console on click.
2. **Project: emit `select-image`** — replace console.log with
   `emitSelectImage(id)`. **Test:** see
   `[relay] project -> interface select-image` in server logs.
3. **Project: boot directly into disperse** (behind flag). **Test:** open
   project, it auto-disperses.
4. **Interface: receive + dispatch** — `onSelectImage` in plugin, new
   `onSelectImage` action in store. **Test:** click in project → interface
   receives → store advances to VIEW-2 → mask/state/focus emissions fire
   as today.
5. **Interface: add DISPERSE view state + skip VIEW-1 router entry** behind
   flag. **Test:** opening interface_nuxt shows no VIEW-1, lands in
   waiting/DISPERSE state.
6. **CLAUDE.md update.**
7. **Verification pass:** end-to-end with flag on; flip flag off, verify
   legacy path still works identically.

---

## Open questions — confirm before starting

1. **Flag default at first commit** — `true` (new system on) or `false`
   (off, manually flipped)? Recommendation: ship at `true` so end-to-end
   validation happens immediately.
2. **Project's boot behavior with flag OFF** — today it presumably boots
   into the state interface tells it (`single`). Should that stay literally
   identical (no project-side flag check), or should project also gate on
   the flag? Recommendation: project gates on flag for symmetry, otherwise
   rollback is incomplete.
3. **Where does the view router live in Nuxt?** Need to locate the page /
   component that decides VIEW-1 vs VIEW-2 vs VIEW-3 rendering before
   wiring the skip-VIEW-1 logic.
4. **Naming**: new view state called `'DISPERSE'` or `'PRE_SELECTION'`?
   Mostly cosmetic.
5. **Should the legacy VIEW-1 Nuxt page still fetch /api/mapping when flag
   is off?** Today it does. Keep as-is unless instructed otherwise.
