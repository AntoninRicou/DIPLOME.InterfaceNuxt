<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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

const { getAspect } = useAtlas()

// ── Per-quadrant slot ranking by max image height ──
// Each slot has a fixed max half-height before the image gets clipped by
// `.rel`'s overflow box: half_height_max = min(cell_y_offset, 50vh −
// cell_y_offset). Slot 1 sits right at the inner corner (small y_offset
// against the midline) and is the most constrained in every quadrant;
// the middle-of-arc slots (2 or 3, depending on which axis the quadrant
// anchors on) win. TL/BR share a ranking; BL/TR share another. Values
// below are 0-indexed slot positions (0 = cell-1 … 3 = cell-4), most
// headroom → least:
//
//   TL: 2, 3, 4, 1  (slot indices 1, 2, 3, 0)
//   BR: 2, 3, 4, 1  (slot indices 1, 2, 3, 0)
//   BL: 3, 2, 1, 4  (slot indices 2, 1, 0, 3)
//   TR: 3, 2, 1, 4  (slot indices 2, 1, 0, 3)
const SLOT_RANK_BY_QUADRANT: Record<'tl' | 'tr' | 'bl' | 'br', number[]> = {
  tl: [1, 2, 3, 0],
  br: [1, 2, 3, 0],
  bl: [2, 1, 0, 3],
  tr: [2, 1, 0, 3],
}

// ── Aspect-aware slot assignment ──
// Sort the 4 ids by aspect ascending (tallest first); place them into
// this quadrant's slots in headroom order — tallest image lands in the
// most-headroom slot. Pure display permutation: the server's proximity
// order is preserved as a tiebreaker (ES2019 stable sort) and is never
// modified upstream.
const cells = computed(() => {
  const ids = (data.value?.related ?? []).slice(0, 4)
  if (ids.length === 0) return []

  const sortedIds = [...ids].sort((a, b) => getAspect(a) - getAspect(b))
  const ranks = SLOT_RANK_BY_QUADRANT[props.position ?? 'tl']

  const slots: (string | undefined)[] = [undefined, undefined, undefined, undefined]
  sortedIds.forEach((id, i) => {
    const slotIdx = ranks[i]
    if (slotIdx !== undefined) slots[slotIdx] = id
  })

  return slots
    .map((id, slotIdx) => (id ? { id, slotIdx } : null))
    .filter((x): x is { id: string; slotIdx: number } => x !== null)
})

// ── Single invisible oval layout ──
// All sixteen cells (4 quadrants × 4 cells) sit on the SAME invisible
// ellipse, centred on the central image at viewport centre. The ellipse
// has its x semi-axis in `vw` and y semi-axis in `vh`, so its shape
// follows the viewport's aspect ratio — a true oval that wraps the
// central image and reaches close to the outer edges of each quadrant.
//
// Cells differ only in ANGLE around the oval, not in radius. Each
// quadrant gets a 90° slice; within that slice four cells are placed
// at the centres of four EQUAL ARC-LENGTH segments, so the visible
// spacing between adjacent cells stays uniform regardless of the
// viewport's aspect ratio. (Earlier equal-angular spacing produced
// visibly bunched cells near the steep part of the ellipse and a
// stretched gap near the flat part.)
//
// Hierarchy reading (cell-1 closest, cell-4 furthest) is preserved by
// the existing z-index stacking (`.cell-1` z=4 front-most) and the
// per-index `--reveal-delay` stagger — not by radius.
const RX = 40 // vw — x semi-axis
const RY = 40 // vh — y semi-axis
const N_CELLS = 4
// CSS-screen angles: 0° = +x right, 90° = +y down, 180° = -x left, 270° = -y up.
const QUADRANT_BASE_DEG: Record<'tl' | 'tr' | 'bl' | 'br', number> = {
  br: 0,
  bl: 90,
  tl: 180,
  tr: 270,
}

// Viewport size in px — recomputed on resize. SSR default is a 16:9
// guess; the real values land on mount.
const viewportSize = ref<{ w: number; h: number }>({ w: 1920, h: 1080 })
function updateViewportSize() {
  viewportSize.value = { w: window.innerWidth, h: window.innerHeight }
}
onMounted(() => {
  updateViewportSize()
  window.addEventListener('resize', updateViewportSize)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateViewportSize)
})

