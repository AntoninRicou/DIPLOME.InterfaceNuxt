<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import CentralImage from '~/components/CentralImage.vue'
import ProximityPanel from '~/components/ProximityPanel.vue'
import RelationComponent from '~/components/relations/RelationComponent.vue'
import SkipButton from '~/components/SkipButton.vue'
import { type View3ComponentId } from '~/view3/view3Interpretations'
import { VIEW3_PANEL_MS, ROTATE_FADE_OUT_MS } from '~/utils/rotateText'

const store = useInteractionStore()

// Canvas index ↔ quadrant mapping matches project's stateManager STATES.split.rects:
//   0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right
// Each quadrant's title + body content is sourced from `view3Interpretations`
// (keyed by `componentId`), so VIEW_3 and VIEW_4 share a single content
// source — no duplication.
interface Quadrant {
  index: number
  x: string
  y: string
  componentId: View3ComponentId
}
const QUADRANTS: Quadrant[] = [
  { index: 0, x: '25%', y: '25%', componentId: 'component_1' },
  { index: 1, x: '75%', y: '25%', componentId: 'component_2' },
  { index: 2, x: '25%', y: '75%', componentId: 'component_3' },
  { index: 3, x: '75%', y: '75%', componentId: 'component_4' },
]

// After the last quadrant is activated (`allCanvasesZoomed` flips true), wait
// CAPTION_DELAY_MS, then the START_ACTION prompt ("Click on your image…") +
// central-image pulse appear. (The map-view/action-view narration now plays
// BEFORE the quadrants — in onMounted, after "You picked this image." — not
// here.) The quadrant texts stay visible until the central-image click.
const CAPTION_DELAY_MS = 2000
// Middle NARRATION shown after zooming (mirrored to project). Uses the shared
// rotate-text params (--rotate-size + fade timing + blue-grey stroke), same as
// the rotating intro narration — see `.modes-caption` styles.
const MODES_CAPTION = '	This action-view display images on where you can explore next.'
// CALL-TO-ACTION sentences (interface-only) — now rendered as CENTRED rotate
// text (the .modes-caption style), the 1st and 3rd of a 3-sentence sequence
// with MODES_CAPTION in between. ZOOM_ACTION appears after the initial settle
// beat (with the crosses) and HOLDS until all four quadrants are zoomed;
// START_ACTION appears after the middle caption and HOLDS until the user clicks
// the central image into the relational view.
// PICKED — a short intro sentence shown FIRST (after the settle beat), before
// ZOOM_ACTION. Same fade-in + settle delay as ZOOM_ACTION (the `.modes-caption`
// style + `--rotate-appear-delay`). It holds PICKED_HOLD_MS, fades out, and only
// THEN does ZOOM_ACTION appear + the crosses arm (activation possible).
const PICKED_TEXT = 'You picked this image.'
const showPickedCaption = ref(false)
const PICKED_HOLD_MS = 4000
let pickedHoldTimer: ReturnType<typeof setTimeout> | null = null
let pickedAfterTimer: ReturnType<typeof setTimeout> | null = null
// CONNECT — a short sentence shown AFTER the action-view (MODES) caption and
// BEFORE ZOOM_ACTION, linking the two screens.
const CONNECT_TEXT = 'Both views are directly connected.'
const showConnectCaption = ref(false)
const CONNECT_HOLD_MS = 4000
let connectShowTimer: ReturnType<typeof setTimeout> | null = null
let connectHoldTimer: ReturnType<typeof setTimeout> | null = null
const ZOOM_ACTION = 'Activate the four quadrants across both screens.'
// MIRROR sentence — a transient rotate caption shown AFTER the modes caption
// and BEFORE the start prompt. FEEDBACK (project) centre ONLY (mirrored via
// set-center-caption), with the INTERFACE darkened while it plays — no
// interface text for this one.
const MIRROR_CAPTION = 'This map-view provides a trace of images you encounter.'
const MIRROR_DIM_LEVEL = 0.7 // interface darkening while the MIRROR caption plays on the feedback
const START_ACTION = 'Click on your image to start.'
const showZoomAction = ref(false)
const showStartAction = ref(false)
// Full-opacity hold for the MIRROR sentence (~7s). The `.modes-caption` fade-in
// eats ROTATE_FADE_OUT_MS, which is added on top so the on-screen hold is ~7s.
const MIRROR_HOLD_MS = 7000 + ROTATE_FADE_OUT_MS
let mirrorShowTimer: ReturnType<typeof setTimeout> | null = null
let mirrorHoldTimer: ReturnType<typeof setTimeout> | null = null
let mirrorClearTimer: ReturnType<typeof setTimeout> | null = null

