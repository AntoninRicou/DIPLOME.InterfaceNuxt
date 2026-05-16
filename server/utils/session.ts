import { getCookie, setCookie, type H3Event } from 'h3'
import { randomUUID } from 'node:crypto'

const COOKIE_NAME = 'ix_session'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24

export function ensureSession(event: H3Event): string {
  const existing = getCookie(event, COOKIE_NAME)
  if (existing) return existing

  const sessionId = randomUUID()
  setCookie(event, COOKIE_NAME, sessionId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
  return sessionId
}