// Equal-arc-length cell angles. We numerically integrate the ellipse's
// arc-length differential with the actual pixel semi-axes (a = RX·vw_px,
// b = RY·vh_px), then place the four cells at the centres of four equal
// arc-length segments.
//
// Direction matters per quadrant:
// - BR/TL parameterize as (±a·cos t, ±b·sin t) → ds/dt = √(a²sin²t + b²cos²t).
//   Slow at t=0 (x-axis end), fast at t=π/2 (y-axis end).
// - BL/TR parameterize as (∓a·sin t, ±b·cos t) → ds/dt = √(a²cos²t + b²sin²t).
//   Fast at t=0 (y-axis end), slow at t=π/2 (x-axis end).
// The BL/TR angles are the reflection of BR/TL across t = π/4 — i.e.
// `π/2 − tᵢ` reversed. Same equal-arc-length spacing, just mirrored.
const cellArcAnglesByQuadrant = computed<Record<'tl' | 'tr' | 'bl' | 'br', number[]>>(() => {
  const a = (RX / 100) * viewportSize.value.w
  const b = (RY / 100) * viewportSize.value.h
  const STEPS = 256
  const dTheta = (Math.PI / 2) / STEPS
  let total = 0
  const cum: number[] = [0]
  for (let i = 1; i <= STEPS; i++) {
    const t = (i - 0.5) * dTheta
    total += Math.sqrt(a * a * Math.sin(t) ** 2 + b * b * Math.cos(t) ** 2) * dTheta
    cum.push(total)
  }
  const brAngles: number[] = []
  for (let i = 0; i < N_CELLS; i++) {
    const target = ((i + 0.5) * total) / N_CELLS
    for (let j = 1; j <= STEPS; j++) {
      const cumJ = cum[j]
      const cumPrev = cum[j - 1]
      if (cumJ !== undefined && cumPrev !== undefined && cumJ >= target) {
        const frac = (target - cumPrev) / (cumJ - cumPrev)
        brAngles.push(((j - 1) + frac) * dTheta)
        break
      }
    }
  }
  const blAngles = brAngles.slice().reverse().map((t) => Math.PI / 2 - t)
  return { br: brAngles, tl: brAngles, bl: blAngles, tr: blAngles }
})

const CELL_OFFSETS = computed<Record<'tl' | 'tr' | 'bl' | 'br', { x: string; y: string }[]>>(() => {
  return (Object.keys(QUADRANT_BASE_DEG) as (keyof typeof QUADRANT_BASE_DEG)[]).reduce((acc, key) => {
    const baseRad = (QUADRANT_BASE_DEG[key] * Math.PI) / 180
    acc[key] = cellArcAnglesByQuadrant.value[key].map((a) => {
      const theta = baseRad + a
      const x = RX * Math.cos(theta)
      const y = RY * Math.sin(theta)
      return { x: `${x.toFixed(2)}vw`, y: `${y.toFixed(2)}vh` }
    })
    return acc
  }, {} as Record<'tl' | 'tr' | 'bl' | 'br', { x: string; y: string }[]>)
})

// ── Clockwise entrance sweep (whole-oval, coordinated) ──
// Each cell's entrance is delayed by its absolute angular position around
// the shared ellipse, measured CLOCKWISE FROM 12 O'CLOCK. Because every
// RelationComponent uses the same absolute formula and all four (re)mount
// their cells on the same `centralImageId` change, the four quadrants read
// as one continuous clockwise sweep. Pure appearance: the entrance lives on
// an inner `.cell-reveal` wrapper and never touches the cell's own opacity /
// transform / hover behaviour (the cells still settle into their normal
// latent 0.05 state). Plays on the relational view appearing and on every
// new central-image selection.
// Total time for one full clockwise sweep across all 16 cells. The per-cell
// STEP (sweep / 16) is shared by both reveal modes, so they run at the same
// speed — only the span differs.
const ENTER_SWEEP_MS = 1000
const ENTER_STEP_MS = ENTER_SWEEP_MS / 16

// First reveal = the transition INTO VIEW_4 → one continuous clockwise sweep
// across the whole oval. Every later central-image change reveals each
// quadrant's own 4 cells with all four quadrants running CONCURRENTLY (~¼
// the time, same per-cell step).
const isFirstReveal = ref(true)
watch(centralImageId, () => { isFirstReveal.value = false })

function enterDelay(slotIdx: number): string {
  const pos = props.position ?? 'tl'
  if (isFirstReveal.value) {
    // Whole-oval sweep: delay = absolute clockwise position from 12 o'clock.
    // CSS-screen angle: 0°=right, 90°=down, 270°=up. Increasing angle is
    // clockwise on screen (y points down).
    const a = cellArcAnglesByQuadrant.value[pos][slotIdx] ?? 0
    const thetaDeg = QUADRANT_BASE_DEG[pos] + (a * 180) / Math.PI
    const cw = (((thetaDeg - 270) % 360) + 360) % 360
    return `${Math.round((cw / 360) * ENTER_SWEEP_MS)}ms`
  }
  // Per-quadrant, concurrent: local clockwise order within this quadrant.
  // Slot index already follows clockwise order within a quadrant (arc angle
  // is monotonic in slot), so delay = slotIdx × the shared per-cell step.
  return `${Math.round(slotIdx * ENTER_STEP_MS)}ms`
}

