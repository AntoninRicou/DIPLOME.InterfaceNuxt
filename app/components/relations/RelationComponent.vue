<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import { view3Interpretations, type View3ComponentId } from '~/view3/view3Interpretations'
import ProximityPanel from '~/components/ProximityPanel.vue'

const props = defineProps<{
  componentId: string
  label: string
  position?: 'tl' | 'tr' | 'bl' | 'br'
}>()
const store = useInteractionStore()

const interpretation = computed(() => view3Interpretations[props.componentId as View3ComponentId])
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

// ── Single invisible oval layout ──
// All sixteen cells (4 quadrants × 4 cells) sit on the SAME invisible
// ellipse, centred on the central image at viewport centre. The ellipse
// has its x semi-axis in `vw` and y semi-axis in `vh`, so its shape
// follows the viewport's aspect ratio — a true oval that wraps the
// central image and reaches close to the outer edges of each quadrant.
//
// Cells differ only in ANGLE around the oval, not in radius. Each
// quadrant gets a 90° slice; within that slice four cells are placed
// at uniformly spaced interior angles (11.25°, 33.75°, 56.25°, 78.75°
// from the quadrant base). Reading order around the oval is therefore
// continuous and the constellation looks as a single coherent ring,
// not four independent concentric arcs.
//
// Hierarchy reading (cell-1 closest, cell-4 furthest) is preserved by
// the existing z-index stacking (`.cell-1` z=4 front-most) and the
// per-index `--reveal-delay` stagger — not by radius.
//
// Constants are inlined here so the table is computed once at module
// load — no per-frame trig, no reactivity (positions are fixed per
// (position, i)).
const RX = 40 // vw — single x semi-axis (shared by all cells)
const RY = 37 // vh — single y semi-axis (shared by all cells)
const N_CELLS = 4
const ARC_SPAN_DEG = 90 // quadrant span
// CSS-screen angles: 0° = +x right, 90° = +y down, 180° = -x left, 270° = -y up.
// Cells are spaced at the four interior centres of the 90° arc divided
// into 8 slices: (i + 0.5) × (90 / 4) = (i + 0.5) × 22.5°.
const QUADRANT_BASE_DEG: Record<'tl' | 'tr' | 'bl' | 'br', number> = {
  br: 0,
  bl: 90,
  tl: 180,
  tr: 270,
}
const CELL_OFFSETS: Record<'tl' | 'tr' | 'bl' | 'br', { x: string; y: string }[]> =
  (Object.keys(QUADRANT_BASE_DEG) as (keyof typeof QUADRANT_BASE_DEG)[]).reduce((acc, key) => {
    const base = QUADRANT_BASE_DEG[key]
    acc[key] = Array.from({ length: N_CELLS }, (_, i) => {
      const angleDeg = base + (i + 0.5) * (ARC_SPAN_DEG / N_CELLS)
      const theta = (angleDeg * Math.PI) / 180
      const x = RX * Math.cos(theta)
      const y = RY * Math.sin(theta)
      return { x: `${x.toFixed(2)}vw`, y: `${y.toFixed(2)}vh` }
    })
    return acc
  }, {} as Record<'tl' | 'tr' | 'bl' | 'br', { x: string; y: string }[]>)

function onRelatedClick(id: string) {
  store.activateCentral(id)
}

