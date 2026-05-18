import { useProjectSocket } from '~/composables/useProjectSocket'

export default defineNuxtPlugin(() => {
  const { init, onRegister, setState, pathClear } = useProjectSocket()
  onRegister(() => {
    pathClear()
    setState('single')
  })
  init()
})
