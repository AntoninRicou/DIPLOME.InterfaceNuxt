import { defineEventHandler, getQuery, getRouterParam, createError } from 'h3'
import { loadRelationDataset, pickRelations } from '~~/server/utils/mockRelations'

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

  const dataset = await loadRelationDataset(componentId)
  if (!dataset) {
    throw createError({ statusCode: 404, statusMessage: `unknown component: ${componentId}` })
  }

  const related = pickRelations(dataset, centralImageId, 8)

  return {
    componentId,
    centralImageId,
    related,
  }
})
