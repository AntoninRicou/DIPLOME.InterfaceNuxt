<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import { view3Interpretations, type View3ComponentId } from '~/view3/view3Interpretations'
import ProximityPanel from '~/components/ProximityPanel.vue'

const props = defineProps<{
  componentId: string
  label: string
  position?: 'tl' | 'tr' | 'bl' | 'br'
  // VIEW_3 preview mode: the suggestion images render as a non-interactive
  // preview, revealed per-quadrant (clockwise) when this quadrant's cross is
  // clicked (gated on store.canvasZoomed[index]) and STAY visible afterward
  // (not the latent 0.05). No hover-zoom, no click-to-activate, no ghost path,
  // no corner label (View3Transition owns the VIEW_3 labels).
  preview?: boolean
}>()
const store = useInteractionStore()

const interpretation = computed(() => view3Interpretations[props.componentId as View3ComponentId])
const interpretationActive = computed(() => store.view3InterpretationMode)
// Panels are always centered in their quadrant; alignment in the data layer
// is an optional override for the text within the panel itself.
const panelAlign = computed(() => interpretation.value?.align ?? 'center')

const centralImageId = computed(() => store.activeCentralImageId)

// History dedup — every image already in the navigation path is sent as
// `exclude` so a visited image never reappears as a suggestion in any
// quadrant; the server skips them in pickRelations and returns the
// next-nearest instead. Joined to a stable comma string so useFetch's query
// watcher only refetches on an actual path change.
const excludeIds = computed(() => store.navigationHistory.join(','))

const { data, pending, error, refresh } = await useFetch<{
  componentId: string
  centralImageId: string
  related: string[]
  // Per-id subject string + the central image's own subject. Present only for
  // components with a subject source (component_1 / Source today).
  subjects: Record<string, string>
  centralSubject: string
  // Per-id candidate tags (5 each), the central image's own tags, and global
  // tag frequency. Present only for components with a tag source (component_3
  // / Semantic today). The client surfaces the tags SHARED between a hovered
  // neighbor and the centre (see `hoveredTags`).
  tags: Record<string, string[]>
  tagFreq: Record<string, number>
  centralTags: string[]
  // Per-id year + the central image's year. Present only for components with a
  // year source (component_4 / Time today — year-based proximity).
  years: Record<string, string>
  centralYear: string
}>(() => `/api/relations/${props.componentId}`, {
  query: computed(() => ({ centralImageId: centralImageId.value ?? '', exclude: excludeIds.value })),
  watch: [centralImageId, excludeIds],
  immediate: !!centralImageId.value,
})

watch(centralImageId, (v) => {
  if (v) refresh()
})

const { getAspect } = useAtlas()
const { naturalDimsVmin } = useCentralImageDims()

