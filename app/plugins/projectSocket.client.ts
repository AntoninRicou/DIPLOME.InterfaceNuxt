import { useProjectSocket } from '~/composables/useProjectSocket'
import { useInteractionStore } from '~/stores/interaction'

export default defineNuxtPlugin(() => {
  const {
    init, onRegister, setState, pathClear, setMask, setDim, setCanvasBg, setCanvasVeil,
    setCornerLabels, setCanvasText, setCenterCaption, setMarks, setMarkDim, setMapLabel, setMapWords,
  } = useProjectSocket()
  onRegister(() => {
    const store = useInteractionStore()
    // SMOOTH reset to the starting `single` state. Same masked choreography as
    // VIEW_2's `morphToOverviewGrid`: fade the feedback screen's CURRENT state
    // out behind the render-mask, snap the whole reset to `single` behind the
    // opaque cover, then fade it back in. So a refresh while the feedback screen
    // sits in split/overview eases to single instead of snapping (a hard jump).
    const FADE_IN_MS = 250
    const MORPH_DELAY_MS = 80
    const FADE_OUT_MS = 400
    setMask(1, FADE_IN_MS) // fade the current state out under the mask
    setTimeout(() => {
      // ── behind the opaque mask: full reset to the starting single state ──
      pathClear()
      // INSTANT snap (duration 0) — like VIEW_2's set-state('overview', 0). Without
      // it, set-state defaults to a 1.5s LAYOUT tween: the 2×2 split grid visibly
      // reshapes into single (containers slide top-left, canvas-1 grows full) and
      // that morph outlasts the mask, so its tail shows on reveal.
      setState('single', 0)
      // Defensive: luminosity dimmer off (a reload mid-dim must not leave the
      // project render window darkened).
      setDim(0, 0)
      // Defensive: interpretation veil off.
      setCanvasVeil(false)
      setCanvasBg(store.canvasBackground)
      // Clear any persistent path marks — a reload/reconnect must not carry
      // over a stale lit set from a previous session's overview.
      setMarks([])
      // Mark-dim off — a reload mid-explore must not boot the fresh single
      // state with non-marked sprites still dimmed.
      setMarkDim(false)
      // Component-title hygiene — none of these may carry over a stale reveal
      // across a session/reload boundary.
      setCornerLabels(false)
      for (let i = 0; i < 4; i++) setCanvasText(i, '', '')
      setCenterCaption('')
      // Single-explore map label off so an interface reload mid-explore can't
      // leak it onto the boot single state.
      setMapLabel(false)
      // Same for the per-zone map-words overlay.
      setMapWords({ form: [], source: [], semantic: [], time: [] })
      // …then reveal the settled single state smoothly.
      setTimeout(() => setMask(0, FADE_OUT_MS), MORPH_DELAY_MS)
    }, FADE_IN_MS + MORPH_DELAY_MS)
  })
  init()
})
