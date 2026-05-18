import { useProjectSocket } from '~/composables/useProjectSocket'

export default defineNuxtPlugin(() => {
  const { init, onRegister, setState } = useProjectSocket()
  onRegister(() => {
    setState('single')
  })
  init()
})
