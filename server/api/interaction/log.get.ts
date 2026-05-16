import { defineEventHandler, getQuery } from 'h3'
import { ensureSession } from '~~/server/utils/session'
import { getEventsForSession } from '~~/server/utils/eventLog'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const overrideSession = typeof query.session === 'string' ? query.session : null
  const sessionId = overrideSession ?? ensureSession(event)
  const limit = Number(query.limit) > 0 ? Math.min(Number(query.limit), 200) : 50

  const events = getEventsForSession(sessionId, limit)
  return {
    sessionId,
    count: events.length,
    events,
  }
})
