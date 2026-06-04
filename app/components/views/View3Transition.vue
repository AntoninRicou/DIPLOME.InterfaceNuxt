<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import CentralImage from '~/components/CentralImage.vue'
import ProximityPanel from '~/components/ProximityPanel.vue'
import RelationComponent from '~/components/relations/RelationComponent.vue'
import ActionPrompt from '~/components/ActionPrompt.vue'
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

// After the 4th cross is clicked (`allCanvasesZoomed` flips true), the
// modes caption (middle narration) fades in 1s later, then the bottom
// "start exploring" action prompt + the pulsing advance `+` button appear.
// No auto-advance to VIEW_4 — the transition out is driven by the `+`.
const CAPTION_DELAY_MS = 1000
// Middle NARRATION shown after zooming (mirrored to project). Uses the shared
// rotate-text params (--rotate-size + fade timing + blue-grey stroke), same as
// the rotating intro narration — see `.modes-caption` styles.
const MODES_CAPTION = 'Four modes of proximity each suggesting new images relationing differently with the center image'
// Bottom CALL-TO-ACTION prompts (interface-only, via ActionPrompt). The zoom
// prompt appears once the intro narration clears (crosses appear at that same
// moment) and hides when all four are zoomed; the start prompt appears with
// the modes caption and hides when the user clicks the advance `+` ("top
// cross") into the relational view.
const ZOOM_ACTION = 'Activate the four modes of proximity to start the journey.'
const START_ACTION = 'Click on the central image to start exploring.'
const showZoomAction = ref(false)
const showStartAction = ref(false)

// ── Central-image click (VIEW_3 → VIEW_4 trigger) ──
// The advance `+` is gone from VIEW_3 (the top cross only lives in VIEW_4 now).
// Once the start prompt shows, the central image is the click target (it
// pulses blue). Clicking it: (1) FLASHES every suggestion cell to full opacity
// behind the quadrant texts, then (2) sweeps them clockwise back DOWN to latent
// (preview-dissolve) while the four quadrant texts blink out clockwise — then
// enterRelationalView fires. The central image + corner labels are untouched
// and carry into VIEW_4.
const flashing = ref(false)
const dissolving = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null
let dissolveTimer: ReturnType<typeof setTimeout> | null = null
const FLASH_MS = 400                 // cells jump to full opacity
const FLASH_HOLD_MS = 250            // brief hold at full before the clockwise reduce
const DISSOLVE_SWEEP_MS = 5000       // matches RelationComponent PREVIEW_DISSOLVE_SWEEP_MS
const DISSOLVE_TAIL_MS = 700         // per-element fade tail + small buffer (last cell finishes ~sweep + 600ms fade)
// Clockwise position (from 12 o'clock) of each quadrant centre → fraction of
// the sweep, so quadrant texts blink out clockwise tr → br → bl → tl, aligned
// with the cell sweep. Keyed by QUADRANTS index (0=tl,1=tr,2=bl,3=br).
const QUADRANT_CW_FRACTION: Record<number, number> = { 0: 0.875, 1: 0.125, 2: 0.625, 3: 0.375 }
// Same smooth ease-in-out HAND motion as the cell sweep (RelationComponent's
// sweepDelayFraction) so both accelerate through the middle and decelerate to
// the end in lockstep — inverse of an ease-in-out, no mid-sweep bunching.
function sweepDelayFraction(f: number): number {
  return f < 0.5 ? Math.cbrt(f / 4) : 1 - Math.cbrt(2 * (1 - f)) / 2
}
function quadrantDissolveDelay(index: number): string {
  return `${Math.round(sweepDelayFraction(QUADRANT_CW_FRACTION[index] ?? 0) * DISSOLVE_SWEEP_MS)}ms`
}
function onCenterClick() {
  // Armed only while the start prompt is up; ignore re-clicks once it begins.
  if (!showStartAction.value || flashing.value) return
  showStartAction.value = false      // hide prompt + stop the central pulse + disarm
  flashing.value = true              // cells flash to full opacity
  flashTimer = setTimeout(() => {
    dissolving.value = true          // clockwise reduce back to latent + quadrant texts blink out
    dissolveTimer = setTimeout(() => {
      store.enterRelationalView('skip')
    }, DISSOLVE_SWEEP_MS + DISSOLVE_TAIL_MS)
  }, FLASH_MS + FLASH_HOLD_MS)
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
  { position: 'br', name: 'Collaborative', index: 3 },
] as const