// Hovering a relation cell lights up the same image on the standalone
// project canvas — the same `set-highlight` feedback VIEW_2 emits when a
// disperse sprite is hovered (see SET-HIGHLIGHT in CLAUDE.md). Cells are
// only interactive on `.rel:hover` (pointer-events gated), so these never
// fire in interpretation/overview mode. `set-highlight` drives project's
// transient *hover* track, which is independent of the persistent *focus*
// track the centre image holds (set by `focus(id)`) — so the centre keeps
// glowing while the hovered cell glows too, and hover-out just clears the
// hover halo, leaving the centre's glow intact.
function onCellHover(id: string) {
  store.setHighlight(id)
  // Ghost path — dashed translucent line from active central image to
  // this cell's id, drawn on every project canvas. Previews the proximity
  // link before commit. Cleared on cell-leave (fades out ~150ms).
  store.setGhostPath(id)
}
function onCellLeave() {
  store.setHighlight(null)
  store.setGhostPath(null)
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

// Quadrant ↔ project canvas index. Matches `STATES.split.rects` ordering
// in project/src/stateManager.js and the componentId mapping in
// view3Interpretations (tl=0 / tr=1 / bl=2 / br=3).
const QUADRANT_INDEX: Record<'tl' | 'tr' | 'bl' | 'br', number> = {
  tl: 0, tr: 1, bl: 2, br: 3,
}

function onMouseEnter(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height

  // Anchor for distance measurement is the inner corner of the quadrant —
  // where the arc's centre of curvature sits and where cell-1 is anchored.
  // Cursor close to the inner corner → forward stagger (cell-1 reveals
  // first, nearest the entry). Cursor far from inner corner / close to
  // outer corner → reverse stagger (cell-4 reveals first).
  let ax = 0
  let ay = 0
  switch (props.position) {
    case 'tl': ax = 1; ay = 1; break // BR corner of TL quadrant = inner
    case 'tr': ax = 0; ay = 1; break // BL corner of TR quadrant = inner
    case 'bl': ax = 1; ay = 0; break // TR corner of BL quadrant = inner
    case 'br': ax = 0; ay = 0; break // TL corner of BR quadrant = inner
  }

  // 0..√2; >0.7 ≈ past the diagonal midpoint, i.e. cursor entered from
  // the outer half of the quadrant.
  const dist = Math.hypot(x - ax, y - ay)
  revealDirection.value = dist < 0.7 ? 'forward' : 'reverse'

  // VIEW_4 hover-zoom: the three other canvases unzoom to overview so
  // the user sees the full map context, while this quadrant stays
  // zoomed on the active central image. Hover-leave is handled by the
  // central image sensor (setQuadrantHover(null)) and by mouseenter on
  // sibling quadrants (which retargets the diff). No mouseleave on
  // .rel — would race the sibling-mouseenter on quadrant-to-quadrant.
  store.setQuadrantHover(QUADRANT_INDEX[props.position ?? 'tl'])
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
        'central-revealed': store.centralHovered,
      }"
    >
      <button
        v-for="(id, i) in cells"
        :key="id"
        :class="['cell', `cell-${i + 1}`]"
        :style="{
          '--cell-x': CELL_OFFSETS[position ?? 'tl'][i]?.x,
          '--cell-y': CELL_OFFSETS[position ?? 'tl'][i]?.y,
        }"
        :title="id"
        @click="onRelatedClick(id)"
        @mouseenter="onCellHover(id)"
        @mouseleave="onCellLeave"
      >
        <AtlasThumb :id="id" fit="width" source="original" />
      </button>
    </div>

    <ProximityPanel
      v-if="interpretationActive && interpretation"
      class="interpretation-panel"
      :data-align="panelAlign"
      :component-id="componentId"
    />
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
/* Lift the entire quadrant above the central image deck the moment
   the cursor enters the quadrant area — the cells are about to fade
   in over the central image's footprint (cell-1 sits at the inner
   corner; CentralImage layers can extend past the 22vmin anchor
   based on their natural dimensions) and we want them above the
   deck from the first visible frame, not after the user moves onto
   a specific cell. The lift value is intentionally well above the
   tallest peer (.history-strip/.interpret-message at 11, .top-controls
   /.overview-control at 12) so the cells surface cleanly regardless
   of any other element in the view's stacking context. z-index is not
   transitionable — fires instantly on hover. */