// ── Central-image click (VIEW_3 → VIEW_4 trigger) ──
// The advance `+` is gone from VIEW_3 (the top cross only lives in VIEW_4 now).
// Once the start prompt shows, the central image is the click target (it
// pulses blue). Clicking it simply fades the four quadrant texts out —
// SIMULTANEOUSLY on the interface (`.quadrant-text.dissolving`) and on the
// project canvases (`clearCanvasTexts()` → `set-canvas-text(i, '', '')`) — then
// enterRelationalView fires. There is NO cell flash/dissolve anymore: the
// suggestion images stay at their latent opacity and carry into VIEW_4. The
// central image + corner labels are untouched and carry over too.
const dissolving = ref(false)
const advancing = ref(false)
let dissolveTimer: ReturnType<typeof setTimeout> | null = null
// Lead gaps around the MIRROR caption (see the watch below):
//  - MIRROR_LEAD_MS: after the quadrant texts dissolve + the interface darkens
//    (both at once), wait this long before the MIRROR caption shows on feedback.
//  - START_LEAD_MS: after the interface brightens back up, wait this long before
//    the START_ACTION prompt shows on the interface.
const MIRROR_LEAD_MS = 3000
// Gap after the interface brightens (post map-view) before the "This action-view…"
// MODES caption appears on the interface. (+1s → 3000.)
const START_LEAD_MS = 3000
function onCenterClick() {
  // Armed only while the start prompt is up; ignore re-clicks once advancing.
  if (!showStartAction.value || advancing.value) return
  advancing.value = true
  showStartAction.value = false      // hide prompt + stop the central pulse + disarm
  // NOW fade the quadrant texts out — on BOTH screens, same beat: interface
  // `.quadrant-text.dissolving` (500ms ease) + project `.canvas-text` via
  // clearCanvasTexts(). They stayed visible through the whole rotate sequence.
  dissolving.value = true
  store.clearCanvasTexts()
  dissolveTimer = setTimeout(() => {
    store.enterRelationalView('skip')
  }, ROTATE_FADE_OUT_MS)
}

// "Next" skip button — jumps straight to the relational view (VIEW_4),
// bypassing the four quadrant-cross zooms + the modes-caption. No
// flash/dissolve animation: it advances immediately via enterRelationalView,
// which flips project to `split` and reveals the corner labels (see the
// all-on re-assert inside enterRelationalView). It ALSO bypasses VIEW_4's
// two-sentence entry narration (bypassRelationalIntro) so the user lands
// directly in the interactive relational view with selection unlocked.
function skipToRelational() {
  store.bypassRelationalIntro = true
  store.enterRelationalView('skip')
}

// ── Reach-to-zoom (replaces cross-click) ──
// The quadrant is zoomed by REACHING it with the cursor (mouseenter on the
// quadrant's hover zone), not by clicking its cross. Gated on `crossesReady`
// (the settle beat) and idempotent via `zoomCanvas` (the `canvasZoomed[i]`
// guard short-circuits a re-entered quadrant). The `+` cross stays as a
// non-interactive marker at each quadrant centre.
function onQuadrantReach(index: number) {
  if (!crossesReady.value) return
  store.zoomCanvas(index)
}
// Each quadrant's hover zone covers its quarter of the viewport, derived from
// the quadrant's centre (x/y): 25% → flush to the top/left edge, 75% → the
// far half.
function zoneStyle(q: Quadrant): Record<string, string> {
  return {
    left: q.x === '25%' ? '0' : '50%',
    top: q.y === '25%' ? '0' : '50%',
  }
}

