<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import SkipButton from '~/components/SkipButton.vue'
import { ROTATE_FADE_OUT_MS } from '~/utils/rotateText'

const store = useInteractionStore()

const PANELS = [
  'Welcome to Proxima.',
  'A dual-view experience for exploring large corpus of images.',
]
const FADE_OUT_MS = ROTATE_FADE_OUT_MS

// Per-sentence FULL-OPACITY hold (ms): the time each sentence actually sits at
// opacity 1, NOT counting the appear-delay / fade overhead. The scheduler below
// adds that overhead on top so the on-screen hold matches these exactly.
//   sentence 1 → 2s, sentence 2 → 5s
const HOLDS = [2000, 5000]

// Mirror of the --rotate-* vars in app.vue :root (kept in sync there):
//   --rotate-appear-delay 1400 · --rotate-empty-beat 200 · --rotate-fade-ms 400.
// FIRST_APPEAR_MS = mount → sentence 1 fully visible (appear-delay + fade).
// GAP_MS          = trigger → next sentence fully visible (leave fade + empty
//                   beat + enter fade), under <Transition mode="out-in">.
const APPEAR_DELAY_MS = 1400
const EMPTY_BEAT_MS = 200
const FIRST_APPEAR_MS = APPEAR_DELAY_MS + FADE_OUT_MS
const GAP_MS = FADE_OUT_MS + EMPTY_BEAT_MS + FADE_OUT_MS

const index = ref(0)
const captionVisible = ref(true)
// Current sentence with "Proxima" italicised (rendered via v-html — the panels
// are static trusted constants, so no XSS surface).
const panelHtml = computed(() => (PANELS[index.value] ?? '').replace('Proxima', '<i>Proxima</i>'))
// The cross draws over the whole runtime (mount → advance) so it finishes as the
// last sentence ends: FIRST_APPEAR + Σ holds + one GAP per sentence change.
const crossDurationMs = computed(() =>
  FIRST_APPEAR_MS + HOLDS.reduce((a, b) => a + b, 0) + GAP_MS * (PANELS.length - 1),
)
let timers: ReturnType<typeof setTimeout>[] = []

function clearTimer() {
  for (const t of timers) clearTimeout(t)
  timers = []
}

// Smooth handoff to VIEW_2: hide the caption (v-if=false) so Vue's
// <Transition> runs its leave animation, then once that's complete
// trigger the view-level transition. Called by both the last-panel
// timer expiry and the skip chevron, so both paths produce the same
// smooth exit.
function advance() {
  if (!captionVisible.value) return
  clearTimer()
  captionVisible.value = false
  setTimeout(() => store.enterEntryView(), FADE_OUT_MS)
}

function skip() {
  advance()
}

onMounted(() => {
  // Per-sentence schedule (relative to mount). Sentence 1 is fully visible at
  // FIRST_APPEAR_MS; we flip to the next index after its HOLD, and each later
  // sentence becomes fully visible GAP_MS after the flip. After the last hold,
  // run the smooth exit.
  let t = FIRST_APPEAR_MS + (HOLDS[0] ?? 0)
  for (let i = 1; i < PANELS.length; i++) {
    const next = i
    timers.push(setTimeout(() => { index.value = next }, t))
    t += GAP_MS + (HOLDS[i] ?? 0)
  }
  timers.push(setTimeout(() => advance(), t))
})

onBeforeUnmount(() => {
  clearTimer()
})
</script>

<template>
  <section
    class="view-1"
    :class="`bg-${store.canvasBackground}`"
    :style="{ '--cross-draw-duration': `${crossDurationMs}ms` }"
  >
    <SkipButton @click="skip" />
    <!-- Vue <Transition> with `appear` + `mode="out-in"`. The
         out-in mode makes sentence-to-sentence transitions sequential:
         the old sentence fully fades out before the new sentence
         begins fading in (instead of cross-fading). A 600ms delay on
         the enter side then holds the empty space deliberately before
         the new sentence drifts in. Initial entrance, between-sentence
         transition, and exit all share the same 500ms cubic-bezier
         duration; only the appear adds its 1400ms hold and the enter
         adds its 600ms empty-beat delay. -->
    <Transition name="caption" mode="out-in" appear>
      <p v-if="captionVisible" :key="index" class="caption"><span class="caption-text" v-html="panelHtml"></span></p>
    </Transition>
  </section>
