<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import SkipButton from '~/components/SkipButton.vue'
import { VIEW1_PANEL_MS, ROTATE_FADE_OUT_MS } from '~/utils/rotateText'

const store = useInteractionStore()

const PANELS = [
  'Proxima is a tool allowing exploration of a visual corpus through modes of proximity.',
  'It invites exploration through multiple simultaneous perspectives.',
]
// Per-view hold (4s for VIEW_1); the FADE (FADE_OUT_MS) stays shared/locked
// with the other rotating-text components via `~/utils/rotateText`.
// See feedback_rotate_text_sync.md.
const PANEL_MS = VIEW1_PANEL_MS
const FADE_OUT_MS = ROTATE_FADE_OUT_MS

const index = ref(0)
const captionVisible = ref(true)
const crossDurationMs = computed(() => PANELS.length * PANEL_MS)
let timer: ReturnType<typeof setInterval> | null = null

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
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
  timer = setInterval(() => {
    if (index.value >= PANELS.length - 1) {
      advance()
      return
    }
    index.value += 1
  }, PANEL_MS)
})

onBeforeUnmount(() => {
  clearTimer()
})
</script>

<template>
  <section
    class="view-1 bg-gradient"
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
      <p v-if="captionVisible" :key="index" class="caption"><span class="caption-text">{{ PANELS[index] }}</span></p>
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
  height: 1px;
  margin-top: -0.5px;
  animation: cross-draw-h var(--cross-draw-duration, 10000ms) linear forwards;
}
.view-1::after {
  top: 5%;
  bottom: 5%;
  left: 50%;
  width: 1px;
  margin-left: -0.5px;
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
  /* One line per sentence: no wrap, width grows to the text. */
  max-width: none;
  white-space: nowrap;
  margin: 0;
  padding: 0;
  font-size: var(--rotate-size);
  line-height: 1.5;
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

</style>