// Corner labels appear at the four viewport corners at the same screen
// positions VIEW_4's RelationComponent corner labels occupy, so the swap
// between VIEW_3 → VIEW_4 reads as a continuation, not a new layer. Each
// label is revealed PER-QUADRANT the moment that quadrant's cross is clicked
// (gated on store.canvasZoomed[index]) — matching the project-side
// `set-corner-label(index, true)` emitted by store.zoomCanvas, so both
// screens announce each label together rather than all four at once.
const CORNERS = [
  { position: 'tl', name: 'Source', index: 0 },
  { position: 'tr', name: 'Form', index: 1 },
  { position: 'bl', name: 'Semantic', index: 2 },
  { position: 'br', name: 'Time', index: 3 },
] as const

// The VIEW_3 entry intro caption ("This image has been selected.") was REMOVED
// — VIEW_3 no longer shows a rotating intro sentence after the VIEW_2
// selection. The four quadrant crosses + the ZOOM_ACTION prompt now appear
// directly after a short settle beat (see onMounted), without an intro to read
// first.

// The 4 quadrant crosses are NOT clickable until a short settle beat after
// mount (the shared `--rotate-appear-delay`), so the view doesn't snap the
// crosses in abruptly. Flipped true by `crossesReadyTimer` in onMounted.
const crossesReady = ref(false)
let crossesReadyTimer: ReturnType<typeof setTimeout> | null = null

// Middle modes-caption NARRATION. Like any rotate-text sentence it fades in,
// HOLDS (one rotate panel), then fades OUT over --rotate-fade-ms — after which
// the advance `+` (top cross) + the bottom start prompt appear.
const showModesCaption = ref(false)
// How long the "This action-view…" caption holds at full opacity — a full
// standard rotate panel (was VIEW3_PANEL_MS − 1s; +1s now).
const MODES_HOLD_MS = VIEW3_PANEL_MS
let captionTimer: ReturnType<typeof setTimeout> | null = null
let modesHoldTimer: ReturnType<typeof setTimeout> | null = null
let modesAfterTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (captionTimer) { clearTimeout(captionTimer); captionTimer = null }
  if (modesHoldTimer) { clearTimeout(modesHoldTimer); modesHoldTimer = null }
  if (modesAfterTimer) { clearTimeout(modesAfterTimer); modesAfterTimer = null }
  if (mirrorShowTimer) { clearTimeout(mirrorShowTimer); mirrorShowTimer = null }
  if (mirrorHoldTimer) { clearTimeout(mirrorHoldTimer); mirrorHoldTimer = null }
  if (mirrorClearTimer) { clearTimeout(mirrorClearTimer); mirrorClearTimer = null }
  if (dissolveTimer) { clearTimeout(dissolveTimer); dissolveTimer = null }
  if (crossesReadyTimer) { clearTimeout(crossesReadyTimer); crossesReadyTimer = null }
  if (pickedHoldTimer) { clearTimeout(pickedHoldTimer); pickedHoldTimer = null }
  if (pickedAfterTimer) { clearTimeout(pickedAfterTimer); pickedAfterTimer = null }
  if (connectShowTimer) { clearTimeout(connectShowTimer); connectShowTimer = null }
  if (connectHoldTimer) { clearTimeout(connectHoldTimer); connectHoldTimer = null }
}

// Reads a CSS custom property as milliseconds. Falls back to 0 if the
// value is missing or unparseable.
function readMsVar(name: string): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (v.endsWith('ms')) return parseFloat(v)
  if (v.endsWith('s')) return parseFloat(v) * 1000
  return parseFloat(v) || 0
}

