import { loadUmapDataset, loadTagData, loadSubjectMap, loadYearMap } from '~~/server/utils/mockRelations'
import type { UmapPoint } from '~~/server/utils/mockRelations'

// ── Map-words: per-zone characteristic labels for the explore-single view ──
// Four maps get annotated:
//   Form     → 25 semantic keywords (capitalised), most-characteristic-by-lift per 6×6 grid
//   Source   → 17 user-specified subjects, anchored to each book cluster's densest blob
//   Semantic → 25 keywords by lift (same algorithm as Form), from component_3's own tag source
//   Time     → 25 years evenly spread, each anchored to the image nearest its year-cluster centroid

type Label = { id: string; text: string }

// ── FORM: 25 capitalised keywords by lift across a 5×5 grid ──────────────────

const FORM_GRID = 6        // 6×6 = 36 zones → take top 25 after sparse filter
const MIN_POINTS_PER_ZONE = 3
const MIN_WORD_COUNT = 2
const MIN_GLOBAL = 3
const MAX_WORD_LEN = 26
const FORM_TARGET = 25

function capitalise(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

// Drop a label when its plural (text + 's') is also present — keeps "Farm
// animals", removes the redundant singular "Farm animal".
function dedupePlural(labels: Label[]): Label[] {
  const lower = new Set(labels.map((l) => l.text.toLowerCase()))
  return labels.filter((l) => !lower.has(l.text.toLowerCase() + 's'))
}

// Hand-curated removals for the Semantic map (exact, case-insensitive).
const SEMANTIC_EXCLUDE_EXACT = new Set(['armored insect'])

type ZoneOpts = {
  target?: number          // max number of zone labels
  grid?: number            // N×N zone grid
  requireTwoWords?: boolean // only consider tags that are exactly two words
  excludeWords?: string[]  // drop any tag containing one of these (e.g. 'thing')
  rankBy?: 'lift' | 'count' // 'lift' = distinctive; 'count' = most encompassing
  minLift?: number         // when rankBy='count', still require this much over-representation
}

function computeFormZones(points: UmapPoint[], wordsByIndex: string[][], opts: ZoneOpts = {}): Label[] {
  const {
    target = FORM_TARGET,
    grid = FORM_GRID,
    requireTwoWords = false,
    excludeWords = [],
    rankBy = 'lift',
    minLift = 0,
  } = opts
  if (points.length === 0) return []

  const globalFreq = new Map<string, number>()
  let globalTotal = 0
  for (const words of wordsByIndex) {
    for (const w of words) {
      globalFreq.set(w, (globalFreq.get(w) ?? 0) + 1)
      globalTotal++
    }
  }
  if (globalTotal === 0) return []

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
  }
  const cellW = ((maxX - minX) || 1) / grid
  const cellH = ((maxY - minY) || 1) / grid

  const zones: number[][] = Array.from({ length: grid * grid }, () => [])
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    let cx = Math.floor((p.x - minX) / cellW)
    let cy = Math.floor((p.y - minY) / cellH)
    if (cx >= grid) cx = grid - 1
    if (cy >= grid) cy = grid - 1
    zones[cy * grid + cx]!.push(i)
  }

  const used = new Set<string>()
  const labels: Label[] = []

  for (let z = 0; z < zones.length && labels.length < target; z++) {
    const idxs = zones[z]!
    if (idxs.length < MIN_POINTS_PER_ZONE) continue

    const zoneCount = new Map<string, number>()
    let zoneTotal = 0
    for (const i of idxs) {
      for (const w of wordsByIndex[i]!) {
        zoneCount.set(w, (zoneCount.get(w) ?? 0) + 1)
        zoneTotal++
      }
    }
    if (zoneTotal === 0) continue

    let bestWord = '', bestScore = 0
    for (const [w, c] of zoneCount) {
      if (c < MIN_WORD_COUNT || w.length > MAX_WORD_LEN) continue
      // Exactly-two-words filter (e.g. "sea crab") — skip one-word and long phrases.
      if (requireTwoWords && w.trim().split(/\s+/).length !== 2) continue
      // Junk-word filter, e.g. drop "pincher thing", "round thing".
      if (excludeWords.length && excludeWords.some((ex) => w.toLowerCase().includes(ex))) continue
      const g = globalFreq.get(w) ?? 0
      if (g < MIN_GLOBAL || used.has(w)) continue
      const lift = (c / zoneTotal) / (g / globalTotal)
      if (lift < minLift) continue
      // 'count' picks the tag MOST images in the zone share (most encompassing /
      // best summary); 'lift' picks the most distinctive one.
      const score = rankBy === 'count' ? c : lift
      if (score > bestScore) { bestScore = score; bestWord = w }
    }
    if (!bestWord) continue
    used.add(bestWord)

    const zx = z % grid, zy = Math.floor(z / grid)
    const ccx = minX + (zx + 0.5) * cellW
    const ccy = minY + (zy + 0.5) * cellH
    let repId = '', repDist = Infinity
    for (const i of idxs) {
      if (!wordsByIndex[i]!.includes(bestWord)) continue
      const p = points[i]!
      const d = (p.x - ccx) ** 2 + (p.y - ccy) ** 2
      if (d < repDist) { repDist = d; repId = p.id }
    }
    if (repId) labels.push({ id: repId, text: capitalise(bestWord) })
  }

  return labels
}

