import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ImageId, ViewState } from '~/types/interaction'

const VIEW_ORDER: ViewState[] = ['VIEW_1', 'VIEW_2', 'VIEW_3']
const VIEW_2_AUTO_ADVANCE_MS = 3000

export const useInteractionStore = defineStore('interaction', () => {
  const currentView = ref<ViewState>('VIEW_1')
  const selectedImages = ref<ImageId[]>([])
  const navigationHistory = ref<ImageId[]>([])
  const historyIndex = ref(-1)
  const activeCentralImageId = ref<ImageId | null>(null)

  const view2AutoAdvanceMs = VIEW_2_AUTO_ADVANCE_MS
  const view2RemainingMs = ref(0)

  let view2Timer: ReturnType<typeof setInterval> | null = null
  let view2EnteredAt = 0

  const isInView1 = computed(() => currentView.value === 'VIEW_1')
  const isInView2 = computed(() => currentView.value === 'VIEW_2')
  const isInView3 = computed(() => currentView.value === 'VIEW_3')
  const historyHasPrevious = computed(() => historyIndex.value > 0)
  const historyHasForward = computed(
    () => historyIndex.value >= 0 && historyIndex.value < navigationHistory.value.length - 1,
  )

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
      historyIndex.value = 0
    }
    advanceView()
  }

  function activateCentral(id: ImageId) {
    if (currentView.value !== 'VIEW_3') return
    if (activeCentralImageId.value === id) return
    navigationHistory.value = navigationHistory.value.slice(0, historyIndex.value + 1)
    navigationHistory.value.push(id)
    historyIndex.value = navigationHistory.value.length - 1
    activeCentralImageId.value = id
    if (!selectedImages.value.includes(id)) selectedImages.value.push(id)
  }

  function stepBackInHistory() {
    if (currentView.value !== 'VIEW_3') return
    if (historyIndex.value <= 0) return
    historyIndex.value -= 1
    activeCentralImageId.value = navigationHistory.value[historyIndex.value]!
  }

  function stepForwardInHistory() {
    if (currentView.value !== 'VIEW_3') return
    if (historyIndex.value >= navigationHistory.value.length - 1) return
    historyIndex.value += 1
    activeCentralImageId.value = navigationHistory.value[historyIndex.value]!
  }

  function jumpToHistory(targetIndex: number) {
    if (currentView.value !== 'VIEW_3') return
    if (targetIndex < 0 || targetIndex >= navigationHistory.value.length) return
    historyIndex.value = targetIndex
    activeCentralImageId.value = navigationHistory.value[targetIndex]!
  }

  return {
    currentView,
    selectedImages,
    navigationHistory,
    historyIndex,
    activeCentralImageId,
    view2AutoAdvanceMs,
    view2RemainingMs,
    isInView1,
    isInView2,
    isInView3,
    historyHasPrevious,
    historyHasForward,
    selectImage,
    enterRelationalView,
    activateCentral,
    stepBackInHistory,
    stepForwardInHistory,
    jumpToHistory,
  }
})