onMounted(() => {
  // No intro caption anymore — after a short settle beat (the shared
  // `--rotate-appear-delay`, so the crosses don't snap in the instant the
  // view mounts) reveal the four quadrant crosses + the ZOOM_ACTION rotate
  // sentence (1st of the centred 3-sentence sequence) together. The view
  // doesn't auto-advance — progress is user-driven via the crosses.
  const appearDelayMs = readMsVar('--rotate-appear-delay')
  crossesReadyTimer = setTimeout(() => {
    // 1) "You picked this image." drifts in, holds, fades.
    showPickedCaption.value = true
    crossesReadyTimer = null
    pickedHoldTimer = setTimeout(() => {
      showPickedCaption.value = false   // PICKED fades out
      // 2) After PICKED fades: darken the interface + "This map-view…" on the
      // FEEDBACK centre, then brighten + "This action view…" (MODES) on the
      // INTERFACE — the whole narration plays BEFORE the quadrants can be
      // activated.
      pickedAfterTimer = setTimeout(() => {
        store.setInterfaceDim(MIRROR_DIM_LEVEL)
        mirrorShowTimer = setTimeout(() => {
          store.setCenterCaption(MIRROR_CAPTION, 'rotate')   // feedback "map view"
          mirrorHoldTimer = setTimeout(() => {
            store.setCenterCaption('')   // clear the feedback caption
            store.setInterfaceDim(0)     // brighten the interface back up
            mirrorClearTimer = setTimeout(() => {
              showModesCaption.value = true   // interface "action view"
              modesHoldTimer = setTimeout(() => {
                showModesCaption.value = false
                // 3) "Both maps are directly connected." after the action-view fades.
                connectShowTimer = setTimeout(() => {
                  showConnectCaption.value = true
                  connectHoldTimer = setTimeout(() => {
                    showConnectCaption.value = false
                    // 4) THEN: "Activate the four quadrants…" appears + the crosses
                    // arm, so the user can now reach into the quadrants.
                    modesAfterTimer = setTimeout(() => {
                      showZoomAction.value = true
                      crossesReady.value = true
                    }, ROTATE_FADE_OUT_MS + 1000)
                  }, CONNECT_HOLD_MS)
                }, ROTATE_FADE_OUT_MS + 1000)
              }, MODES_HOLD_MS)
            }, START_LEAD_MS)
          }, MIRROR_HOLD_MS)
        }, MIRROR_LEAD_MS)
      }, ROTATE_FADE_OUT_MS)
    }, PICKED_HOLD_MS)
  }, appearDelayMs)
})

watch(() => store.allCanvasesZoomed, (zoomed) => {
  if (!zoomed) return
  // 4) User activated all 4 quadrants → fade ZOOM_ACTION out, then 5) reveal the
  // START_ACTION prompt + central-image pulse (which persist until the user
  // clicks the central image into VIEW_4). The quadrant texts STAY until that
  // click, when onCenterClick dissolves them.
  showZoomAction.value = false
  captionTimer = setTimeout(() => {
    showStartAction.value = true
  }, CAPTION_DELAY_MS)
})

onBeforeUnmount(() => {
  clearTimers()
  // If the view leaves mid-MIRROR (e.g. skip), don't carry its feedback caption
  // or the interface darkening into VIEW_4.
  store.setCenterCaption('')
  store.setInterfaceDim(0, { instant: true })
})
</script>