// ── SOURCE: 17 user-specified subjects centred on their book clusters ─────────
// The last three fill the previously-empty right / bottom of the map (top-right
// nursery cluster, right-mid seeds cluster, bottom botany cluster) for a more
// even spatial spread.

const SOURCE_SUBJECTS = [
  'Biophysics',
  'Embryology',
  'Parasites',
  'Insects',
  'Reproduction',
  'Histology',
  'Crustacea',
  'Horse',
  'Geology',
  'Natural history',
  'Tobacco',
  'Genetics',
  'Gardening',
  'Microscopy',
  'Nursery stock',
  'Seeds',
  'Botany',
]

function computeSourceLabels(
  points: UmapPoint[],
  subjectMap: Map<string, string>,
): Label[] {
  const groups = new Map<string, { xs: number[]; ys: number[]; ids: string[] }>()
  for (const p of points) {
    const s = subjectMap.get(p.id)
    if (!s) continue
    let g = groups.get(s)
    if (!g) { g = { xs: [], ys: [], ids: [] }; groups.set(s, g) }
    g.xs.push(p.x); g.ys.push(p.y); g.ids.push(p.id)
  }

  const labels: Label[] = []
  for (const label of SOURCE_SUBJECTS) {
    const needle = label.toLowerCase()
    let bestKey = '', bestSize = 0
    for (const key of groups.keys()) {
      if (!key.toLowerCase().includes(needle)) continue
      const size = groups.get(key)!.ids.length
      if (size > bestSize) { bestSize = size; bestKey = key }
    }
    const g = bestKey ? groups.get(bestKey) : null
    if (!g) continue

    // Representative: the DENSEST member — the image with the most same-subject
    // neighbours within a local radius — so the label sits on the centre of the
    // cluster's main blob. The mean centroid falls in an empty GAP for spread or
    // multi-modal subjects (e.g. Horse, Natural history), which pushed the label
    // off the visible "circle"; density-seeking fixes that. Radius scales with
    // the group's RMS spread (floored so tight clusters still get a sane window).
    const n = g.ids.length
    const cx = g.xs.reduce((a, b) => a + b, 0) / n
    const cy = g.ys.reduce((a, b) => a + b, 0) / n
    let sd = 0
    for (let i = 0; i < n; i++) sd += (g.xs[i]! - cx) ** 2 + (g.ys[i]! - cy) ** 2
    sd = Math.sqrt(sd / n)
    const r2 = Math.max(0.25, sd * 0.5) ** 2
    let repId = g.ids[0]!, repCount = -1
    for (let i = 0; i < n; i++) {
      let cnt = 0
      for (let j = 0; j < n; j++) {
        const dx = g.xs[i]! - g.xs[j]!, dy = g.ys[i]! - g.ys[j]!
        if (dx * dx + dy * dy <= r2) cnt++
      }
      if (cnt > repCount) { repCount = cnt; repId = g.ids[i]! }
    }
    labels.push({ id: repId, text: label })
  }
  return labels
}

// ── TIME: 25 years evenly spread, each anchored to its year-cluster centroid ──
// Representative per year = image nearest the centroid of all images from that
// year. This naturally places 1753 at the spiral's start and 1986 at its end.
// Restricted to ids in umap_book2 (canvas-1's sprite set — the only full-screen
// canvas in single state; canvas-4 has zero size in single, so Time labels must
// anchor to book2 ids that canvas-1 repositions when it morphs to the spiral).

const TIME_TARGET = 25