</template>

<style scoped>
/* Vue <Transition name="caption"> CSS hooks. All durations, easings,
   delays, and drift values are sourced from `:root` custom properties
   in app.vue (--rotate-* family) so this view's caption transition
   and View3Transition's .intro-caption transition share one source
   of truth — change a value once in :root, both views update.

   Timeline (computed from current :root values):
     Initial mount       : --rotate-appear-delay → --rotate-fade-ms fade-in
     Between sentences   : leave (--rotate-fade-ms) → --rotate-empty-beat → enter
     Exit toward VIEW_2  : leave (--rotate-fade-ms) → script calls advance()

   IMPORTANT: the JS-side FADE_OUT_MS in <script setup> must match
   --rotate-fade-ms (the leave duration) since setTimeout uses it to
   delay the view advance until the fade completes. */

/* Opacity-only fades: the base `.caption` rule (later in this file)
   sets `transform: translateX(-50%)` for horizontal centring and would
   override any transform set on the appear-from / enter-from / leave-to
   classes due to CSS cascade order anyway. Sticking to opacity makes
   the intent explicit and avoids the cascade-dependent surprise. */
.caption-appear-active {
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing) var(--rotate-appear-delay);
}
.caption-appear-from {
  opacity: 0;
}

.caption-enter-active {
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing) var(--rotate-empty-beat);
}
.caption-enter-from {
  opacity: 0;
}

.caption-leave-active {
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing);
}
.caption-leave-to {
  opacity: 0;
}

.view-1 {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 12vh;
  gap: 1.25rem;
  color: #595b54;
  z-index: 100;
}

/* Grid cross — same visual as VIEW-4's body::before-style cross
   (View4Relational.vue), but split into two pseudo-elements (horizontal
   in ::before, vertical in ::after) so each line can animate
   independently. Lines draw from center outward via scaleX/scaleY,
   with duration tracking the full panel-sequence runtime (set via the
   `--cross-draw-duration` CSS variable on the section). Linear easing
   so the cross reaches full extent exactly as the last panel finishes. */
.view-1::before,
.view-1::after {
  content: "";
  position: absolute;
  background: rgba(166, 154, 128, 0.85);
  pointer-events: none;
  z-index: 5;
  transform-origin: center;
}
.view-1::before {
  left: 5%;
  right: 5%;
  top: 50%;
  height: 1.6px;
  margin-top: -0.8px;
  animation: cross-draw-h var(--cross-draw-duration, 10000ms) linear forwards;
}
.view-1::after {
  top: 5%;
  bottom: 5%;
  left: 50%;
  width: 1.6px;
  margin-left: -0.8px;
  animation: cross-draw-v var(--cross-draw-duration, 10000ms) linear forwards;
}
@keyframes cross-draw-h {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes cross-draw-v {
  from { transform: scaleY(0); }
  to   { transform: scaleY(1); }
}

/* Caption is absolutely positioned (out of the flex flow), centred via
   left:50% + translateX(-50%). The skip control is the shared `SkipButton`
   component (bottom-centred, fixed). */
.caption {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
}

.caption {
  /* Centred in the viewport (was top: 4vh). Overrides the translateX-only
     transform from the `.caption` rule above so the box is centred on both
     axes; the fade hooks are opacity-only so this won't fight the
     transitions. */
  top: 50%;
  transform: translate(-50%, -50%);
  /* Wrap each sentence onto ~two lines (centred) — wide enough that even the
     long-word panel ("simultaneous perspectives") stays within two lines. */
  max-width: min(52rem, 90vw);
  /* pre-line honors the explicit `\n` in PANELS as a hard break while still
     wrapping long lines. (`normal` collapsed the newline into a space.) */
  white-space: pre-line;
  margin: 0;
  padding: 0;
  font-size: var(--rotate-size);
  line-height: var(--rotate-line-height);
  text-align: center;
  /* No animation here — Vue <Transition name="caption"> drives every
     fade via the caption-appear/enter/leave classes above. */
}

/* Organic backing that traces the text glyphs (not a box): a layered
   text-shadow in the blue-grey panel colour (80% opacity, set on
   --rotate-panel-bg) builds a soft "stroke" hugging the letterforms, so the
   fill reads as part of the text shape rather than a rectangle behind the
   line. Tight inner layers give it body; the wider layers feather out. */
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

</style>
