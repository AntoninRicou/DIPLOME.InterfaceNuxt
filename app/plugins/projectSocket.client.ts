import { useProjectSocket } from '~/composables/useProjectSocket'

export default defineNuxtPlugin(() => {
  const { init, onRegister, setState, pathClear, setMask } = useProjectSocket()
  onRegister(() => {
    pathClear()
    setState('single')
    setMask(0, 0)
  })
  init()
})
