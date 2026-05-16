import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ImageId, ViewState } from '~/types/interaction'

const VIEW_ORDER: ViewState[] = ['VIEW_1', 'VIEW_2', 'VIEW_3']
const VIEW_2_AUTO_ADVANCE_MS = 3000

export const useInteractionStore = defineStore('interaction', () => {
  const currentView = ref<ViewState>('VIEW_1')
  const selectedImages = ref<ImageId[]>([])
  const navigationHistory = ref<ImageId[]>([])
  const activeCentralImageId = ref<ImageId | null>(null)

  const view2AutoAdvanceMs = VIEW_2_AUTO_ADVANCE_MS
  const view2RemainingMs = ref(0)

  let view2Timer: ReturnType<typeof setInterval> | null = null
  let view2EnteredAt = 0

  const isInView1 = computed(() => currentView.value === 'VIEW_1')
  const isInView2 = computed(() => currentView.value === 'VIEW_2')
  const isInView3 = computed(() => currentView.value === 'VIEW_3')
  const historyHasPrevious = computed(() => navigationHistory.value.length > 1)

  function stopView2Timer() {
    if (view2Timer) {
      clearInterval(view2Timer)
      view2Timer = null
    }
  }

  function startView2Timer() {
    stopView2Timer()
    if (import.meta.server) return
    view2EnteredAt = Date.now()
    view2RemainingMs.value = view2AutoAdvanceMs
    view2Timer = setInterval(() => {
      const elapsed = Date.now() - view2EnteredAt
      view2RemainingMs.value = Math.max(0, view2AutoAdvanceMs - elapsed)
      if (view2RemainingMs.value <= 0) enterRelationalView()
    }, 50)
  }

  function advanceView() {
    const i = VIEW_ORDER.indexOf(currentView.value)
    if (i < 0 || i >= VIEW_ORDER.length - 1) return
    currentView.value = VIEW_ORDER[i + 1]!
  }

  function selectImage(id: ImageId) {
    if (currentView.value !== 'VIEW_1') return
    if (!selectedImages.value.includes(id)) selectedImages.value.push(id)
    activeCentralImageId.value = id
    advanceView()
    startView2Timer()
  }

  function enterRelationalView() {
    if (currentView.value !== 'VIEW_2') return
    stopView2Timer()
    if (activeCentralImageId.value && navigationHistory.value.length === 0) {
      navigationHistory.value.push(activeCentralImageId.value)
    }
    advanceView()
  }

  function activateCentral(id: ImageId) {
    if (currentView.value !== 'VIEW_3') return
    activeCentralImageId.value = id
    if (navigationHistory.value[navigationHistory.value.length - 1] !== id) {
      navigationHistory.value.push(id)
    }
    if (!selectedImages.value.includes(id)) selectedImages.value.push(id)
  }

  function stepBackInHistory() {
    if (currentView.value !== 'VIEW_3') return
    if (navigationHistory.value.length <= 1) return
    navigationHistory.value.pop()
    activeCentralImageId.value =
      navigationHistory.value[navigationHistory.value.length - 1]!
  }

  return {
    currentView,
    selectedImages,
    navigationHistory,
    activeCentralImageId,
    view2AutoAdvanceMs,
    view2RemainingMs,
    isInView1,
    isInView2,
    isInView3,
    historyHasPrevious,
    selectImage,
    enterRelationalView,
    activateCentral,
    stepBackInHistory,
  }
})