// Intro sentences shown at VIEW_3 entry — same styling as VIEW_1's
// explanation panels (the hold differs per view now: VIEW3_PANEL_MS).
// Each sentence cycles every INTRO_PANEL_MS; after the last sentence's display time the caption
// auto-fades out (mirrors VIEW_1's last-sentence behaviour) so the
// viewport clears the way for the cross clicks. The view itself
// doesn't auto-advance — that's user-driven via the 4 quadrant
// crosses.
//
// VIEW_3 uses the same JS-gated first-render workaround as VIEW_2 for
// the initial appear delay: Vue's `<Transition appear>` was firing
// before `--rotate-appear-delay` could register (the many child
// elements mounting simultaneously — corner labels, quadrant crosses,
// proximity panels, central image — caused a similar reflow race as
// VIEW_2's iframe load). `introVisible` is gated by a setTimeout in
// onMounted; the leave path is shared between the timer-driven
// last-sentence fade-out AND the cross-click trigger.
// Narration only — rotates in the middle (mirrored to project). The closing
// "Zoom in the four modes…" line is no longer a rotating panel: it is the
// persistent bottom ZOOM_ACTION prompt shown once this narration clears.
const INTRO_PANELS = [
  'This image has been selected.',
]
const INTRO_PANEL_MS = VIEW3_PANEL_MS
const introIndex = ref(0)
const introVisible = ref(false) // gated by setTimeout — see comment block
let introTimer: ReturnType<typeof setInterval> | null = null
let introFirstShowTimer: ReturnType<typeof setTimeout> | null = null

// The 4 quadrant crosses are NOT clickable until the rotating intro text has
// fully finished — so the user reads the intro before zooming. LINKED to the
// rotation, not a parallel timer: flips true from inside the same
// last-sentence branch of `introTimer` (below), delayed by the shared
// ROTATE_FADE_OUT_MS so it lands exactly when the last sentence has faded
// out. Change VIEW3_PANEL_MS / INTRO_PANELS and this moves with them.
const crossesReady = ref(false)
let crossesReadyTimer: ReturnType<typeof setTimeout> | null = null

// Middle modes-caption NARRATION. Like any rotate-text sentence it fades in,
// HOLDS (one rotate panel), then fades OUT over --rotate-fade-ms — after which
// the advance `+` (top cross) + the bottom start prompt appear.
const showModesCaption = ref(false)
let captionTimer: ReturnType<typeof setTimeout> | null = null
let modesHoldTimer: ReturnType<typeof setTimeout> | null = null
let modesAfterTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (captionTimer) { clearTimeout(captionTimer); captionTimer = null }
  if (modesHoldTimer) { clearTimeout(modesHoldTimer); modesHoldTimer = null }
  if (modesAfterTimer) { clearTimeout(modesAfterTimer); modesAfterTimer = null }
  if (flashTimer) { clearTimeout(flashTimer); flashTimer = null }
  if (dissolveTimer) { clearTimeout(dissolveTimer); dissolveTimer = null }
  if (introTimer) { clearInterval(introTimer); introTimer = null }
  if (introFirstShowTimer) { clearTimeout(introFirstShowTimer); introFirstShowTimer = null }
  if (crossesReadyTimer) { clearTimeout(crossesReadyTimer); crossesReadyTimer = null }
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
  // First-render delay (replaces Vue Transition's `appear` for this
  // view — see top-of-file comment block). Once introVisible flips
  // true, Vue Transition's enter-active class adds its own
  // `--rotate-empty-beat` delay before the 500ms fade. Subtract that
  // from the appear-delay target so the total elapsed time from mount
  // to first sentence visible matches VIEW_1 exactly.
  const appearDelayMs = readMsVar('--rotate-appear-delay')
  const emptyBeatMs = readMsVar('--rotate-empty-beat')
  const firstShowWait = Math.max(0, appearDelayMs - emptyBeatMs)
  introFirstShowTimer = setTimeout(() => {
    introVisible.value = true
    introFirstShowTimer = null
  }, firstShowWait)
  introTimer = setInterval(() => {
    if (introIndex.value >= INTRO_PANELS.length - 1) {
      // Last sentence reached — fire its fade-out at this tick so it
      // displays for one full PANEL_MS at the tip then leaves, same
      // tick-rhythm as VIEW_1's advance(). View doesn't advance with
      // it; introVisible just hides the caption, the user still
      // clicks the 4 quadrant crosses to progress.
      if (introTimer) { clearInterval(introTimer); introTimer = null }
      introVisible.value = false
      // Once the narration has fully faded out (ROTATE_FADE_OUT_MS = the
      // leave-fade duration): reveal the bottom ZOOM_ACTION prompt AND open
      // the quadrant crosses at the SAME moment — the crosses appear exactly
      // when "Zoom in the four modes…" appears.
      crossesReadyTimer = setTimeout(() => {
        crossesReady.value = true
        showZoomAction.value = true
        crossesReadyTimer = null
      }, ROTATE_FADE_OUT_MS)
      return
    }
    introIndex.value += 1
  }, INTRO_PANEL_MS)
})

