import { defineEventHandler, getQuery } from 'h3'
import { loadUmapDataset, pickRelations } from '~~/server/utils/mockRelations'

// Build N "existing circles" from the Replay UMAP (component_4) — the same
// proximity data canvas-4 renders. Each circle is a random anchor image plus
// its nearest neighbours, so it reads as another journey through the corpus.
// The interface shows these in the four corners after "See your path"; the
// proximity computation stays server-side (interface never sees coordinates).
const REPLAY_COMPONENT = 'component_4'

// Discard a candidate circle whose id set overlaps an already-accepted one
// by this much or more, so the four corners feel meaningfully different
// rather than near-duplicate neighbourhoods of the same dense region.
const MAX_OVERLAP = 0.7
const MAX_ATTEMPTS = 30

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setB = new Set(b)
  let shared = 0
  for (const id of a) if (setB.has(id)) shared++
  // Overlap relative to the smaller set — catches "one is mostly a subset
  // of the other" even when sizes differ slightly.
  return shared / Math.min(a.length, b.length)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const count = clampInt(query.count, 4, 1, 8)
  const size = clampInt(query.size, 10, 3, 16)

  const dataset = await loadUmapDataset(REPLAY_COMPONENT)
  if (!dataset || dataset.points.length === 0) {
    return { circles: [] }
  }

  const accepted: Array<{ anchorId: string; ids: string[] }> = []
  const usedAnchors = new Set<string>()
  let attempts = 0

  while (accepted.length < count && attempts < count * MAX_ATTEMPTS) {
    attempts++
    const anchor = dataset.points[Math.floor(Math.random() * dataset.points.length)]
    if (!anchor || usedAnchors.has(anchor.id)) continue

    const neighbours = pickRelations(dataset, anchor.id, size - 1)
    const ids = [anchor.id, ...neighbours]
    if (ids.length < size) continue // too few neighbours — skip this anchor

    // Diversity guard — reject near-duplicates of already-accepted circles.
    const tooSimilar = accepted.some((c) => overlap(ids, c.ids) >= MAX_OVERLAP)
    if (tooSimilar) {
      usedAnchors.add(anchor.id) // don't retry this exact anchor
      continue
    }

    usedAnchors.add(anchor.id)
    accepted.push({ anchorId: anchor.id, ids })
  }

  return { circles: accepted }
})

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}
