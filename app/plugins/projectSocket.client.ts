import { useProjectSocket } from '~/composables/useProjectSocket'

export default defineNuxtPlugin(() => {
  const { init } = useProjectSocket()
  init()
})
