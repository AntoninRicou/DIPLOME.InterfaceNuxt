import { useProjectSocket } from '~/composables/useProjectSocket'
import { useInteractionStore } from '~/stores/interaction'

export default defineNuxtPlugin(() => {
  const {
    init, onRegister, setState, pathClear, setMask, setCanvasBg,
    setCornerLabels, setCanvasText, setCenterCaption,
  } = useProjectSocket()
  onRegister(() => {
    pathClear()
    setState('single')
    setMask(0, 0)
    const store = useInteractionStore()
    setCanvasBg(store.canvasBackground)
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