.rel:hover {
  z-index: 50;
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
   Locally we only need to bump the z-index above the cells AND fire a
   one-shot glow pulse on mount — VIEW_4 only mounts once after the
   top-cross click, so the animation here is the visible companion to
   project's `body[data-corner-labels="visible"]:not([data-state="single"])
   .corner-label { animation: corner-label-glow }` pulse (style.css).
   Both screens swell their warm cream shadow then settle, in lockstep,
   right as the labels announce themselves. */
.corner-label {
  z-index: 2;
  animation: corner-label-glow 3.5s ease-out 1 both;
}

@keyframes corner-label-glow {
  0%   {
    text-shadow:
      0 0 8px rgba(255, 252, 230, 1),
      0 0 20px rgba(255, 248, 220, 0.9),
      0 0 42px rgba(255, 244, 210, 0.6),
      0 0 75px rgba(255, 240, 200, 0.3);
  }
  28%  {
    text-shadow:
      0 0 6px rgba(255, 255, 245, 1),
      0 0 20px rgba(255, 252, 225, 1),
      0 0 55px rgba(252, 240, 195, 1),
      0 0 115px rgba(248, 225, 165, 0.95),
      0 0 210px rgba(240, 205, 130, 0.8),
      0 0 340px rgba(230, 188, 100, 0.55);
  }
  100% {
    text-shadow:
      0 0 8px rgba(255, 252, 230, 1),
      0 0 20px rgba(255, 248, 220, 0.9),
      0 0 42px rgba(255, 244, 210, 0.6),
      0 0 75px rgba(255, 240, 200, 0.3);
  }
}

.status {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.65rem;
  color: #595b54;
  letter-spacing: 0.04em;
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

/* ── central-image hover reveal ──
   When the cursor is over the central image, every cell across every
   quadrant fades to full opacity so the user can see the whole field at
   once. Visual only — pointer-events stay off (cells remain non-clickable
   until the user moves into a quadrant and `.rel:hover` takes over). */
.constellation.central-revealed .cell {
  opacity: 1;
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

  /* ── Polar position with centre-on-oval anchoring ──
     Each cell reads inline-bound --cell-x / --cell-y (precomputed in
     script setup from a polar formula on a single shared ellipse).
     --center-shift-x / --center-shift-y (set per quadrant via
     data-position below) shift the cell by ±50% of its own bounding
     box so that its CENTRE — not its corner — lands on the oval. This
     keeps cells of different aspect ratios visually balanced on the
     same curve (a tall portrait and a wide landscape both pivot from
     their geometric centre instead of their inner corner). --cell-scale
     carries hover amplification on top. */
  --i: 0;
  --cell-scale: 1;
  --center-shift-x: 0%;
  --center-shift-y: 0%;
  transform: translate(
    calc(var(--cell-x, 0) + var(--center-shift-x)),
    calc(var(--cell-y, 0) + var(--center-shift-y))
  ) scale(var(--cell-scale));
}

/* Cell-N indices — `--i` feeds the reveal-delay stagger, z-index keeps
   cell-1 (most-relevant) painting above cell-4 even though arcs don't
   actually overlap. */
.cell-1 { z-index: 4; --i: 0; }
.cell-2 { z-index: 3; --i: 1; }
.cell-3 { z-index: 2; --i: 2; }
.cell-4 { z-index: 1; --i: 3; }

/* component hover → arc reveals with per-cell stagger.
   Direction depends on where the cursor crossed the quadrant border
   (set by onMouseEnter): forward = innermost (cell-1) first, reverse =
   outermost (cell-4) first. 80ms step yields ~240ms total stagger
   across 4 cells. */
.rel:hover .cell {
  opacity: 0.85;
  pointer-events: auto;
  /* Default = forward direction; overridden by data-reveal below. */
  --reveal-delay: calc(var(--i) * 80ms);
}
.rel:hover[data-reveal="reverse"] .cell {
  --reveal-delay: calc((3 - var(--i)) * 80ms);
}

/* per-cell focus amplification — composes with the polar translate via
   --cell-scale so the cell's arc position is preserved. */
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

/* ── per-quadrant anchor + centre shift ──
   Each quadrant pins its cells against its inner corner — the
   viewport-centre intersection — using `top/bottom: 0` and
   `left/right: 0`. --center-shift-x / --center-shift-y then shifts
   the cell by ±50% of its own bounding box so the cell's CENTRE
   (not the anchored corner) sits on the oval after the inline-bound
   --cell-x / --cell-y translate. The sign of the shift depends on
   WHICH corner was anchored: it always points from the anchored
   corner toward the cell's centre.

         TL ─ corner anchor BR (bottom: 0; right: 0;) → shift (+50%, +50%)
         TR ─ corner anchor BL (bottom: 0; left: 0;)  → shift (-50%, +50%)
         BL ─ corner anchor TR (top: 0;    right: 0;) → shift (+50%, -50%)
         BR ─ corner anchor TL (top: 0;    left: 0;)  → shift (-50%, -50%)
*/
.rel[data-position="tl"] .cell {
  bottom: 0;
  right: 0;
  --center-shift-x: 50%;
  --center-shift-y: 50%;
}
.rel[data-position="tr"] .cell {
  bottom: 0;
  left: 0;
  --center-shift-x: -50%;
  --center-shift-y: 50%;
}
.rel[data-position="bl"] .cell {
  top: 0;
  right: 0;
  --center-shift-x: 50%;
  --center-shift-y: -50%;
}
.rel[data-position="br"] .cell {
  top: 0;
  left: 0;
  --center-shift-x: -50%;
  --center-shift-y: -50%;
}

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
