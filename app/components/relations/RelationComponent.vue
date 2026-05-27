<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import { view3Interpretations } from '~/view3/view3Interpretations'

const props = defineProps<{
  componentId: string
  label: string
  position?: 'tl' | 'tr' | 'bl' | 'br'
}>()
const store = useInteractionStore()

const interpretation = computed(() => view3Interpretations[props.componentId])
const interpretationActive = computed(() => store.view3InterpretationMode)
// Panels are always centered in their quadrant; alignment in the data layer
// is an optional override for the text within the panel itself.
const panelAlign = computed(() => interpretation.value?.align ?? 'center')

const centralImageId = computed(() => store.activeCentralImageId)

const { data, pending, error, refresh } = await useFetch<{
  componentId: string
  centralImageId: string
  related: string[]
}>(() => `/api/relations/${props.componentId}`, {
  query: computed(() => ({ centralImageId: centralImageId.value ?? '' })),
  watch: [centralImageId],
  immediate: !!centralImageId.value,
})

watch(centralImageId, (v) => {
  if (v) refresh()
})

const cells = computed(() => (data.value?.related ?? []).slice(0, 4))

function onRelatedClick(id: string) {
  store.activateCentral(id)
}

// ── Cascade reveal direction ──
// Determined on each mouseenter from where the cursor crossed the
// quadrant border. 'forward' = innermost (cell-1) appears first, cells
// fan outward; 'reverse' = outermost (cell-4) appears first, cells flow
// inward. The threshold is distance-from-anchor in normalized
// coordinates: close to the anchor corner → reveal away from cursor
// (forward); far from anchor → reveal toward cursor (reverse). This
// gives the cascade a directional reading depending on entry side,
// analogous to a clockwise/counter-clockwise sweep on a circular layout.
const revealDirection = ref<'forward' | 'reverse'>('forward')

function onMouseEnter(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height

  // Each quadrant anchors cell-1 at a specific corner.
  let ax = 0
  let ay = 0
  switch (props.position) {
    case 'tl': ax = 1; ay = 0; break // TR corner of quadrant
    case 'tr': ax = 0; ay = 0; break // TL corner
    case 'bl': ax = 1; ay = 1; break // BR corner
    case 'br': ax = 0; ay = 1; break // BL corner
  }

  // 0..√2; >0.7 ≈ past the diagonal midpoint, i.e. cursor entered from
  // the outer half of the quadrant.
  const dist = Math.hypot(x - ax, y - ay)
  revealDirection.value = dist < 0.7 ? 'forward' : 'reverse'
}
</script>

<template>
  <article
    class="rel"
    :class="{ 'is-inert': interpretationActive }"
    :data-position="position ?? 'tl'"
    :data-reveal="revealDirection"
    @mouseenter="onMouseEnter"
  >
    <span class="corner-label" :data-position="position ?? 'tl'">{{ label }}</span>

    <div v-if="!centralImageId" class="status">no central image</div>
    <div v-else-if="pending" class="status">querying…</div>
    <div v-else-if="error" class="status error">error</div>

    <div
      v-else
      class="constellation"
      :class="{
        suppressed: interpretationActive,
        hidden: store.overviewConfirmed,
      }"
    >
      <button
        v-for="(id, i) in cells"
        :key="id"
        :class="['cell', `cell-${i + 1}`]"
        :title="id"
        @click="onRelatedClick(id)"
      >
        <AtlasThumb :id="id" fit="width" />
      </button>
    </div>

    <aside
      v-if="interpretationActive && interpretation"
      class="interpretation-panel proximity-panel"
      :data-align="panelAlign"
    >
      <p class="proximity-panel-title">{{ interpretation.title }}</p>
      <p class="proximity-panel-body">{{ interpretation.body }}</p>
    </aside>
  </article>
</template>

<style scoped>
.rel {
  position: relative;
  /* No background of its own — the panel is embedded directly in the
     VIEW-3 atmospheric backdrop (project's gradient stack, mirrored in
     View3Relational). Spatial separation comes from the grid seams and
     the cells themselves, not a solid panel fill. */
  overflow: hidden;
}

/* ── interpretation mode — structural inertness ──
   Disables the interactive layer entirely. Hover selectors below never
   match because the element no longer receives pointer events; cells'
   reveal-on-hover, focus amplification, and clicks all go dormant by
   construction rather than by per-state override. */
.rel.is-inert {
  pointer-events: none;
}

/* Corner label appearance + position come from the global
   `.corner-label` class in app.vue (shared with VIEW_3's corner tags
   so the labels read as continuous through the VIEW_3 → VIEW_4 swap).
   Locally we only need to bump the z-index above the cells. */
.corner-label {
  z-index: 2;
}

