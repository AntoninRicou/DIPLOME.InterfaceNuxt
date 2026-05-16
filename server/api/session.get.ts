import { defineEventHandler } from 'h3'
import { ensureSession } from '~~/server/utils/session'

export default defineEventHandler((event) => {
  const sessionId = ensureSession(event)
  return { sessionId }
})
