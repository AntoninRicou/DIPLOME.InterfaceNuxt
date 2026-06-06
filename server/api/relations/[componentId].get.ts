import { defineEventHandler, getQuery, getRouterParam, createError } from 'h3'
import { loadUmapDataset, loadSubjectMap, loadTagData, loadYearMap, pickRelations } from '~~/server/utils/mockRelations'

export default defineEventHandler(async (event) => {
  const componentId = getRouterParam(event, 'componentId')
  if (!componentId) {
    throw createError({ statusCode: 400, statusMessage: 'componentId required' })
  }

  const query = getQuery(event)
  const centralImageId = typeof query.centralImageId === 'string' ? query.centralImageId : null
  if (!centralImageId) {
    throw createError({ statusCode: 400, statusMessage: 'centralImageId required' })
  }

  const dataset = await loadUmapDataset(componentId)
  if (!dataset) {
    throw createError({ statusCode: 404, statusMessage: `unknown component: ${componentId}` })
  }

  // `exclude` is a comma-separated list of image ids already in the user's
  // navigation path. pickRelations skips them (in addition to the central
  // image) so a visited image never reappears as a quadrant suggestion —
  // the next-nearest neighbour is returned in its place. Empty/absent → no
  // extra exclusions (e.g. the replay-circles caller).
  const excludeRaw = typeof query.exclude === 'string' ? query.exclude : ''
  const exclude = excludeRaw ? excludeRaw.split(',').filter(Boolean) : []

  const related = pickRelations(dataset, centralImageId, 8, exclude)

  // Attach the per-id subject string for components that have a subject
  // source (only component_1 today). Keyed by image id so the client can
  // look it up on hover. Empty object for components without subjects.
  const subjectMap = await loadSubjectMap(componentId)
  const subjects: Record<string, string> = {}
  let centralSubject = ''
  if (subjectMap) {
    centralSubject = subjectMap.get(centralImageId) ?? ''
    for (const id of related) {
      const s = subjectMap.get(id)
      if (s) subjects[id] = s
    }
  }

  // Attach the candidate tag list per related id and the central image's own
  // tags (component_3 / Semantic AND component_2 / Form — both read tags from
  // umap_semantic_llm.json; see COMPONENT_TAG_FILES), plus the global frequency
  // of each tag involved. The client intersects each neighbor's tags with the
  // central tags to surface the SHARED tags that explain the proximity,
  // ordered rarest-first via tagFreq.
  const tagData = await loadTagData(componentId)
  const tags: Record<string, string[]> = {}
  const tagFreq: Record<string, number> = {}
  let centralTags: string[] = []
  if (tagData) {
    centralTags = tagData.byId.get(centralImageId) ?? []
    for (const tag of centralTags) tagFreq[tag] = tagData.freq.get(tag) ?? 0
    for (const id of related) {
      const t = tagData.byId.get(id)
      if (t) {
        tags[id] = t
        for (const tag of t) tagFreq[tag] = tagData.freq.get(tag) ?? 0
      }
    }
  }

  // Attach the per-id year + the central image's year (only component_4 /
  // Time today, year-based proximity). Neighbors share the centre's
  // year, so this is the "common year" the hover label surfaces.
  const yearMap = await loadYearMap(componentId)
  const years: Record<string, string> = {}
  let centralYear = ''
  if (yearMap) {
    centralYear = yearMap.get(centralImageId) ?? ''
    for (const id of related) {
      const y = yearMap.get(id)
      if (y) years[id] = y
    }
  }

  return {
    componentId,
    centralImageId,
    related,
    subjects,
    centralSubject,
    tags,
    tagFreq,
    centralTags,
    years,
    centralYear,
  }
})