// Balanced cell size — the SAME natural-dims model the central deck, circle of
// 10 and corner ribbons use (ratio preserved, extreme aspects gently balanced,
// subtle per-image hash variation), so the quadrant suggestions feel coherent
// with the rest of the view instead of a fixed-width row. Only the width is
// driven here; the height follows the image's true aspect (AtlasThumb
// fit="width"), so the box keeps the real ratio. Scaled to ~16vmin typical.
const QUADRANT_SCALE = 0.6
function cellWidthVmin(id: string): string {
  return `${(naturalDimsVmin(id).width * QUADRANT_SCALE).toFixed(2)}vmin`
}

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
const RX = 43 // vw — x semi-axis
const RY = 38 // vh — y semi-axis
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
// Angular margin (degrees) kept clear at BOTH ends of each quadrant's 90° arc
// so the end cells don't sit on the axes (= the grid cross). The four cells are
// spread equal-arc within [inset, 90° − inset] instead of [0°, 90°]; they stay
// on the SAME ellipse (oval shape unchanged), just pulled off the centerlines.
// Raise it if cells still touch the cross; lower it to let them reach wider.
const CELL_INSET_DEG = 5
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
  // Arc length at a given angle (linear interp on cum), and its inverse.
  const arcAt = (theta: number): number => {
    const x = Math.min(STEPS, Math.max(0, theta / dTheta))
    const j = Math.floor(x)
    const lo = cum[j] ?? 0
    const hi = cum[Math.min(STEPS, j + 1)] ?? lo
    return lo + (hi - lo) * (x - j)
  }
  const angleAt = (targetArc: number): number => {
    for (let j = 1; j <= STEPS; j++) {
      const cumJ = cum[j]
      const cumPrev = cum[j - 1]
      if (cumJ !== undefined && cumPrev !== undefined && cumJ >= targetArc) {
        return ((j - 1) + (targetArc - cumPrev) / (cumJ - cumPrev)) * dTheta
      }
    }
    return Math.PI / 2
  }
  // Inset both ends of the arc, then place the four cells equal-arc inside it.
  const inset = (CELL_INSET_DEG * Math.PI) / 180
  const arcLo = arcAt(inset)
  const arcSpan = arcAt(Math.PI / 2 - inset) - arcLo
  const brAngles: number[] = []
  for (let i = 0; i < N_CELLS; i++) {
    brAngles.push(angleAt(arcLo + ((i + 0.5) * arcSpan) / N_CELLS))
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
// speed — only the span differs. Tuned snappy: central + cells fade out
// together (~220ms), then this sweep clocks the new cells back in.
const ENTER_SWEEP_MS = 500
const ENTER_STEP_MS = ENTER_SWEEP_MS / 16

// First reveal = the transition INTO VIEW_4 → one continuous clockwise sweep
// across the whole oval. Every later central-image change reveals each
// quadrant's own 4 cells with all four quadrants running CONCURRENTLY (~¼
// the time, same per-cell step).
const isFirstReveal = ref(true)
// VIEW_4 initial mount coming from the VIEW_3 preview: the images were
// already revealed there, so suppress this component's on-mount clockwise
// sweep AND the corner-label announce-glow. Only true for the very first
// mount; the watch below clears it on the first central-image change so
// later activations reveal normally. Never set in preview mode itself.
const suppressMountReveal = ref(!props.preview && store.relationsPreRevealed)
watch(centralImageId, () => { isFirstReveal.value = false; suppressMountReveal.value = false })

function enterDelay(slotIdx: number): string {
  const pos = props.position ?? 'tl'
  if (!props.preview && isFirstReveal.value) {
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

// The overview finale dissolve fades EVERY cell out together — the per-cell
// clockwise `--dissolve-delay` sweep was removed, so there's no longer a
// `dissolveDelay()` helper. The fade is a plain CSS opacity transition (see
// `.finale-dissolve .cell`). (The VIEW_3 central-image click no longer touches
// the cells at all — only the quadrant texts fade.)

function onRelatedClick(id: string) {
  if (props.preview) return
  // Pass this quadrant so project can colour the new path segment by quadrant.
  store.activateCentral(id, QUADRANT_INDEX[props.position ?? 'tl'])
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
// Hover sound — fires on every relation-view image hover. This handler
// early-returns in VIEW_3 preview mode, so the sound is scoped to the
// relational view (VIEW_4). The composable is generic (any view can reuse it
// for any /sounds/*.wav); only this hover plays a clip today.
const HOVER_SOUND = '/sounds/hover.wav'
const { load: loadSound, play: playSound } = useSound()
onMounted(() => { if (!props.preview) loadSound(HOVER_SOUND) })

function onCellHover(id: string, slotIdx: number) {
  if (props.preview) return
  playSound(HOVER_SOUND)
  store.setHighlight(id)
  // Ghost path — dashed translucent line from active central image to
  // this cell's id, drawn on every project canvas. Previews the proximity
  // link before commit. Cleared on cell-leave (fades out ~150ms).
  store.setGhostPath(id)
  // Track the hovered cell so the radial words can render along the line
  // between this cell and the centred image (see `radialWords`).
  hoveredCell.value = { id, slotIdx }
}
function onCellLeave() {
  store.setHighlight(null)
  store.setGhostPath(null)
  hoveredCell.value = null
}

// ── Hover state ──
// The currently-hovered cell (id + slot), its subject (Source), and its radial
// offset. These feed the radial word layout below (see `radialWords`).
const hoveredCell = ref<{ id: string; slotIdx: number } | null>(null)
const hoveredSubject = computed(() =>
  hoveredCell.value ? (data.value?.subjects?.[hoveredCell.value.id] ?? null) : null,
)
const hoveredOffset = computed(() =>
  hoveredCell.value
    ? CELL_OFFSETS.value[props.position ?? 'tl'][hoveredCell.value.slotIdx]
    : null,
)

// ── 3-tag selection: 2 own + 1 rotating shared (Semantic + Form) ──
// Drives BOTH the Semantic and Form quadrants: both receive tags from
// umap_semantic_llm.json (Form borrows them by id — see COMPONENT_TAG_FILES),
// so the identical rule below selects keywords for each. `centralTags` is the
// centred image's semantic tags in both cases.
// Each image shows 2 of its OWN distinctive tags (not shared with the centre)
// for diversity, plus 1 SHARED tag (the proximity link). The shared slot
// rotates across the 4 images and avoids the most-shared / dominant tag, so
// the four labels don't all repeat e.g. `linear`. Both groups are ordered by
// a diversity score so the quadrant collides as little as possible:
//   picked : how many sibling cells already use this tag → rotate / avoid repeats
//   batch  : how many of the 4 neighbors carry it        → rare-in-quadrant
//            (this is what pushes the *most-shared* tag to the back)
//   freq   : global frequency                            → less dominant
//   idx    : original order                              → stable tiebreak
// Availability fallbacks keep the total at 3: a shared-heavy image (≤1 own)
// borrows extra shared tags; an image with no shared tag (~9%) shows 3 own.
// The shared tag sits on the MIDDLE line, owns above and below (own · shared · own).
// Computed for all 4 cells together (deterministic, hover-independent); the
// hovered cell just reads its slice.
const OWN_TARGET = 2
const TOTAL_TAGS = 3
const tagSelection = computed<Record<string, string[]>>(() => {
  const tagsMap = data.value?.tags
  const central = data.value?.centralTags
  if (!tagsMap || !central) return {}
  const centralSet = new Set(central)
  const freq = data.value?.tagFreq ?? {}
  const batchIds = cells.value.map((c) => c.id).filter((id) => tagsMap[id]?.length)
  if (batchIds.length === 0) return {}

  // How many of the displayed neighbors carry each tag (quadrant frequency).
  const batchCount: Record<string, number> = {}
  for (const id of batchIds) {
    for (const t of tagsMap[id]!) batchCount[t] = (batchCount[t] ?? 0) + 1
  }

  const picked: Record<string, number> = {}
  type Tagged = { t: string; idx: number }
  const score = (a: Tagged, b: Tagged) =>
    (picked[a.t] ?? 0) - (picked[b.t] ?? 0) ||
    (batchCount[a.t] ?? 0) - (batchCount[b.t] ?? 0) ||
    (freq[a.t] ?? 0) - (freq[b.t] ?? 0) ||
    a.idx - b.idx

  const out: Record<string, string[]> = {}
  for (const id of batchIds) {
    const tagged: Tagged[] = tagsMap[id]!.map((t, idx) => ({ t, idx }))
    const own = tagged.filter((x) => !centralSet.has(x.t)).sort(score)
    const shared = tagged.filter((x) => centralSet.has(x.t)).sort(score)

    const chosen: string[] = []
    const take = (list: Tagged[], n: number) => {
      for (const x of list) {
        if (chosen.length >= n) break
        if (!chosen.includes(x.t)) chosen.push(x.t)
      }
    }
    take(own, OWN_TARGET) // 2 own (distinctive traits) first
    take(shared, OWN_TARGET + 1) // then 1 rotating, non-dominant shared
    take(shared, TOTAL_TAGS) // fallbacks if a group ran short:
    take(own, TOTAL_TAGS) //   borrow extra shared, then extra own

    // Centre the shared tag on the middle line — owns split around the shared
    // block (e.g. own · shared · own).
    const finalTags = chosen.slice(0, TOTAL_TAGS)
    const sharedSel = finalTags.filter((t) => centralSet.has(t))
    const ownSel = finalTags.filter((t) => !centralSet.has(t))
    const before = Math.ceil(ownSel.length / 2)
    const ordered = [...ownSel.slice(0, before), ...sharedSel, ...ownSel.slice(before)]
    out[id] = ordered
    for (const t of ordered) picked[t] = (picked[t] ?? 0) + 1
  }
  return out
})
const hoveredTags = computed(() =>
  hoveredCell.value ? (tagSelection.value[hoveredCell.value.id] ?? null) : null,
)

// ── Radial word layout (Source + Semantic) ──
// The hover words are spread ALONG the radial line from the centred image out
// to the hovered cell (same angle the cell sits at) and rotated to follow that
// line — a "beads on the radius" effect. `--frac` is each word's distance along
// the centre→cell vector (0 = centre, 1 = cell).
//   Semantic     → own (inner) · shared (middle) · own (outer)
//   Source       → central image's subject (inner) · hovered subject (outer)
//   Time → the common (shared) year, single value at the middle
const RADIAL_FRACTIONS_3 = [0.32, 0.5, 0.68] // own · shared · own
const RADIAL_FRACTIONS_2 = [0.4, 0.6] // central subject · hovered subject

// On-screen angle of the centre→cell line, in degrees, computed from the real
// pixel vector (the ellipse semi-axes scale x by vw and y by vh, so the screen
// angle isn't the raw polar angle). Flipped into [-90, 90] so glyphs stay
// upright (a line and its 180° opposite are the same line).
const hoveredAngleDeg = computed(() => {
  if (!hoveredCell.value) return 0
  const pos = props.position ?? 'tl'
  const a = cellArcAnglesByQuadrant.value[pos][hoveredCell.value.slotIdx] ?? 0
  const theta = (QUADRANT_BASE_DEG[pos] * Math.PI) / 180 + a
  const px = RX * Math.cos(theta) * viewportSize.value.w
  const py = RY * Math.sin(theta) * viewportSize.value.h
  let deg = (Math.atan2(py, px) * 180) / Math.PI
  if (deg > 90) deg -= 180
  else if (deg < -90) deg += 180
  return deg
})

// The ordered words for the hovered cell + their radial fraction. Tags take
// priority (Semantic); otherwise the subject pair (Source). Empty → nothing
// renders.
const radialWords = computed<{ key: string; text: string; frac: number }[]>(() => {
  if (!hoveredCell.value) return []
  const tags = hoveredTags.value
  if (tags?.length) {
    const fr = tags.length === 3 ? RADIAL_FRACTIONS_3 : tags.map((_, i) => (i + 1) / (tags.length + 1))
    return tags.map((t, i) => ({ key: `tag-${i}-${t}`, text: t, frac: fr[i] ?? 0.5 }))
  }
  const hov = hoveredSubject.value
  if (hov) {
    const central = data.value?.centralSubject
    const words = central ? [central, hov] : [hov]
    const fr = words.length === 2 ? RADIAL_FRACTIONS_2 : [0.5]
    return words.map((t, i) => ({ key: `subj-${i}`, text: t, frac: fr[i] ?? 0.5 }))
  }
  // Time: the common year (single value, centred on the line).
  const year = data.value?.years?.[hoveredCell.value.id]
  if (year) return [{ key: `year-${year}`, text: year, frac: 0.5 }]
  return []
})

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

// In preview mode (VIEW_3) the cells stay hidden until this quadrant's cross
// is clicked (its canvasZoomed flag flips). Outside preview the cells are
// always "revealed" (their visibility follows the normal latent/hover
// grammar). Drives the `.preview-revealed` class → the clockwise reveal.
const revealed = computed(() =>
  props.preview ? !!store.canvasZoomed[QUADRANT_INDEX[props.position ?? 'tl']] : true,
)

function onMouseEnter(e: MouseEvent) {
  // Preview cells are non-interactive — no hover-zoom, no reveal-direction.
  if (props.preview) return
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
    :class="{
      'is-inert': interpretationActive,
      'is-frozen': store.overviewFinaleActive,
      'finale-fadeout': store.overviewFinalePhase === 'fadeout',
      'is-preview': preview,
      'no-entrance': suppressMountReveal,
    }"
    :data-position="position ?? 'tl'"
    :data-reveal="revealDirection"
    @mouseenter="onMouseEnter"
  >
    <!-- VIEW_3 (preview) owns its own corner labels in View3Transition; this
         component's label is only rendered in the relational view. -->
    <span v-if="!preview" class="corner-label" :data-position="position ?? 'tl'">{{ label }}</span>

    <div v-if="!centralImageId" class="status">no central image</div>
    <!-- Loading is silent — no "querying…" text. The empty branch keeps the
         constellation hidden until data lands, so the entrance plays cleanly
         on fresh cells (blank → clockwise reveal). -->
    <div v-else-if="pending" class="status" aria-hidden="true" />
    <div v-else-if="error" class="status error">error</div>

    <!-- TransitionGroup so that when the central image changes (new cell
         set), all leaving cells fade out simultaneously alongside the
         central image's own fade-out — instead of vanishing instantly
         then leaving a beat before the new cells clock in. The
         cell-reveal-in animation still drives the new cells' entrance
         (per-cell clockwise stagger); the TransitionGroup adds only the
         coordinated leave. -->
    <TransitionGroup
      v-else
      name="cell-fade"
      tag="div"
      class="constellation"
      :class="{
        suppressed: interpretationActive,
        hidden: store.overviewConfirmed,
        'central-revealed': store.centralHovered,
        'finale-bright': store.overviewFinalePhase === 'bright',
        'finale-dissolve':
          store.overviewFinalePhase === 'dissolve' || store.overviewFinalePhase === 'fadeout',
        'is-preview': preview,
        'preview-revealed': preview && revealed,
        'no-entrance': suppressMountReveal,
      }"
    >
      <button
        v-for="cell in cells"
        :key="cell.id"
        :class="['cell', `cell-${cell.slotIdx + 1}`]"
        :style="{
          '--cell-x': CELL_OFFSETS[position ?? 'tl'][cell.slotIdx]?.x,
          '--cell-y': CELL_OFFSETS[position ?? 'tl'][cell.slotIdx]?.y,
          '--cell-w': cellWidthVmin(cell.id),
          '--enter-delay': enterDelay(cell.slotIdx),
        }"
        :title="cell.id"
        @click="onRelatedClick(cell.id)"
        @mouseenter="onCellHover(cell.id, cell.slotIdx)"
        @mouseleave="onCellLeave"
      >
        <span class="cell-reveal">
          <AtlasThumb :id="cell.id" fit="width" source="original" />
        </span>
      </button>
    </TransitionGroup>

    <!-- Hover radial words — the hover words spread ALONG the centre→cell line
         and rotated to follow it (Source: centre subject · hovered subject;
         Semantic: own · shared · own). Teleported to a top-level fixed overlay
         so they're never clipped by `.rel`'s overflow and always paint above
         the central image deck. Anchored at the viewport centre; each word is
         placed at its `--frac` along the centre→cell vector (`--cell-x/y`) and
         the inner span rotates by the line's `--angle`. -->
    <Teleport to="body">
      <Transition name="subject-fade">
        <div
          v-if="!preview && radialWords.length"
          class="radial-words"
          :style="{
            '--cell-x': hoveredOffset?.x,
            '--cell-y': hoveredOffset?.y,
            '--angle': `${hoveredAngleDeg}deg`,
          }"
          aria-hidden="true"
        >
          <span
            v-for="w in radialWords"
            :key="w.key"
            class="radial-word"
            :style="{ '--frac': w.frac }"
          ><span class="radial-word-inner">{{ w.text }}</span></span>
        </div>
      </Transition>
    </Teleport>

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
   Locally we only bump the z-index above the cells. (No glow pulse — the
   labels are already revealed per-quadrant in VIEW_3 and the animated
   text-shadow swell was removed everywhere for paint cost.) */
.corner-label {
  /* Above the cells AND above the interpretation veil (.interpret-veil,
     z: 5) so the Source / Form / Semantic / Time tags stay crisp
     and visible in interpretation mode rather than being blurred away. */
  z-index: 6;
}

/* Overview finale `fadeout` phase — the corner labels fade out TOGETHER with
   the central deck (`.center-anchor.deck-fadeout`) and the grid cross
   (`.view-3.finale-fadeout::before`), all starting at the end of the 700ms
   clock-effect dissolve. 700ms matches OVERVIEW_FADEOUT_MS / the deck fade so
   the three leave in lockstep, before the grid is unmounted at confirm. */
.rel.finale-fadeout .corner-label {
  opacity: 0;
  transition: opacity 700ms ease-out;
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
   brief bright hold), then fades out — ALL CELLS TOGETHER (the clockwise
   sweep was removed) over OVERVIEW_DISSOLVE_MS (= 600ms in interaction.ts).
   Ends with everything gone; the deck then fades and the contributed circle
   reveals. Overrides the latent/hover opacity; interaction is frozen via
   `.rel.is-frozen`. Pure appearance — these only touch opacity, the cells'
   geometry/transform is untouched. */
.constellation.finale-bright .cell {
  opacity: 1;
  transition: opacity 250ms ease-out;
}
.constellation.finale-dissolve .cell {
  opacity: 0;
  /* Uniform fade to 0 (no per-cell delay). Duration matches
     OVERVIEW_DISSOLVE_MS in interaction.ts so the cells are fully gone when
     the deck/cross/labels fadeout begins. */
  transition: opacity 600ms ease-out;
}

.cell {
  position: absolute;
  /* Per-image balanced width (naturalDimsVmin × QUADRANT_SCALE, bound inline);
     height follows the image aspect via AtlasThumb fit="width". Fallback keeps
     a sane size before the atlas resolves. */
  width: var(--cell-w, 16vmin);
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
  /* Hover scale matches the end circle's images: grow quickly on hover (see
     the :hover transition override below) and settle back slowly with an
     ease-in-out — the same `transform 900ms cubic-bezier(0.45,0,0.55,1)` the
     circle layers use at rest. (Position is constant per cell, so this 900ms
     only governs the hover scale return, never a layout move.) */
  transition:
    opacity 260ms ease-out var(--reveal-delay, 0ms),
    transform 900ms cubic-bezier(0.45, 0, 0.55, 1),
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
  animation: cell-reveal-in 280ms ease-out var(--enter-delay, 0ms) backwards;
}

/* TransitionGroup leave — all leaving cells fade out simultaneously over
   the same window as CentralImage's layer-fade-leave, so the central
   image and its surrounding cells disappear together as one beat. New
   cells appear right after with the clockwise sweep. */
.cell-fade-leave-active {
  transition: opacity 220ms ease-out;
}
.cell-fade-leave-to {
  opacity: 0;
}
@keyframes cell-reveal-in {
  from { opacity: 0; transform: scale(0.6); }
  to   { opacity: 1; transform: scale(1); }
}

/* ── VIEW_3 preview mode ──
   Non-interactive suggestion preview. Cells stay hidden until this quadrant's
   cross is clicked (`.preview-revealed`, gated on store.canvasZoomed), then
   clock in per-quadrant (clockwise) and SETTLE to the latent resting opacity
   (0.05 — the `.cell` default, i.e. how they sit in VIEW_4 until hover). They
   stay at that latent opacity on the central-image click (no flash/dissolve)
   and carry into VIEW_4. The on-mount keyframe is disabled here; the reveal is
   a transition driven by the `.preview-revealed` class so it fires on the cross
   click, not on mount. */
.rel.is-preview { pointer-events: none; }
.rel.is-preview .cell {
  pointer-events: none;
}
.constellation.is-preview .cell-reveal {
  animation: none;
  opacity: 0;
  transform: scale(0.6);
  transition:
    opacity 280ms ease-out var(--enter-delay, 0ms),
    transform 280ms ease-out var(--enter-delay, 0ms);
}
.constellation.is-preview.preview-revealed .cell-reveal {
  opacity: 1;
  transform: scale(1);
}
/* On the central-image click the preview cells no longer flash or dissolve —
   they stay at their latent resting opacity (0.05) and carry into VIEW_4. Only
   the quadrant texts fade out (see View3Transition `.quadrant-text.dissolving`
   + `clearCanvasTexts()`). The former `.preview-flash` / `.preview-dissolve`
   rules were removed. */

/* ── VIEW_4 initial mount from the preview ──
   The images were already revealed in VIEW_3, so suppress this mount's
   clockwise sweep — cells appear at their resting latent state immediately;
   the VIEW_3 → VIEW_4 cross-fade blends the visible preview into the latent
   field. Cleared on the first central-image change, so later activations
   reveal normally. (Corner labels carry no glow anymore, so nothing to
   suppress there.) */
.constellation.no-entrance .cell-reveal { animation: none; }

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
  /* Same growth as the end circle's hovered image (SCALE_HOVER / SCALE_OTHER =
     0.95 / 0.85 ≈ +12%) and the same responsive grow curve the circle uses on
     hover (`.layer.is-highlighted` → transform 250ms cubic-bezier(0.22,0.61,
     0.36,1)). On leave the base 900ms ease-in-out takes over. */
  --cell-scale: 1.118;
  transition:
    opacity 260ms ease-out,
    transform 250ms cubic-bezier(0.22, 0.61, 0.36, 1),
    box-shadow 200ms ease-out,
    border-color 200ms ease-out;
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

/* ── hover radial words ──
   Hover words spread ALONG the centre→cell line and rotated to follow it
   (Source: centre subject · hovered subject; Semantic: own · shared · own).
   Teleported to <body>: `.radial-words` is a full-viewport fixed overlay
   (high z-index → always on top, never clipped by `.rel`'s overflow). Each
   `.radial-word` is anchored at the viewport centre and pushed to its `--frac`
   along the centre→cell vector (`--cell-x/y`, already signed per quadrant),
   recentred on that point; the inner span rotates by `--angle` so the words
   read along the radius (positioning stays in screen space, separate from the
   rotation). The dense blue text-shadow matches the rotate captions. */
.radial-words {
  position: fixed;
  inset: 0;
  z-index: 90;
  pointer-events: none;
}
.radial-word {
  position: absolute;
  top: 50%;
  left: 50%;
  --frac: 0.5;
  transform:
    translate(
      calc(var(--cell-x, 0) * var(--frac)),
      calc(var(--cell-y, 0) * var(--frac))
    )
    translate(-50%, -50%);
}
.radial-word-inner {
  display: inline-block;
  white-space: nowrap;
  font-size: 0.8rem;
  font-style: italic;
  letter-spacing: 0.015em;
  line-height: 1.1;
  color: #595b54;
  transform: rotate(var(--angle, 0deg));
  transform-origin: center center;
  /* Opaque blue backing hugging the glyphs — same layered stroke as the
     rotate captions (.final-caption .caption-text in View4Relational). */
  text-shadow:
    0 0 4px var(--rotate-panel-bg, rgba(170, 180, 194, 0.9)),
    0 0 6px var(--rotate-panel-bg, rgba(170, 180, 194, 0.9)),
    0 0 6px var(--rotate-panel-bg, rgba(170, 180, 194, 0.9)),
    0 0 9px var(--rotate-panel-bg, rgba(170, 180, 194, 0.9)),
    0 0 9px var(--rotate-panel-bg, rgba(170, 180, 194, 0.9)),
    0 0 12px var(--rotate-panel-bg, rgba(170, 180, 194, 0.9)),
    0 0 12px var(--rotate-panel-bg, rgba(170, 180, 194, 0.9)),
    0 0 15px var(--rotate-panel-bg, rgba(170, 180, 194, 0.9)),
    0 0 18px var(--rotate-panel-bg, rgba(170, 180, 194, 0.9));
}

.subject-fade-enter-active,
.subject-fade-leave-active {
  transition: opacity 150ms ease-out;
}
.subject-fade-enter-from,
.subject-fade-leave-to {
  opacity: 0;
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
