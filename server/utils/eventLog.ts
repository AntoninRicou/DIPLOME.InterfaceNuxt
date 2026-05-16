import type { InteractionEvent, LoggedInteractionEvent } from '~~/app/types/events'

const RING_BUFFER_PER_SESSION = 200

const buffers = new Map<string, LoggedInteractionEvent[]>()

export function recordEvent(
  sessionId: string,
  event: InteractionEvent,
): LoggedInteractionEvent {
  const logged: LoggedInteractionEvent = {
    sessionId,
    serverTimestamp: Date.now(),
    event,
  }

  let buf = buffers.get(sessionId)
  if (!buf) {
    buf = []
    buffers.set(sessionId, buf)
  }
  buf.push(logged)
  if (buf.length > RING_BUFFER_PER_SESSION) buf.shift()

  console.log(`[interaction] ${sessionId.slice(0, 8)} ${event.type}`, event)

  return logged
}

export function getEventsForSession(
  sessionId: string,
  limit?: number,
): LoggedInteractionEvent[] {
  const buf = buffers.get(sessionId) ?? []
  return limit ? buf.slice(-limit) : buf.slice()
}