watch(() => store.allCanvasesZoomed, (zoomed) => {
  if (!zoomed) return
  // User clicked all 4 crosses — the zoom action is done: hide its bottom
  // prompt (and the intro, if somehow still showing), then schedule the
  // modes-caption reveal.
  if (introTimer) { clearInterval(introTimer); introTimer = null }
  introVisible.value = false
  showZoomAction.value = false
  captionTimer = setTimeout(() => {
    showModesCaption.value = true
    // Mirror the centred modes-caption (middle NARRATION) on the standalone
    // project at the same beat — both screens fade the sentence in together.
    // (Corner labels are NOT revealed here — they reveal per-quadrant on each
    // cross click, both screens; see CORNERS + store.zoomCanvas.)
    store.setCenterCaption(MODES_CAPTION, 'rotate')
    // Hold one rotate panel, then fade the narration OUT (over --rotate-fade-ms)
    // on BOTH screens — exactly like any rotate-text sentence.
    modesHoldTimer = setTimeout(() => {
      showModesCaption.value = false
      store.setCenterCaption('')
      // (hold = VIEW3_PANEL_MS, same as the intro narration)
      // Once it has faded out, reveal the advance `+` (top cross) and the
      // bottom "Click on the top cross…" action prompt together (interface-
      // only). They persist until the user clicks `+` into the relational view.
      modesAfterTimer = setTimeout(() => { showStartAction.value = true }, ROTATE_FADE_OUT_MS)
    }, VIEW3_PANEL_MS)
  }, CAPTION_DELAY_MS)
})

// Mirror the rotating intro caption onto the project canvas (the feedback
// screen) so both screens fade in/out SIMULTANEOUSLY. Driven by the caption's
// own <Transition> enter/leave hooks (not a watch), so the project emission
// fires at the exact moment the interface caption begins each fade; project's
// `#center-caption.rotate` uses the matching `--rotate-*` timing. The intro
// clears (leave) before the crosses are clicked, so it never overlaps the
// later modes-caption (default variant). Project is in `overview` here.
function onCaptionEnter() {
  store.setCenterCaption(INTRO_PANELS[introIndex.value] ?? '', 'rotate')
}
function onCaptionLeave() {
  store.setCenterCaption('', 'rotate')
}

onBeforeUnmount(clearTimers)
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
      <RelationComponent component-id="component_1" label="Source" position="tl" preview :flashing="flashing" :dissolving="dissolving" />
      <RelationComponent component-id="component_2" label="Form" position="tr" preview :flashing="flashing" :dissolving="dissolving" />
      <RelationComponent component-id="component_3" label="Semantic" position="bl" preview :flashing="flashing" :dissolving="dissolving" />
      <RelationComponent component-id="component_4" label="Collaborative" position="br" preview :flashing="flashing" :dissolving="dissolving" />
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
      <button
        class="cross-button cross-quadrant"
        :class="{ faded: store.canvasZoomed[q.index], pending: !crossesReady }"
        :style="{ left: q.x, top: q.y }"
        :aria-label="`zoom canvas ${q.index + 1}`"
        :disabled="!crossesReady"
        @click="store.zoomCanvas(q.index)"
      >
        +
      </button>
      <ProximityPanel
        class="quadrant-text"
        :class="{ visible: store.canvasZoomed[q.index], dissolving }"
        :style="{ left: q.x, top: q.y, '--dissolve-delay': quadrantDissolveDelay(q.index) }"
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

    <!-- Same shared `--rotate-*` vars and Vue <Transition> shape as
         View1Explanation / View2Disperse, with no `appear`: the first
         render is gated by `introVisible` (flipped true by the
         appear-delay setTimeout in onMounted). The leave fires from
         either path: timer-driven (introVisible flipped false after
         the last sentence's display time) OR cross-click-driven
         (watch on store.allCanvasesZoomed also sets introVisible
         false). See top-of-file comment block. -->
    <Transition name="intro" mode="out-in" @enter="onCaptionEnter" @leave="onCaptionLeave">
      <p
        v-if="introVisible"
        :key="introIndex"
        class="intro-caption"
      >
        <span class="caption-text">{{ INTRO_PANELS[introIndex] }}</span>
      </p>
    </Transition>

    <p class="modes-caption" :class="{ visible: showModesCaption }">
      <span class="caption-text">{{ MODES_CAPTION }}</span>
    </p>

    <!-- Bottom call-to-action prompts (interface-only, not mirrored). The zoom
         prompt appears when the intro narration clears (crosses appear with
         it) and hides when all four are zoomed; the start prompt appears just
         after the modes caption and persists until the advance `+` is clicked
         (VIEW_3 then unmounts). Only one is ever visible at a time. -->
    <ActionPrompt :visible="showZoomAction" :text="ZOOM_ACTION" />
    <ActionPrompt :visible="showStartAction" :text="START_ACTION" />
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

/* Cross button — the four quadrant zoom triggers (.cross-quadrant). Same `+`
   glyph and visual treatment as VIEW_4's `.interpret-control` (dark monospace
   on the gradient), with a pulsing warm glow so each reads as a click target.
   (The advance `+` was removed — the central image is the VIEW_3 → VIEW_4
   trigger now.) */
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
  cursor: pointer;
  transition: opacity 600ms ease-out, color 150ms ease-out;
  animation: cross-glow 1.8s ease-in-out infinite;
  z-index: 15;
}
.cross-button:hover {
  color: #2a2e36;
}
/* Inert until the intro text finishes (crossesReady false): hidden,
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
   it represents has been zoomed. */
