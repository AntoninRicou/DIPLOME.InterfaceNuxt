import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface UmapPoint {
  id: string
  x: number
  y: number
}

export interface UmapDataset {
  componentId: string
  points: UmapPoint[]
}

const cache = new Map<string, UmapDataset>()

// Each relation component pulls proximity from the same UMAP that the
// corresponding canvas in project renders, so component-N and canvas-N
// share a coordinate space.
const COMPONENT_DATASET_FILES: Record<string, string> = {
  component_1: 'projection_2d.json',
  component_2: 'umap_book2.json',
  component_3: 'umap_subjects_embeddings2.json',
  component_4: 'umap_replay.json',
}

interface UmapFileWrapper {
  count?: number
  method?: string
  points?: UmapPoint[]
}

export async function loadUmapDataset(componentId: string): Promise<UmapDataset | null> {
  if (cache.has(componentId)) return cache.get(componentId)!
  const filename = COMPONENT_DATASET_FILES[componentId]
  if (!filename) return null
  const path = resolve(process.cwd(), 'assets/mock', filename)
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as UmapPoint[] | UmapFileWrapper
    const points: UmapPoint[] = Array.isArray(parsed) ? parsed : (parsed.points ?? [])
    const dataset: UmapDataset = { componentId, points }
    cache.set(componentId, dataset)
    return dataset
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

// Mock proximity: random pick, deterministic by (componentId, centralImageId).
// To be replaced with real Euclidean nearest-neighbor on (x, y) coordinates.
// Endpoint surface stays unchanged.
export function pickRelations(
  dataset: UmapDataset,
  centralImageId: string,
  count = 8,
): string[] {
  const rng = mulberry32(hashString(dataset.componentId) ^ hashString(centralImageId))
  const candidates = dataset.points.filter((p) => p.id !== centralImageId).map((p) => p.id)
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!]
  }
  return candidates.slice(0, count)
}
