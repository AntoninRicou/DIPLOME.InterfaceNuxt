<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import CentralImage from '~/components/CentralImage.vue'

const store = useInteractionStore()

// Canvas index ↔ quadrant mapping matches project's stateManager STATES.split.rects:
//   0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right
// Each quadrant's `text` describes the mode of proximity that quadrant
// represents; appears in place of the cross once the user clicks it.
const QUADRANTS = [
  {
    index: 0,
    x: '25%',
    y: '25%',
    text: 'The surrounding image are reflecting recurring visual structures such as shapes, and textures to the image picked.',
  },
  {
    index: 1,
    x: '75%',
    y: '25%',
    text: 'The surrounding image are retracing a lexical subject field based on historical sources linked to the image picked.',
  },
  {
    index: 2,
    x: '25%',
    y: '75%',
    text: 'The surrounding image are sharing a semantic embeddings related to the image picked.',
  },
  {
    index: 3,
    x: '75%',
    y: '75%',
    text: 'The surrounding image are previous user selections including the image picked. Yours will also contributes to the evolving map.',
  },
]

// After the 4th cross is clicked (`allCanvasesZoomed` flips true), the
// modes caption and the four corner labels (Mirror/Trace/Shift/Replay,
// matching VIEW-4's RelationComponent quarter-tags) fade in 4s later.
// No auto-advance to VIEW_4 — the transition out of VIEW_3 will come
// from a future explicit trigger.
const CAPTION_DELAY_MS = 4000

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
  }, CAPTION_DELAY_MS)
})

onBeforeUnmount(clearTimers)
</script>

<template>
  <section class="view-2 bg-gradient">
    <span
      v-for="c in CORNERS"
      :key="c.position"
      class="corner-tag"
      :class="{ visible: showCaption }"
      :data-position="c.position"
    >
      {{ c.name }}
    </span>

    <template v-for="q in QUADRANTS" :key="q.index">
      <button
        class="quadrant-cross"
        :class="{ faded: store.canvasZoomed[q.index] }"
        :style="{ left: q.x, top: q.y }"
        :aria-label="`zoom canvas ${q.index + 1}`"
        @click="store.zoomCanvas(q.index)"
      >
        +
      </button>
      <p
        class="quadrant-text"
        :class="{ visible: store.canvasZoomed[q.index] }"
        :style="{ left: q.x, top: q.y }"
      >
        {{ q.text }}
      </p>
    </template>

    <div class="central-slot">
      <CentralImage :ids="store.centralStack" :active-index="store.centralStackActiveIndex" />
    </div>

    <p class="caption" :class="{ visible: showCaption }">
      Four modes of proximity, each shaping relations differently:<br>
      Mirror (visual), Trace (source), Shift (semantic), Replay (collaborative).
    </p>

    <button
      class="advance-control"
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
  color: #e8e8e8;
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

/* Corner tags — Mirror / Trace / Shift / Replay at the four viewport
   corners. Pixel-positioned identically to VIEW-4's RelationComponent
   `.quarter-tag` (top:0/left:0 etc., same monospace caps, same color)
   so the labels stay put across the VIEW_3 → VIEW_4 swap. Fade in
   together with the bottom caption, controlled by `showCaption`. */
.corner-tag {
  position: absolute;
  font-family: monospace;
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  color: #4a4a52;
  padding: 0.75rem 0.95rem;
  pointer-events: none;
  text-transform: uppercase;
  z-index: 11;
  opacity: 0;
  transition: opacity 600ms ease-out;
  /* Soft warm halo behind each label — layered text-shadows produce a
     subtle bloom that lifts the dark-gray text off the gradient backdrop
     without competing with the central image or the quadrant texts. */
  text-shadow:
    0 0 6px rgba(255, 242, 210, 0.85),
    0 0 14px rgba(255, 240, 200, 0.55),
    0 0 28px rgba(255, 238, 190, 0.28);
}
.corner-tag.visible { opacity: 1; }
.corner-tag[data-position="tl"] { top: 0; left: 0; }
.corner-tag[data-position="tr"] { top: 0; right: 0; }
.corner-tag[data-position="bl"] { bottom: 0; left: 0; }
.corner-tag[data-position="br"] { bottom: 0; right: 0; }

/* Quadrant crosses — small interactive "+" markers, one per quadrant.
   Click → store.zoomCanvas(i) → project zooms that one canvas onto the
   selected image. Hidden once the corresponding canvas is zoomed. */
.quadrant-cross {
  position: absolute;
  transform: translate(-50%, -50%);
  background: transparent;
  border: none;
  color: rgba(166, 154, 128, 0.85);
  font-family: inherit;
  font-size: 2rem;
  line-height: 1;
  padding: 0.5rem;
  cursor: pointer;
  opacity: 0.6;
  pointer-events: auto;
  transition: opacity 300ms ease, transform 150ms ease;
  z-index: 15;
}
.quadrant-cross:hover {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1.15);
}
/* Faded out once the corresponding canvas is zoomed; pointer-events: none
   so the invisible button doesn't catch clicks. */
.quadrant-cross.faded {
  opacity: 0;
  pointer-events: none;
}

/* Mode-of-proximity description, shown at the quadrant centre in place
   of the cross once that canvas is zoomed. Fades in after the cross
   fades out (slight delay) so the swap reads as a clean replacement. */
.quadrant-text {
  position: absolute;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0 1rem;
  max-width: 18em;
  text-align: center;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #2a2e36;
  pointer-events: none;
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

.caption {
  position: absolute;
  bottom: 3rem;
  left: 50%;
  margin: 0;
  max-width: 36rem;
  text-align: center;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #2a2e36;
  z-index: 10;
  /* Hidden initially. Slides + fades in when `.visible` lands (set 1s
     after the fourth quadrant is zoomed). 2s later the view auto-
     advances to VIEW_4 — see script setup. */
  opacity: 0;
  transform: translate(-50%, 8px);
  transition: opacity 600ms ease-out, transform 600ms ease-out;
}
.caption.visible {
  opacity: 1;
  transform: translate(-50%, 0);
}

/* Advance control — same `+` glyph and visual styling as VIEW-4's
   `.interpret-control` (top centre of the viewport, monospace +,
   #1a1d24 on the gradient), but a separate button so clicking it
   advances VIEW_3 → VIEW_4 instead of toggling interpretation mode in
   the relational view. Pixel-positioned identically to VIEW-4's
   interpret-control so the glyph stays put across the swap.
   Hidden + pointer-events: none until `.visible`, then fades in just
   after the caption (500ms transition-delay) to cascade the reveal. */
.advance-control {
  position: absolute;
  top: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
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
  color: #1a1d24;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 600ms ease-out 500ms, color 150ms ease-out;
}
.advance-control.visible {
  opacity: 1;
  pointer-events: auto;
}
.advance-control:hover {
  color: #000;
}
</style>
