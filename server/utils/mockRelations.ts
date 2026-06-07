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
  component_1: 'umap_book2.json',
  component_2: 'mirror.json',
  component_3: 'umap_semantic_llm.json',
  component_4: 'umap_spiral.json',
}

// Per-component "subject" metadata source. The proximity dataset for a
// component carries only (id, x, y); the human-readable subject string for
// each image lives in a separate file (same id population). Only components
// listed here expose subjects — others return an empty map. component_1
// (Source) draws its proximity from the book/subject metadata, so the
// subject is what the hover label surfaces in VIEW_4.
const COMPONENT_SUBJECT_FILES: Record<string, string> = {
  component_1: 'umap_subjects_embeddings2.json',
}

interface SubjectPoint {
  id?: string
  subject?: string
}

const subjectCache = new Map<string, Map<string, string>>()

// Load an id → subject lookup for a component, or null if the component has
// no subject source. Cached by componentId, mirroring loadUmapDataset.
export async function loadSubjectMap(componentId: string): Promise<Map<string, string> | null> {
  if (subjectCache.has(componentId)) return subjectCache.get(componentId)!
  const filename = COMPONENT_SUBJECT_FILES[componentId]
  if (!filename) return null
  const path = resolve(process.cwd(), 'assets/mock', filename)
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as SubjectPoint[] | { points?: SubjectPoint[] }
    const points: SubjectPoint[] = Array.isArray(parsed) ? parsed : (parsed.points ?? [])
    const map = new Map<string, string>()
    for (const p of points) {
      if (typeof p?.id === 'string' && typeof p.subject === 'string') map.set(p.id, p.subject)
    }
    subjectCache.set(componentId, map)
    return map
  } catch {
    return null
  }
}

// Per-component "tags" metadata source. Like subjects, the tag list for each
// image lives in a file (a UMAP that carries a `tags` array of 5 visual
// descriptors per point). Only components listed here expose tags.
//
// Semantic and Form each have their OWN keyword source now: Semantic reads
// `umap_semantic_llm.json` (the same file it resolves proximity from), while
// Form reads `umap_formkeywords_llm.json` (Form-specific keywords; id population
// matches so each Form neighbour's id is looked up there). Form still resolves
// its *proximity* from `mirror.json` (visual structure) — only the tag labels
// come from this file. The client applies the identical own·shared·own
// selection rule to both (see `tagSelection` in RelationComponent.vue), with
// `centralTags` = the centred image's tags from each component's own source.
const COMPONENT_TAG_FILES: Record<string, string> = {
  component_2: 'umap_formkeywords_llm.json', // Form — its own keyword source
  component_3: 'umap_semantic_llm.json',     // Semantic — its own tag source
}

interface TagPoint {
  id?: string
  tags?: string[]
}

export interface TagData {
  // id → its candidate tags (in dataset order)
  byId: Map<string, string[]>
  // tag → global occurrence count across the whole dataset (for "less
  // dominant" ranking on the client)
  freq: Map<string, number>
}

const tagCache = new Map<string, TagData>()

// Load an id → tags lookup (plus global tag frequencies) for a component, or
// null if the component has no tag source. Cached by componentId.
export async function loadTagData(componentId: string): Promise<TagData | null> {
  if (tagCache.has(componentId)) return tagCache.get(componentId)!
  const filename = COMPONENT_TAG_FILES[componentId]
  if (!filename) return null
  const path = resolve(process.cwd(), 'assets/mock', filename)
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as TagPoint[] | { points?: TagPoint[] }
    const points: TagPoint[] = Array.isArray(parsed) ? parsed : (parsed.points ?? [])
    const byId = new Map<string, string[]>()
    const freq = new Map<string, number>()
    for (const p of points) {
      if (typeof p?.id !== 'string' || !Array.isArray(p.tags)) continue
      const tags = p.tags.filter((t): t is string => typeof t === 'string')
      byId.set(p.id, tags)
      for (const t of tags) freq.set(t, (freq.get(t) ?? 0) + 1)
    }
    const data: TagData = { byId, freq }
    tagCache.set(componentId, data)
    return data
  } catch {
    return null
  }
}

// Per-component "year" metadata source. component_4 (Time) now draws
// its proximity from a year-based spiral embedding whose points carry a `year`
// field; the hover label surfaces the (shared) year. Same id population as the
// proximity dataset.
const COMPONENT_YEAR_FILES: Record<string, string> = {
  component_4: 'umap_spiral.json',
}

