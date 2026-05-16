import type { InteractionEvent } from '~/types/events'

export function useInteractionEmitter() {
  function emit(event: InteractionEvent): void {
    if (import.meta.server) return
    $fetch('/api/interaction', {
      method: 'POST',
      body: event,
    }).catch((err) => {
      console.warn('[interaction] emit failed', err)
    })
  }

  return { emit }
}