<template>
  <section class="view-2 bg-gradient">
    <!-- Per-quadrant suggestion-image preview. Same four RelationComponents
         VIEW_4 renders, in `preview` mode: non-interactive, each quadrant's
         cells revealed (clockwise) only once its cross is clicked
         (canvasZoomed[i]), staying visible afterward. Sits behind the
         quadrant text (z below .quadrant-text). The VIEW_3 → VIEW_4 cross-fade
         blends these into VIEW_4's (latent) cells with no re-sweep. -->
    <div class="grid">
      <RelationComponent component-id="component_1" label="Source" position="tl" preview />
      <RelationComponent component-id="component_2" label="Form" position="tr" preview />
      <RelationComponent component-id="component_3" label="Semantic" position="bl" preview />
      <RelationComponent component-id="component_4" label="Time" position="br" preview />
    </div>

    <span
      v-for="c in CORNERS"
      :key="c.position"
      class="corner-label"
      :class="{ visible: store.canvasZoomed[c.index] }"
      :data-position="c.position"
    >
      {{ c.name }}
    </span>

    <template v-for="q in QUADRANTS" :key="q.index">
      <!-- Reach zone: entering this quadrant with the cursor zooms its canvas
           (replaces clicking the cross). Covers the quarter; transparent. -->
      <div
        class="quadrant-zone"
        :style="zoneStyle(q)"
        @mouseenter="onQuadrantReach(q.index)"
      />
      <!-- Cross is now a non-interactive marker (pointer-events: none) at the
           quadrant centre — it shows/glows where to reach and fades when zoomed. -->
      <div
        class="cross-button cross-quadrant"
        :class="{ faded: store.canvasZoomed[q.index], pending: !crossesReady }"
        :style="{ left: q.x, top: q.y }"
        aria-hidden="true"
      >
        +
      </div>
      <ProximityPanel
        class="quadrant-text"
        :class="{ visible: store.canvasZoomed[q.index], dissolving }"
        :style="{ left: q.x, top: q.y }"
        :component-id="q.componentId"
      />
    </template>

    <div
      class="central-slot"
      :class="{ clickable: showStartAction }"
      @click="onCenterClick"
    >
      <CentralImage :ids="store.centralStack" :active-index="store.centralStackActiveIndex" source="original" />
    </div>

    <!-- (The VIEW_3 entry intro caption "This image has been selected." was
         removed — VIEW_3 no longer shows a rotating intro after VIEW_2.) -->

    <!-- Centred 3-sentence rotate-text sequence — all in the .modes-caption
         style, dead-centre over the central image (pointer-events:none, so
         clicks pass through to the central slot). Only one is visible at a time:
           1) ZOOM_ACTION  — from mount, HOLDS until all four quadrants zoom;
           2) MODES_CAPTION — transient middle beat (the ONLY one mirrored to
              the project centre caption);
           3) START_ACTION  — HOLDS until the central image is clicked (advance).
         Sequencing is driven by the showZoomAction/showModesCaption/
         showStartAction flags in the allCanvasesZoomed watch. -->
    <p class="modes-caption" :class="{ visible: showPickedCaption }">
      <span class="caption-text">{{ PICKED_TEXT }}</span>
    </p>
    <p class="modes-caption" :class="{ visible: showZoomAction }">
      <span class="caption-text">{{ ZOOM_ACTION }}</span>
    </p>
    <p class="modes-caption" :class="{ visible: showModesCaption }">
      <span class="caption-text">{{ MODES_CAPTION }}</span>
    </p>
    <p class="modes-caption" :class="{ visible: showConnectCaption }">
      <span class="caption-text">{{ CONNECT_TEXT }}</span>
    </p>
    <!-- (MIRROR sentence is FEEDBACK-only now — shown on the project centre
         caption with the interface darkened; no interface element here.) -->
    <p class="modes-caption" :class="{ visible: showStartAction }">
      <span class="caption-text">{{ START_ACTION }}</span>
    </p>

    <!-- Skip-to-relational button: jumps straight to VIEW_4, bypassing the
         four quadrant-cross zooms + the modes-caption. -->
    <SkipButton @click="skipToRelational" />
  </section>
</template>

<style scoped>
/* Backdrop comes from the global `.bg-gradient` class (app.vue) — same
   day gradient as VIEW-3 in gradient mode and as project. Hardcoded
   rather than bound to store.canvasBackground because VIEW-2 only ever
   shows once per session, before any toggle is reachable. */
.view-2 {
  position: fixed;
  inset: 0;
  color: #595b54;
  z-index: 100;
}

/* Grid cross — same shape as VIEW-1 / VIEW-2 / VIEW-4 so the structural
   seam stays continuous across the whole view chain. Static, fully drawn
   from mount; split into ::before / ::after pseudo-elements for future
   animation parity with View1Explanation. */
.view-2::before,
.view-2::after {
  content: "";
  position: absolute;
  background: rgba(166, 154, 128, 0.85);
  pointer-events: none;
  z-index: 5;
}
.view-2::before {
  left: 5%;
  right: 5%;
  top: 50%;
  height: 1px;
  margin-top: -0.5px;
}
.view-2::after {
  top: 5%;
  bottom: 5%;
  left: 50%;
  width: 1px;
  margin-left: -0.5px;
}

/* Corner labels — appearance + position come from the global
   `.corner-label` in app.vue (shared with VIEW_4). VIEW_3 reveals each one
   PER-QUADRANT, gated on `store.canvasZoomed[index]` (bound in the template),
   so a label fades + glows in the instant its quadrant's cross is clicked —
   in lockstep with the project-side `set-corner-label` emission. */