interface YearPoint {
  id?: string
  year?: number | string
}

const yearCache = new Map<string, Map<string, string>>()

// Load an id → year (as a display string) lookup for a component, or null if
// the component has no year source. Cached by componentId.
export async function loadYearMap(componentId: string): Promise<Map<string, string> | null> {
  if (yearCache.has(componentId)) return yearCache.get(componentId)!
  const filename = COMPONENT_YEAR_FILES[componentId]
  if (!filename) return null
  const path = resolve(process.cwd(), 'assets/mock', filename)
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as YearPoint[] | { points?: YearPoint[] }
    const points: YearPoint[] = Array.isArray(parsed) ? parsed : (parsed.points ?? [])
    const map = new Map<string, string>()
    for (const p of points) {
      if (typeof p?.id !== 'string') continue
      if (typeof p.year === 'number' && Number.isFinite(p.year)) map.set(p.id, String(p.year))
      else if (typeof p.year === 'string' && p.year) map.set(p.id, p.year)
    }
    yearCache.set(componentId, map)
    return map
  } catch {
    return null
  }
}

interface UmapFileWrapper {
  count?: number
  method?: string
  points?: UmapPoint[]
}

// Load + cache a UMAP dataset by its raw filename in assets/mock. Keyed by
// filename so consumers that don't map 1:1 to a relation component (e.g. the
// explore-others replay circles, which read umap_replay.json while canvas-4
// renders umap_spiral.json) can share the same parse + cache path.
const fileCache = new Map<string, UmapDataset>()

export async function loadUmapByFile(filename: string): Promise<UmapDataset | null> {
  if (fileCache.has(filename)) return fileCache.get(filename)!
  const path = resolve(process.cwd(), 'assets/mock', filename)
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as UmapPoint[] | UmapFileWrapper
    const points: UmapPoint[] = Array.isArray(parsed) ? parsed : (parsed.points ?? [])
    const byId = new Map<string, UmapPoint>()
    for (const p of points) {
      if (typeof p?.id === 'string') byId.set(p.id, p)
    }
    const dataset: UmapDataset = { componentId: filename, points, byId }
    fileCache.set(filename, dataset)
    return dataset
  } catch {
    return null
  }
}

// Load the UMAP a relation component renders, resolved through
// COMPONENT_DATASET_FILES. Thin wrapper over loadUmapByFile, cached by
// componentId so an unmapped component still short-circuits to null.
export async function loadUmapDataset(componentId: string): Promise<UmapDataset | null> {
  if (cache.has(componentId)) return cache.get(componentId)!
  const filename = COMPONENT_DATASET_FILES[componentId]
  if (!filename) return null
  const dataset = await loadUmapByFile(filename)
  if (dataset) cache.set(componentId, dataset)
  return dataset
}

// Euclidean k-nearest-neighbor on (x, y), per-dataset. Ordering is invariant
// to per-dataset scale, so no cross-dataset normalization is needed. Returns
// [] if the centralImageId is not in this dataset — a routine case, since
// the four quadrant datasets do not share id populations.
export function pickRelations(
  dataset: UmapDataset,
  centralImageId: string,
  count = 8,
  exclude?: Iterable<string>,
): string[] {
  const center = dataset.byId.get(centralImageId)
  if (!center) return []

  // Ids to skip in addition to the central image itself. Used for VIEW_4
  // history dedup: every image already in the navigation path is excluded so
  // a visited image never reappears as a suggestion. Because we scan the whole
  // dataset, the slice still returns `count` true next-nearest neighbours.
  const skip = exclude ? new Set(exclude) : null

  const cx = center.x
  const cy = center.y
  const distances: Array<{ id: string; d2: number }> = []
  for (const p of dataset.points) {
    if (p.id === centralImageId) continue
    if (skip && skip.has(p.id)) continue
    if (typeof p.x !== 'number' || typeof p.y !== 'number') continue
    if (Number.isNaN(p.x) || Number.isNaN(p.y)) continue
    const dx = p.x - cx
    const dy = p.y - cy
    distances.push({ id: p.id, d2: dx * dx + dy * dy })
  }
  distances.sort((a, b) => a.d2 - b.d2)
  return distances.slice(0, count).map((d) => d.id)
}