function computeTimeLabels(
  points: UmapPoint[],
  yearMap: Map<string, string>,
  book2Ids: Set<string>,
): Label[] {
  // Build year → {xs, ys, ids} for book2-present images only.
  const byYear = new Map<number, { xs: number[]; ys: number[]; ids: string[] }>()
  for (const p of points) {
    if (!book2Ids.has(p.id)) continue
    const y = parseInt(yearMap.get(p.id) ?? '', 10)
    if (isNaN(y)) continue
    let g = byYear.get(y)
    if (!g) { g = { xs: [], ys: [], ids: [] }; byYear.set(y, g) }
    g.xs.push(p.x); g.ys.push(p.y); g.ids.push(p.id)
  }

  const years = [...byYear.keys()].sort((a, b) => a - b)
  if (years.length === 0) return []

  const minY = years[0]!, maxY = years[years.length - 1]!
  // Process order: extremes FIRST (so they are always claimed), then
  // intermediates — this prevents an intermediate target from stealing 1986
  // as its closest year before the last slot can claim it. Final labels are
  // sorted chronologically for display.
  const innerCount = TIME_TARGET - 2
  const innerStep = (maxY - minY) / (innerCount + 1)
  const targets = [
    minY,
    maxY,
    ...Array.from({ length: innerCount }, (_, k) => Math.round(minY + (k + 1) * innerStep)),
  ]

  const labels: Label[] = []
  const usedYears = new Set<number>()

  for (const target of targets) {
    // Find closest actual year not yet used.
    let best = -1, bestDist = Infinity
    for (const y of years) {
      if (usedYears.has(y)) continue
      const d = Math.abs(y - target)
      if (d < bestDist) { bestDist = d; best = y }
    }
    if (best < 0) continue
    usedYears.add(best)
    const g = byYear.get(best)!
    // Representative: image nearest the year-cluster centroid. Naturally places
    // 1753 at the spiral's start and 1986 at its end (each year cluster's centroid
    // sits along the spiral arm for that period).
    const cx = g.xs.reduce((a, b) => a + b, 0) / g.xs.length
    const cy = g.ys.reduce((a, b) => a + b, 0) / g.ys.length
    let repId = g.ids[0]!, repDist = Infinity
    for (let j = 0; j < g.ids.length; j++) {
      const dx = g.xs[j]! - cx, dy = g.ys[j]! - cy
      const d = dx * dx + dy * dy
      if (d < repDist) { repDist = d; repId = g.ids[j]! }
    }
    labels.push({ id: repId, text: String(best) })
  }
  // Sort chronologically so the overlay reads in temporal order.
  return labels.sort((a, b) => parseInt(a.text) - parseInt(b.text))
}

// ── Cache + handler ───────────────────────────────────────────────────────────

let cached: { form: Label[]; source: Label[]; semantic: Label[]; time: Label[] } | null = null

export default defineEventHandler(async () => {
  if (cached) return cached

  // canvas-1 is the only full-screen canvas in single state. Other maps'
  // labels must use book2 ids so they can be anchored on screen.
  const srcData = await loadUmapDataset('component_1')
  const book2Ids = new Set((srcData?.points ?? []).map((p) => p.id))

  // Form: 25 capitalised lift-based keywords, mirror.json coords ∩ book2.
  const formData = await loadUmapDataset('component_2')
  const formTags = await loadTagData('component_2')
  const formPoints = (formData?.points ?? []).filter((p) => book2Ids.has(p.id))
  const form = formData && formTags
    ? computeFormZones(formPoints, formPoints.map((p) => formTags.byId.get(p.id) ?? []))
    : []

  // Source: 14 user-specified subjects centred on their book clusters.
  const srcSubjects = await loadSubjectMap('component_1')
  const source = srcData && srcSubjects
    ? computeSourceLabels(srcData.points, srcSubjects)
    : []

  // Semantic: keywords from component_3's own tag source (umap_semantic_llm.json),
  // semantic coords ∩ book2 so canvas-1 (which morphs to the semantic layout in
  // single) can anchor them. Per zone we take the most ENCOMPASSING two-word tag
  // — the two-word descriptor the most images in the zone share (rankBy 'count'),
  // which best summarises the zone — while still requiring mild over-representation
  // (minLift 1) so it isn't a globally-trivial word. Junk descriptors containing
  // "thing" are dropped. We extract 24 then dedupe singular/plural (drops the
  // redundant "Farm animal", keeping "Farm animals") → 23 labels; the 24th zone
  // that the bump pulls in sits next to the "Flying mouse" zone.
  const semanticData = await loadUmapDataset('component_3')
  const semanticTags = await loadTagData('component_3')
  const semanticPoints = (semanticData?.points ?? []).filter((p) => book2Ids.has(p.id))
  const semantic = semanticData && semanticTags
    ? dedupePlural(computeFormZones(
        semanticPoints,
        semanticPoints.map((p) => semanticTags.byId.get(p.id) ?? []),
        { target: 24, requireTwoWords: true, excludeWords: ['thing'], rankBy: 'count', minLift: 1 },
      )).filter((l) => !SEMANTIC_EXCLUDE_EXACT.has(l.text.toLowerCase()))
    : []

  // Time: 25 evenly-spread years, book2-anchored so canvas-1 can place them.
  const timeData = await loadUmapDataset('component_4')
  const timeYears = await loadYearMap('component_4')
  const time = timeData && timeYears
    ? computeTimeLabels(timeData.points, timeYears, book2Ids)
    : []

  cached = { form, source, semantic, time }
  return cached
})
