import { defineEventHandler, getQuery, getRouterParam, createError } from 'h3'
import { loadUmapDataset, loadSubjectMap, pickRelations } from '~~/server/utils/mockRelations'

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

  const related = pickRelations(dataset, centralImageId, 8)

  // Attach the per-id subject string for components that have a subject
  // source (only component_1 today). Keyed by image id so the client can
  // look it up on hover. Empty object for components without subjects.
  const subjectMap = await loadSubjectMap(componentId)
  const subjects: Record<string, string> = {}
  if (subjectMap) {
    for (const id of related) {
      const s = subjectMap.get(id)
      if (s) subjects[id] = s
    }
  }

  return {
    componentId,
    centralImageId,
    related,
    subjects,
  }
})
