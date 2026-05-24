import { useProjectSocket } from '~/composables/useProjectSocket'
import { useInteractionStore } from '~/stores/interaction'

export default defineNuxtPlugin(() => {
  const { init, onRegister, setState, pathClear, setMask, setCanvasBg } = useProjectSocket()
  onRegister(() => {
    pathClear()
    setState('single')
    setMask(0, 0)
    const store = useInteractionStore()
    setCanvasBg(store.canvasBackground)
  })
  init()
})
