import { useProjectSocket } from '~/composables/useProjectSocket'
import { useInteractionStore } from '~/stores/interaction'

export default defineNuxtPlugin(() => {
  const {
    init, onRegister, setState, pathClear, setMask, setCanvasBg, setCanvasVeil,
    setCornerLabels, setCanvasText, setCenterCaption, setMarks,
  } = useProjectSocket()
  onRegister(() => {
    pathClear()
    setState('single')
    setMask(0, 0)
    // Defensive: interpretation veil off on every (re)connect.
    setCanvasVeil(false)
    const store = useInteractionStore()
    setCanvasBg(store.canvasBackground)
    // Clear any persistent path marks — a reload/reconnect must not carry
    // over a stale lit set from a previous session's overview.
    setMarks([])
    // Component-title hygiene — none of these may carry over a stale
    // reveal across a session/reload boundary. Defensive: the CSS
    // `:not([data-state="single"])` guard already prevents visible
    // titles in single state, but clearing the underlying data here
    // means a later state change to split/overview won't resurrect a
    // stale reveal that the user never actually triggered this session.
    setCornerLabels(false)
    for (let i = 0; i < 4; i++) setCanvasText(i, '', '')
    setCenterCaption('')
  })
  init()
})