// Overview finale: per-cell delay for the clockwise FADE-OUT, spread across
// the whole oval (absolute clockwise position from 12 o'clock) over the
// store's dissolve-sweep window. Consumed by the `.finale-dissolve`
// transition-delay so all four quadrants fade out as one clockwise sweep.
function dissolveDelay(slotIdx: number): string {
  const pos = props.position ?? 'tl'
  const a = cellArcAnglesByQuadrant.value[pos][slotIdx] ?? 0
  const thetaDeg = QUADRANT_BASE_DEG[pos] + (a * 180) / Math.PI
  const cw = (((thetaDeg - 270) % 360) + 360) % 360
  return `${Math.round((cw / 360) * store.overviewDissolveSweepMs)}ms`
}

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
    :class="{ 'is-inert': interpretationActive, 'is-frozen': store.overviewFinaleActive }"
    :data-position="position ?? 'tl'"
    :data-reveal="revealDirection"
    @mouseenter="onMouseEnter"
  >
    <span class="corner-label" :data-position="position ?? 'tl'">{{ label }}</span>

    <div v-if="!centralImageId" class="status">no central image</div>
    <!-- Loading is silent — no "querying…" text. The empty branch keeps the
         constellation hidden until data lands, so the entrance plays cleanly
         on fresh cells (blank → clockwise reveal). -->
    <div v-else-if="pending" class="status" aria-hidden="true" />
    <div v-else-if="error" class="status error">error</div>

    <div
      v-else
      class="constellation"
      :class="{
        suppressed: interpretationActive,
        hidden: store.overviewConfirmed,
        'central-revealed': store.centralHovered,
        'finale-bright': store.overviewFinalePhase === 'bright',
        'finale-dissolve':
          store.overviewFinalePhase === 'dissolve' || store.overviewFinalePhase === 'fadeout',
      }"
    >
      <button
        v-for="cell in cells"
        :key="cell.id"
        :class="['cell', `cell-${cell.slotIdx + 1}`]"
        :style="{
          '--cell-x': CELL_OFFSETS[position ?? 'tl'][cell.slotIdx]?.x,
          '--cell-y': CELL_OFFSETS[position ?? 'tl'][cell.slotIdx]?.y,
          '--enter-delay': enterDelay(cell.slotIdx),
          '--dissolve-delay': dissolveDelay(cell.slotIdx),
        }"
        :title="cell.id"
        @click="onRelatedClick(cell.id)"
        @mouseenter="onCellHover(cell.id)"
        @mouseleave="onCellLeave"
      >
        <span class="cell-reveal">
          <AtlasThumb :id="cell.id" fit="width" source="original" />
        </span>
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

/* ── overview finale — frozen ──
   During the bright/dissolve finale the quadrant is non-interactive (no
   hover-reveal, no clicks); the cells' opacity is driven entirely by the
   `.finale-*` rules above. */
.rel.is-frozen {
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
  /* Above the cells AND above the interpretation veil (.interpret-veil,
     z: 5) so the Mirror / Trace / Shift / Replay tags stay crisp and visible
     in interpretation mode rather than being blurred away with the field. */
  z-index: 6;
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

/* ── interpretation mode — reveal the whole field ──
   Clicking the `+` interpret-control brings every quadrant image to full
   opacity (and clicking again reverts to the latent field). Cells stay
   non-interactive (pointer-events off) — this is a perceptual reveal, not
   a click target. */
.constellation.suppressed {
  pointer-events: none;
}
.constellation.suppressed .cell {
  opacity: 1;
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

/* ── overview finale ──
   When the 10th image is reached, every cell flashes to full opacity (a
   brief bright hold), then fades out one-by-one CLOCKWISE across the whole
   oval (per-cell `--dissolve-delay`), after which the deck collapses into
   the contributed circle. Overrides the latent/hover opacity; interaction
   is frozen via `.rel.is-frozen`. Pure appearance — these only touch
   opacity, the cells' geometry/transform is untouched. */
.constellation.finale-bright .cell {
  opacity: 1;
  transition: opacity 250ms ease-out;
}
.constellation.finale-dissolve .cell {
  opacity: 0;
  /* Per-cell fade length must match OVERVIEW_DISSOLVE_FADE_MS in
     interaction.ts (the store waits BRIGHT + SWEEP + FADE before confirm). */
  transition: opacity 800ms ease-out var(--dissolve-delay, 0ms);
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

/* ── Clockwise entrance wrapper ──
   Inner element that owns ONLY the appearance cascade (fade + scale-up),
   composing multiplicatively over the cell's own opacity/transform — so the
   cell still settles into its normal latent 0.05 state and all hover /
   reveal behaviour is untouched. `backwards` fill keeps it hidden during
   its per-cell delay, then it animates in; no `forwards`, so once done it
   reverts to the default (opacity 1 / scale 1) and the cell's own rules take
   over cleanly. `--enter-delay` is the absolute clockwise position around
   the shared oval (set inline), so the four quadrants sweep as one. */
.cell-reveal {
  display: block;
  transform-origin: center center;
  animation: cell-reveal-in 600ms ease-out var(--enter-delay, 0ms) backwards;
}
@keyframes cell-reveal-in {
  from { opacity: 0; transform: scale(0.6); }
  to   { opacity: 1; transform: scale(1); }
}

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
  /* above the beige veil (z: 5) so the text reads over the blurred field */
  z-index: 6;
}

/* optional alignment override from the data layer; default is centered */
.interpretation-panel[data-align="start"] { text-align: left; }
.interpretation-panel[data-align="end"] { text-align: right; }
.interpretation-panel[data-align="center"] { text-align: center; }
</style>