.corner-label {
  z-index: 11;
  opacity: 0;
  transition: opacity 600ms ease-out;
}
.corner-label.visible {
  /* Opacity-only fade-in (base `.corner-label` transition). The animated
     `corner-label-glow` swell was removed: it fired per quadrant in lockstep
     with project's, where animating the 6-layer / 340px text-shadow each
     frame janked the concurrent camera zoom. The static shadow (app.vue's
     global `.corner-label`) stays for legibility; the label just fades in. */
  opacity: 1;
}

/* Preview suggestion-image grid — mirrors VIEW_4's `.grid` so the four
   RelationComponents occupy the same 2×2 quadrants and the shared oval is
   centred identically (no positional jump across the VIEW_3 → VIEW_4 swap).
   Sits BEHIND the quadrant text (z: 14) and corner labels (z: 11) and around
   the central image (z: 10). No background — the gradient passes through. */
.grid {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  pointer-events: none;
}

/* Quadrant reach zones — four transparent quarters of the viewport. Entering
   one with the cursor (`@mouseenter`) zooms that quadrant's canvas (reach-to-
   zoom, replacing the cross click). Sit below the visual layers (which are all
   pointer-events: none during this phase) so the mouseenter reliably lands. */
.quadrant-zone {
  position: absolute;
  width: 50%;
  height: 50%;
  z-index: 8;
}

/* Cross — now a non-interactive `+` MARKER at each quadrant centre (the
   quadrant itself is the reach target). Same glyph + pulsing warm glow so it
   reads as "reach here"; pointer-events off so it never blocks the reach zone
   below it. */
.cross-button {
  position: absolute;
  background: transparent;
  border: none;
  width: 1.8rem;
  height: 1.8rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  line-height: 1;
  letter-spacing: 0;
  color: #595b54;
  pointer-events: none;
  transition: opacity 600ms ease-out, color 150ms ease-out;
  animation: cross-glow 1.8s ease-in-out infinite;
  z-index: 15;
}
/* Inert until the settle beat elapses (crossesReady false): hidden,
   non-interactive, and no attention glow. When crossesReady flips true the
   class drops and the crosses fade in via the base opacity transition. The
   `:disabled` attr is the belt-and-braces that actually blocks the click. */
.cross-button.pending {
  opacity: 0;
  pointer-events: none;
  animation: none;
}

/* Quadrant variant — positioned by inline style (q.x / q.y) and centred
   on that point. Visible from VIEW_3 mount; faded out once the canvas
   it represents has been zoomed. Non-interactive (the reach zone handles
   the hover) — pointer-events stays off from the base `.cross-button`. */
.cross-quadrant {
  transform: translate(-50%, -50%);
  opacity: 1;
}
.cross-quadrant.faded {
  opacity: 0;
}

/* Mode-of-proximity description, shown at the quadrant centre in place
   of the cross once that canvas is zoomed. Typography comes from the
   global `.proximity-panel` class in app.vue (shared with VIEW_4's
   interpretation panels); locally we only own positioning + the
   fade-in opacity gate. */
.quadrant-text {
  position: absolute;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 600ms ease-out 200ms;
  z-index: 14;
}
.quadrant-text.visible {
  opacity: 1;
}
/* Central-image-click dissolve: all four quadrant texts fade out TOGETHER on
   click (no cell flash anymore), using the same gentle `ease` fade as the
   view-level transitions (the cross-fade on the Next button / image-select —
   `350ms ease` in pages/index.vue — and the 500ms `ease` disperse exit in
   View2Disperse). Soft tail, not the sharper `--rotate-fade-easing`. Identical
   to the project canvas text (`.canvas-text`, cleared simultaneously via
   `clearCanvasTexts()`) so both screens lose the text at the same beat with the
   same curve. Wins over `.visible` by source order (both 0,2,0 specificity). */
.quadrant-text.dissolving {
  opacity: 0;
  transition: opacity 500ms ease;
}

/* Image anchored at true viewport centre so it sits exactly where VIEW-4's
   .center-anchor will land — no positional jump on transition. */
