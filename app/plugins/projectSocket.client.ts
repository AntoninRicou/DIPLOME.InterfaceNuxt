import { useProjectSocket } from '~/composables/useProjectSocket'
import { useInteractionStore } from '~/stores/interaction'

export default defineNuxtPlugin(() => {
  const {
    init, onRegister, setState, pathClear, setMask, setDim, setCanvasBg, setCanvasVeil,
    setCornerLabels, setCanvasText, setCenterCaption, setMarks, setMarkDim, setMapLabel, setMapWords,
  } = useProjectSocket()
  onRegister(() => {
    pathClear()
    setState('single')
    setMask(0, 0)
    // Defensive: luminosity dimmer off on every (re)connect (a reload mid-dim
    // must not leave the project render window darkened).
    setDim(0, 0)
    // Defensive: interpretation veil off on every (re)connect.
    setCanvasVeil(false)
    const store = useInteractionStore()
    setCanvasBg(store.canvasBackground)
    // Clear any persistent path marks — a reload/reconnect must not carry
    // over a stale lit set from a previous session's overview.
    setMarks([])
    // Mark-dim off on every (re)connect — a reload mid-explore must not boot
    // the fresh single state with non-marked sprites still dimmed.
    setMarkDim(false)
    // Component-title hygiene — none of these may carry over a stale
    // reveal across a session/reload boundary. Defensive: the CSS
    // `:not([data-state="single"])` guard already prevents visible
    // titles in single state, but clearing the underlying data here
    // means a later state change to split/overview won't resurrect a
    // stale reveal that the user never actually triggered this session.
    setCornerLabels(false)
    for (let i = 0; i < 4; i++) setCanvasText(i, '', '')
    setCenterCaption('')
    // Single-explore map label off on every (re)connect, so an interface
    // reload mid-explore can't leak it onto the boot single state.
    setMapLabel(false)
    // Same for the per-zone map-words overlay — clear so onboarding's
    // single-cycle never shows leftover labels.
    setMapWords({ form: [], source: [], semantic: [], time: [] })
  })
  init()
})