.cross-quadrant {
  transform: translate(-50%, -50%);
  opacity: 1;
  pointer-events: auto;
}
.cross-quadrant.faded {
  opacity: 0;
  pointer-events: none;
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
/* Advance-`+` dissolve: each quadrant text blinks out with a per-quadrant
   --dissolve-delay (clockwise tr → br → bl → tl), in step with the cell
   sweep. Wins over `.visible` by source order (both 0,2,0 specificity). */
.quadrant-text.dissolving {
  opacity: 0;
  transition: opacity 220ms ease-out var(--dissolve-delay, 0ms);
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
}
/* Once the start prompt shows, the central image is the click target (the
   VIEW_3 → VIEW_4 trigger). It pulses a blue drop-shadow glow (same
   --rotate-panel-bg family as the prompts / quadrant text) so it reads as
   "click me", fading fully in/out. Cleared the instant it's clicked
   (showStartAction → false). */
.central-slot.clickable {
  pointer-events: auto;
  cursor: pointer;
  animation: center-glow-blue 1.8s ease-in-out infinite;
}
@keyframes center-glow-blue {
  0%, 100% {
    filter:
      drop-shadow(0 0 0 rgba(170, 180, 194, 0))
      drop-shadow(0 0 0 rgba(170, 180, 194, 0));
  }
  50% {
    filter:
      drop-shadow(0 0 10px rgba(170, 180, 194, 0.85))
      drop-shadow(0 0 26px rgba(170, 180, 194, 0.55));
  }
}

/* Intro sentences — same typography + upper-centre placement as
   VIEW_1's `.caption`. Animation is driven by the Vue <Transition
   name="intro" mode="out-in" appear> wrapper in the template; the
   keyframe-based fade-in was replaced with the .intro-appear/-enter/
   -leave classes below for parity with View1Explanation's pattern. */
.intro-caption {
  position: absolute;
  /* Centred in the viewport (was top: 4vh). Sits above the central image
     deck (z: 12 > center-anchor z: 10) for the brief intro overlay. */
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  /* One line per sentence: no wrap, width grows to the text (centred by
     the left:50% + translate). */
  max-width: none;
  white-space: nowrap;
  margin: 0;
  padding: 0;
  font-size: var(--rotate-size);
  line-height: 1.5;
  text-align: center;
  color: #595b54;
  z-index: 12;
  pointer-events: none;
}

/* Organic backing that traces the text glyphs (not a box) — layered
   text-shadow in the blue-grey panel colour hugs the letterforms, reading as
   a soft text-shaped stroke rather than a rectangle. Matches VIEW_1
   `.caption-text` / VIEW_2 `.entry-caption .caption-text`. */
/* Organic blue-grey stroke shared by the intro-caption AND the modes-caption
   (both wrap their text in `.caption-text`), so the modes line reads in the
   same rotate-caption style. */
.caption-text {
  text-shadow:
    0 0 4px var(--rotate-panel-bg),
    0 0 6px var(--rotate-panel-bg),
    0 0 6px var(--rotate-panel-bg),
    0 0 9px var(--rotate-panel-bg),
    0 0 9px var(--rotate-panel-bg),
    0 0 12px var(--rotate-panel-bg),
    0 0 12px var(--rotate-panel-bg),
    0 0 15px var(--rotate-panel-bg),
    0 0 18px var(--rotate-panel-bg);
}

/* Vue <Transition name="intro"> CSS hooks — opacity-only fades using
   the shared --rotate-* custom properties in app.vue's :root so this
   caption animates identically to View1's `.caption` and View2's
   `.entry-caption`. No `appear-*` rules: VIEW_3 gates its first
   render via JS (setTimeout in onMounted) for the same reason as
   VIEW_2 — see the comment block at the top of <script setup>. */
.intro-enter-active {
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing) var(--rotate-empty-beat);
}
.intro-enter-from {
  opacity: 0;
}
.intro-leave-active {
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing);
}
.intro-leave-to {
  opacity: 0;
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
  line-height: 1.4;
  color: #595b54;
  pointer-events: none;
  z-index: 11;
  opacity: 0;
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing);
}
.modes-caption.visible {
  opacity: 1;
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