.status {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: monospace;
  font-size: 0.65rem;
  color: #595b54;
  letter-spacing: 0.1em;
  pointer-events: none;
}
.status.error { color: #855; }

.constellation {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: opacity 240ms ease-out, filter 240ms ease-out;
}

/* ── interpretation mode field suppression ──
   single perceptual rule per container: pushed back as a background field. */
.constellation.suppressed {
  pointer-events: none;
  opacity: 0.4;
  filter: blur(1px);
}

/* ── overview-confirmed: cells fade out entirely ──
   Once the user clicks `Contribute to proxima` (overviewConfirmed = true),
   the relational layer is no longer interactive — the contributed branch
   is fixed. Hiding the constellation as a whole (parent-opacity = 0)
   suppresses every cell including the hover-reveal rule, since child
   opacity composes multiplicatively with the parent. */
.constellation.hidden {
  pointer-events: none;
  opacity: 0;
}

.cell {
  position: absolute;
  width: 12vmin;
  /* No padding, no background — the AtlasThumb fills the cell edge to edge.
     The transparent border preserves a 1px layout slot so hover's
     border-color: #7a7a85 can fill in without shifting layout. */
  padding: 0;
  border: 0px solid transparent;
  background: transparent;
  cursor: pointer;
  opacity: 0.05;
  pointer-events: none;
  /* Opacity transition takes a per-cell delay (--reveal-delay) only on
     the reveal direction; on un-hover the variable reverts to 0ms so all
     cells fade out together. Other transitions stay un-delayed so cell
     focus amplification fires immediately. */
  transition:
    opacity 260ms ease-out var(--reveal-delay, 0ms),
    transform 200ms ease-out,
    box-shadow 200ms ease-out,
    border-color 200ms ease-out;
  box-sizing: border-box;

  /* ── Vector cascade ──
     Each cell is anchored at the same per-quadrant base point (set by
     .rel[data-position="*"] below) and then translated along a single
     coupled vector (--dx, --dy) by index × step. This is a true diagonal
     flow — no axis-biased grid. Hover scale composes with the translate
     via --cell-scale so the position transform is never overwritten.

     Step is split per axis (vw for horizontal, vh for vertical) so the
     vector reaches the opposite corner of a non-square quadrant. It's
     still one coupled motion per cell — both components grow together by
     index — just calibrated to the quadrant's actual aspect ratio. With
     14vw/14vh the cell-4 endpoint lands at ~84% of each axis from anchor,
     close to the opposite corner across typical viewport aspects. */
  --i: 0;
  --dx: 0;
  --dy: 0;
  --step-x: 11vw;
  --step-y: 11vh;
  --cell-scale: 1;
  transform:
    translate(
      calc(var(--i) * var(--step-x) * var(--dx)),
      calc(var(--i) * var(--step-y) * var(--dy))
    )
    scale(var(--cell-scale));
}

/* Cascade stacking — innermost (most-relevant) suggestion sits on top;
   outer cells fan out behind it like a deck of cards. */
.cell-1 { z-index: 4; --i: 0; }
.cell-2 { z-index: 3; --i: 1; }
.cell-3 { z-index: 2; --i: 2; }
.cell-4 { z-index: 1; --i: 3; }

/* component hover → cascade reveals with per-cell stagger.
   Direction depends on where the cursor crossed the quadrant border
   (set by onMouseEnter): forward = innermost first, reverse = outermost
   first. 80ms step yields ~240ms total stagger across 4 cells. */
.rel:hover .cell {
  opacity: 0.85;
  pointer-events: auto;
  /* Default = forward direction; overridden by data-reveal below. */
  --reveal-delay: calc(var(--i) * 80ms);
}
.rel:hover[data-reveal="reverse"] .cell {
  --reveal-delay: calc((3 - var(--i)) * 80ms);
}

/* per-cell focus amplification — composes with the cascade translate via
   --cell-scale so the cell's diagonal position is preserved. */
.rel:hover .cell:hover,
.rel:hover .cell:focus-visible {
  opacity: 1;
  --cell-scale: 1.1;
  border-color: #7a7a85;
  color: #f0f0f4;
  box-shadow: 0 0 22px 2px rgba(200, 200, 220, 0.18);
  outline: none;
  z-index: 5;
}

/* siblings of focused cell soften */
.rel:hover:has(.cell:hover) .cell:not(:hover),
.rel:hover:has(.cell:focus-visible) .cell:not(:focus-visible) {
  opacity: 0.45;
}

/* ── per-quadrant anchor + direction vector ──
   Each quadrant anchors all four of its cells at a single base corner,
   then the cascade direction (--dx, --dy) carries them along the quadrant's
   anti-diagonal. The transform on .cell does the actual displacement via
   index × step × direction. One coupled vector per cell — no axis-biased
   positioning, no deformed grid.

       TL ─ anchor at TR corner → (-X, +Y) sweep toward BL
       TR ─ anchor at TL corner → (+X, +Y) sweep toward BR
       BL ─ anchor at BR corner → (-X, -Y) sweep toward TL
       BR ─ anchor at BL corner → (+X, -Y) sweep toward TR
*/
.rel[data-position="tl"] .cell { top: 10%;    right: 10%;  --dx: -1; --dy:  1; }
.rel[data-position="tr"] .cell { top: 10%;    left: 10%;   --dx:  1; --dy:  1; }
.rel[data-position="bl"] .cell { bottom: 10%; right: 10%;  --dx: -1; --dy: -1; }
.rel[data-position="br"] .cell { bottom: 10%; left: 10%;   --dx:  1; --dy: -1; }

/* ── interpretation overlay ──
   Centered inside the quadrant. No chrome — text floats directly over the
   suppressed field as a sharp semantic layer. Typography comes from the
   global `.proximity-panel` class in app.vue (shared with VIEW_3's
   quadrant-text so the look is identical across the swap). Locally we
   only own positioning and the optional alignment overrides. */
.interpretation-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 4;
}

/* optional alignment override from the data layer; default is centered */
.interpretation-panel[data-align="start"] { text-align: left; }
.interpretation-panel[data-align="end"] { text-align: right; }
.interpretation-panel[data-align="center"] { text-align: center; }
</style>
