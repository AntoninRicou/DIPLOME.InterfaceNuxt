import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

interface RelationDataset {
  componentId: string
  seed: number
  pool: string[]
}

const cache = new Map<string, RelationDataset>()

export async function loadRelationDataset(componentId: string): Promise<RelationDataset | null> {
  if (cache.has(componentId)) return cache.get(componentId)!
  const path = resolve(process.cwd(), 'assets/mock', `relations_${componentId}.json`)
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as RelationDataset
    cache.set(componentId, parsed)
    return parsed
  } catch {
    return null
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pickRelations(
  dataset: RelationDataset,
  centralImageId: string,
  count = 8,
): string[] {
  const rng = mulberry32(dataset.seed ^ hashString(centralImageId))
  const candidates = dataset.pool.filter((id) => id !== centralImageId)
  const indices = candidates.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j]!, indices[i]!]
  }
  return indices.slice(0, count).map((i) => candidates[i]!)
}