.central-slot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 22vmin;
  height: 22vmin;
  z-index: 10;
  /* Non-interactive during the reach phase so it doesn't block the quadrant
     reach zones where they meet at centre; `.clickable` re-enables it once the
     central image becomes the VIEW_3 → VIEW_4 trigger. */
  pointer-events: none;
}
/* Once the start prompt shows, the central image is the click target (the
   VIEW_3 → VIEW_4 trigger). It pulses a warm BEIGE drop-shadow glow (the cream
   #f9ecd0 used by the path/step glows) so it reads as "click me", fading fully
   in/out. Cleared the instant it's clicked (showStartAction → false). */
.central-slot.clickable {
  pointer-events: auto;
  cursor: pointer;
  animation: center-glow-beige 1.8s ease-in-out infinite;
}
@keyframes center-glow-beige {
  0%, 100% {
    filter:
      drop-shadow(0 0 0 rgba(249, 236, 208, 0))
      drop-shadow(0 0 0 rgba(249, 236, 208, 0))
      drop-shadow(0 0 0 rgba(249, 236, 208, 0));
  }
  50% {
    filter:
      drop-shadow(0 0 6px rgba(249, 236, 208, 0.7))
      drop-shadow(0 0 14px rgba(249, 236, 208, 0.4))
      drop-shadow(0 0 26px rgba(249, 236, 208, 0.22));
  }
}

/* Organic blue-grey stroke worn by the modes-caption (`.caption-text` span),
   so the modes line reads in the rotate-caption style. (The intro-caption that
   also used this was removed.) */
.caption-text {
  color: var(--rotate-fill);
  text-shadow:
    0 0 4px var(--rotate-stroke),
    0 0 6px var(--rotate-stroke),
    0 0 6px var(--rotate-stroke),
    0 0 9px var(--rotate-stroke),
    0 0 9px var(--rotate-stroke),
    0 0 12px var(--rotate-stroke),
    0 0 12px var(--rotate-stroke),
    0 0 15px var(--rotate-stroke),
    0 0 18px var(--rotate-stroke);
}

/* Modes caption — anchored at the viewport centre (50%/50%) and centred
   on that point via translate. Overlays the central image; z-index above
   the central slot. Behaves like a rotate-text sentence: fades IN via
   `showModesCaption` (1 s after the fourth cross), holds one rotate panel,
   then fades OUT over --rotate-fade-ms (the opacity transition below) before
   the advance `+` + start prompt appear. */
.modes-caption {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0 1rem;
  white-space: nowrap;
  text-align: center;
  /* Same rotate-caption style: --rotate-size + the organic stroke on the
     inner .caption-text span, and the shared rotate fade timing so it reveals
     like (and in sync with) the project mirror. */
  font-size: var(--rotate-size);
  line-height: var(--rotate-line-height);
  color: #595b54;
  pointer-events: none;
  z-index: 11;
  opacity: 0;
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing);
}
.modes-caption.visible {
  opacity: 1;
}
/* Multi-line variant — honours the explicit `\n` (the base rule is nowrap) so
   the MIRROR sentence breaks where written, each half centred. */
.modes-caption.multiline {
  white-space: pre-line;
}

/* Shared glow pulse — applied to every `.cross-button` (the four quadrant
   zoom crosses; the advance `+` was removed — the central image is the
   VIEW_3 → VIEW_4 trigger now).
   1.8s ease-in-out cycle; off at 0%/100%, full bloom at 50%. Five layered
   shadows with near-white inner core fanning out to ~150px reach the
   "click me" cue threshold even on bright backdrops. */
@keyframes cross-glow {
  0%, 100% {
    text-shadow: 0 0 0 rgba(255, 240, 200, 0);
  }
  50% {
    text-shadow:
      0 0 8px rgba(255, 245, 215, 1),
      0 0 20px rgba(252, 230, 180, 1),
      0 0 42px rgba(245, 215, 155, 1),
      0 0 80px rgba(238, 200, 135, 0.95),
      0 0 140px rgba(230, 188, 120, 0.85),
      0 0 220px rgba(220, 175, 105, 0.65);
  }
}

</style>
