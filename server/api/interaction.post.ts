import { defineEventHandler, readBody, createError } from 'h3'
import { ensureSession } from '~~/server/utils/session'
import { recordEvent } from '~~/server/utils/eventLog'
import type { InteractionEvent } from '~~/app/types/events'

function isValidEvent(input: unknown): input is InteractionEvent {
  if (!input || typeof input !== 'object') return false
  const e = input as Record<string, unknown>
  if (typeof e.clientTimestamp !== 'number') return false

  switch (e.type) {
    case 'view_advance':
      return typeof e.from === 'string' && typeof e.to === 'string'
    case 'central_activate':
      return (
        typeof e.imageId === 'string' &&
        (e.source === 'initial' || e.source === 'related') &&
        typeof e.historyIndex === 'number'
      )
    case 'history_step_back':
    case 'history_step_forward':
    case 'history_jump':
      return (
        typeof e.fromIndex === 'number' &&
        typeof e.toIndex === 'number' &&
        typeof e.toImageId === 'string'
      )
    case 'overview_confirm':
      return typeof e.imageId === 'string' && typeof e.historyIndex === 'number'
    default:
      return false
  }
}

export default defineEventHandler(async (h3event) => {
  const sessionId = ensureSession(h3event)
  const body = await readBody(h3event)

  if (!isValidEvent(body)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid event shape' })
  }

  const logged = recordEvent(sessionId, body)

  return {
    ok: true,
    sessionId,
    serverTimestamp: logged.serverTimestamp,
  }
})
