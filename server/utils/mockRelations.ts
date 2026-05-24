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
  byId: Map<string, UmapPoint>
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
    const byId = new Map<string, UmapPoint>()
    for (const p of points) {
      if (typeof p?.id === 'string') byId.set(p.id, p)
    }
    const dataset: UmapDataset = { componentId, points, byId }
    cache.set(componentId, dataset)
    return dataset
  } catch {
    return null
  }
}

// Euclidean k-nearest-neighbor on (x, y), per-dataset. Ordering is invariant
// to per-dataset scale, so no cross-dataset normalization is needed. Returns
// [] if the centralImageId is not in this dataset — a routine case, since
// the four quadrant datasets do not share id populations.
export function pickRelations(
  dataset: UmapDataset,
  centralImageId: string,
  count = 8,
): string[] {
  const center = dataset.byId.get(centralImageId)
  if (!center) return []

  const cx = center.x
  const cy = center.y
  const distances: Array<{ id: string; d2: number }> = []
  for (const p of dataset.points) {
    if (p.id === centralImageId) continue
    if (typeof p.x !== 'number' || typeof p.y !== 'number') continue
    if (Number.isNaN(p.x) || Number.isNaN(p.y)) continue
    const dx = p.x - cx
    const dy = p.y - cy
    distances.push({ id: p.id, d2: dx * dx + dy * dy })
  }
  distances.sort((a, b) => a.d2 - b.d2)
  return distances.slice(0, count).map((d) => d.id)
}
