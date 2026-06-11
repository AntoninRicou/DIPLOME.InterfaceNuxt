import { useViewStateStore } from '~/stores/viewState'

// Installation idle reset. If the operator/visitor doesn't touch the mouse for
// IDLE_MS, the whole experience reboots back to VIEW_0 — a clean reset for an
// unattended installation. Uses the same full-reload reset as the VIEW_4
// "Start over" button (re-boots the app at VIEW_0, clearing all interaction +
// project state). Client-only (`.client.ts`) — never runs during SSR.
export default defineNuxtPlugin(() => {
  const IDLE_MS = 120_000

  let timer: ReturnType<typeof setTimeout> | null = null

  const reset = () => {
    // Already on the title screen → nothing to reset; just re-arm so we don't
    // flash a needless reload while idling on VIEW_0.
    if (useViewStateStore().current === 'VIEW_0') {
      arm()
      return
    }
    window.location.reload()
  }

  const arm = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(reset, IDLE_MS)
  }

  // Any of these count as "the mouse was touched" and restart the 30s clock.
  // pointer* covers mouse + touch; wheel/keydown are belt-and-braces.
  const ACTIVITY = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart']
  for (const evt of ACTIVITY) {
    window.addEventListener(evt, arm, { passive: true })
  }

  arm()
})
