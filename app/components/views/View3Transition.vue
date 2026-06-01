<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import CentralImage from '~/components/CentralImage.vue'
import ProximityPanel from '~/components/ProximityPanel.vue'
import { type View3ComponentId } from '~/view3/view3Interpretations'
import { ROTATE_PANEL_MS } from '~/utils/rotateText'

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
// modes caption and the four corner labels (Mirror/Trace/Shift/Replay,
// matching VIEW-4's RelationComponent quarter-tags) fade in 1s later.
// No auto-advance to VIEW_4 — the transition out of VIEW_3 is driven
// by the pulsing advance `+` button.
const CAPTION_DELAY_MS = 1000
const MODES_CAPTION = 'Four modes of proximity, each shaping relations differently with the center image.'

// Corner labels appear at the four viewport corners at the same screen
// positions VIEW-4's RelationComponent quarter-tags occupy, so the swap
// between VIEW_3 → VIEW_4 reads as a continuation, not a new layer.
const CORNERS = [
  { position: 'tl', name: 'Trace' },
  { position: 'tr', name: 'Mirror' },
  { position: 'bl', name: 'Shift' },
  { position: 'br', name: 'Replay' },
] as const

// Intro sentences shown at VIEW_3 entry — same cadence and styling as
// VIEW_1's explanation panels. Two sentences cycle every
// ROTATE_PANEL_MS; after the last sentence's display time the caption
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
const INTRO_PANELS = [
  'You selected one image from 4,993 fragments',
  'Click on the crosses to reveal new related images through different modes of proximity',
]
const INTRO_PANEL_MS = ROTATE_PANEL_MS
const introIndex = ref(0)
const introVisible = ref(false) // gated by setTimeout — see comment block
let introTimer: ReturnType<typeof setInterval> | null = null
let introFirstShowTimer: ReturnType<typeof setTimeout> | null = null

const showCaption = ref(false)
let captionTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (captionTimer) { clearTimeout(captionTimer); captionTimer = null }
  if (introTimer) { clearInterval(introTimer); introTimer = null }
  if (introFirstShowTimer) { clearTimeout(introFirstShowTimer); introFirstShowTimer = null }
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
      return
    }
    introIndex.value += 1
  }, INTRO_PANEL_MS)
})

watch(() => store.allCanvasesZoomed, (zoomed) => {
  if (!zoomed) return
  // User clicked all 4 crosses — hide intro (if still showing) and
  // schedule the modes-caption reveal.
  if (introTimer) { clearInterval(introTimer); introTimer = null }
  introVisible.value = false
  captionTimer = setTimeout(() => {
    showCaption.value = true
    // Mirror the centred modes-caption on the standalone project at the
    // same beat — both screens fade the sentence in together. The corner
    // labels (MIRROR/TRACE/SHIFT/REPLAY) are deferred to the top-cross
    // click — they reveal at the VIEW_3 → VIEW_4 advance moment, not
    // here, so the labels appear together with VIEW_4 mounting.
    store.setCenterCaption(MODES_CAPTION)
  }, CAPTION_DELAY_MS)
})

onBeforeUnmount(clearTimers)
</script>

<template>
  <section class="view-2 bg-gradient">
    <span
      v-for="c in CORNERS"
      :key="c.position"
      class="corner-label"
      :data-position="c.position"
    >
      {{ c.name }}
    </span>

    <template v-for="q in QUADRANTS" :key="q.index">
      <button
        class="cross-button cross-quadrant"
        :class="{ faded: store.canvasZoomed[q.index] }"
        :style="{ left: q.x, top: q.y }"
        :aria-label="`zoom canvas ${q.index + 1}`"
        @click="store.zoomCanvas(q.index)"
      >
        +
      </button>
      <ProximityPanel
        class="quadrant-text"
        :class="{ visible: store.canvasZoomed[q.index] }"
        :style="{ left: q.x, top: q.y }"
        :component-id="q.componentId"
      />
    </template>

    <div class="central-slot">
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
    <Transition name="intro" mode="out-in">
      <p
        v-if="introVisible"
        :key="introIndex"
        class="intro-caption"
      >
        {{ INTRO_PANELS[introIndex] }}
      </p>
    </Transition>

    <p class="modes-caption" :class="{ visible: showCaption }">
      {{ MODES_CAPTION }}
    </p>

    <button
      class="cross-button cross-advance"
      :class="{ visible: showCaption }"
      aria-label="continue to relational view"
      @click="store.enterRelationalView('skip')"
    >
      +
    </button>
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
   `.corner-label` in app.vue (shared with VIEW_4). VIEW_3 just gates
   visibility on `showCaption`, fading them in alongside the caption. */
.corner-label {
  z-index: 11;
  opacity: 0;
  transition: opacity 600ms ease-out;
}
.corner-label.visible { opacity: 1; }

/* Unified cross button — shared by the four quadrant zoom triggers and
   the top-centre advance control. Same `+` glyph and visual treatment
   as VIEW_4's `.interpret-control` (dark monospace on the gradient).
   Pulsing glow draws attention so each cross reads as a click target.
   Positional variants (.cross-quadrant / .cross-advance) below. */
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

/* Intro sentences — same typography + upper-centre placement as
   VIEW_1's `.caption`. Animation is driven by the Vue <Transition
   name="intro" mode="out-in" appear> wrapper in the template; the
   keyframe-based fade-in was replaced with the .intro-appear/-enter/
   -leave classes below for parity with View1Explanation's pattern. */
.intro-caption {
  position: absolute;
  top: 4vh;
  left: 50%;
  transform: translateX(-50%);
  /* One line per sentence: no wrap, width grows to the text (centred by
     the left:50% + translateX). */
  max-width: none;
  white-space: nowrap;
  margin: 0;
  padding: 0 1.5rem;
  font-size: var(--label-size);
  line-height: 1.3;
  text-align: center;
  color: #595b54;
  z-index: 12;
  pointer-events: none;
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
   the central slot so it sits on top of the picture. Fades in via the
   showCaption flag (1 s after the fourth quadrant cross is clicked). */
.modes-caption {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0 1rem;
  white-space: nowrap;
  text-align: center;
  font-size: 0.95rem;
  line-height: 1.4;
  color: #595b54;
  pointer-events: none;
  z-index: 11;
  opacity: 0;
  transition: opacity 600ms ease-out;
}
.modes-caption.visible {
  opacity: 1;
}

/* Advance variant — top-centre of the viewport, pixel-positioned
   identically to VIEW_4's `.interpret-control` (top: 0.22rem, aligned
   with the component titles) so the glyph stays put across the swap.
   Hidden + non-clickable until `.visible` (the modes caption fade-in
   trigger), then opacity fades in with a 500ms delay so the reveal
   cascades after the caption. */
.cross-advance {
  top: 0.22rem;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 600ms ease-out 500ms, color 150ms ease-out;
}
.cross-advance.visible {
  opacity: 1;
  pointer-events: auto;
}

/* Shared glow pulse — applied to every `.cross-button` (quadrant + advance).
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
