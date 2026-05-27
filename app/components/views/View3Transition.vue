<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import CentralImage from '~/components/CentralImage.vue'
import { view3Interpretations, type View3ComponentId } from '~/view3/view3Interpretations'

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

// Corner labels appear at the four viewport corners at the same screen
// positions VIEW-4's RelationComponent quarter-tags occupy, so the swap
// between VIEW_3 → VIEW_4 reads as a continuation, not a new layer.
const CORNERS = [
  { position: 'tl', name: 'Mirror' },
  { position: 'tr', name: 'Trace' },
  { position: 'bl', name: 'Shift' },
  { position: 'br', name: 'Replay' },
] as const

const showCaption = ref(false)
let captionTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (captionTimer) { clearTimeout(captionTimer); captionTimer = null }
}

watch(() => store.allCanvasesZoomed, (zoomed) => {
  if (!zoomed) return
  captionTimer = setTimeout(() => {
    showCaption.value = true
    // Reveal the same four labels on the standalone project's canvases
    // at the same moment the interface's corner-tags fade in, so both
    // screens show MIRROR / TRACE / SHIFT / REPLAY in sync.
    store.revealCornerLabels()
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
      :class="{ visible: showCaption }"
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
      <div
        class="quadrant-text proximity-panel"
        :class="{ visible: store.canvasZoomed[q.index] }"
        :style="{ left: q.x, top: q.y }"
      >
        <p class="proximity-panel-title">{{ view3Interpretations[q.componentId].title }}</p>
        <p class="proximity-panel-body">{{ view3Interpretations[q.componentId].body }}</p>
      </div>
    </template>

    <div class="central-slot">
      <CentralImage :ids="store.centralStack" :active-index="store.centralStackActiveIndex" />
    </div>

    <div class="caption-wrap" :class="{ visible: showCaption }">
      <p class="caption">
        Four modes of proximity, each shaping relations differently with the center image.
      </p>
    </div>

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
  left: 1.5%;
  right: 1.5%;
  top: 50%;
  height: 1px;
  margin-top: -0.5px;
}
.view-2::after {
  top: 1.5%;
  bottom: 1.5%;
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
  font-family: inherit;
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

/* Caption wrapper — a full-width strip with `text-align: center`. The
   inner `<p>` is `display: inline-block`, so the block-level wrapper
   centres it like centred text. This is the most robust centring
   technique (works regardless of flex / transform / positioning
   interactions) and intentionally distinct from the per-quadrant texts'
   layout. */
.caption-wrap {
  position: absolute;
  bottom: calc(50% + 11vmin + 1.25rem);
  left: 0;
  right: 0;
  text-align: center;
  pointer-events: none;
  z-index: 10;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 600ms ease-out, transform 600ms ease-out;
}
.caption-wrap.visible {
  opacity: 1;
  transform: translateY(0);
}
.caption {
  display: inline-block;
  margin: 0;
  padding: 0 1rem;
  max-width: 36rem;
  text-align: center;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #595b54;
}

/* Advance variant — top-centre of the viewport, pixel-positioned
   identically to VIEW_4's `.interpret-control` so the glyph stays put
   across the swap. Hidden + non-clickable until `.visible` (the modes
   caption fade-in trigger), then opacity fades in with a 500ms delay
   so the reveal cascades after the caption. */
.cross-advance {
  top: 1.25rem;
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
