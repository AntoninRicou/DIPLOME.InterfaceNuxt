import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ImageId, ViewState } from '~/types/interaction'
import { useInteractionEmitter } from '~/composables/useInteractionEmitter'
import { useProjectSocket } from '~/composables/useProjectSocket'

const VIEW_ORDER: ViewState[] = ['VIEW_1', 'VIEW_2', 'VIEW_3']
const SPLIT_TRANSITION_MS = 4500
const VIEW_2_AUTO_ADVANCE_MS = SPLIT_TRANSITION_MS
const MASK_REVEAL_MS = 400
const OVERVIEW_THRESHOLD = 10

export const useInteractionStore = defineStore('interaction', () => {
  const { emit } = useInteractionEmitter()
  const projectSocket = useProjectSocket()

  const currentView = ref<ViewState>('VIEW_1')
  const navigationHistory = ref<ImageId[]>([])
  const historyIndex = ref(-1)
  const activeCentralImageId = ref<ImageId | null>(null)

  const imageClick = ref(0)
  const overviewConfirmed = ref(false)

  const view2AutoAdvanceMs = VIEW_2_AUTO_ADVANCE_MS
  const view2RemainingMs = ref(0)
  const view2ExitReason = ref<'auto' | 'skip' | null>(null)

  let view2Timer: ReturnType<typeof setInterval> | null = null
  let view2EnteredAt = 0

  const isInView1 = computed(() => currentView.value === 'VIEW_1')
  const isInView2 = computed(() => currentView.value === 'VIEW_2')
  const isInView3 = computed(() => currentView.value === 'VIEW_3')
  const historyHasPrevious = computed(() => historyIndex.value > 0)
  const historyHasForward = computed(
    () => historyIndex.value >= 0 && historyIndex.value < navigationHistory.value.length - 1,
  )

  const overviewEligible = computed(
    () => historyIndex.value + 1 >= OVERVIEW_THRESHOLD && !overviewConfirmed.value,
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
      if (view2RemainingMs.value <= 0) enterRelationalView('auto')
    }, 50)
  }

  function advanceView() {
    const i = VIEW_ORDER.indexOf(currentView.value)
    if (i < 0 || i >= VIEW_ORDER.length - 1) return
    currentView.value = VIEW_ORDER[i + 1]!
  }

  function selectImage(id: ImageId) {
    if (currentView.value !== 'VIEW_1') return
    activeCentralImageId.value = id
    imageClick.value += 1
    const from = currentView.value
    advanceView()
    startView2Timer()
    emit({
      type: 'central_activate',
      imageId: id,
      source: 'initial',
      historyIndex: 0,
      clientTimestamp: Date.now(),
    })
    emit({
      type: 'view_advance',
      from,
      to: currentView.value,
      clientTimestamp: Date.now(),
    })
    projectSocket.setMask(1, 0)
    projectSocket.setState('split', SPLIT_TRANSITION_MS)
    projectSocket.focus(id)
  }

  function enterRelationalView(reason: 'auto' | 'skip' = 'auto') {
    if (currentView.value !== 'VIEW_2') return
    view2ExitReason.value = reason
    stopView2Timer()
    if (activeCentralImageId.value && navigationHistory.value.length === 0) {
      navigationHistory.value.push(activeCentralImageId.value)
      historyIndex.value = 0
    }
    const from = currentView.value
    advanceView()
    emit({
      type: 'view_advance',
      from,
      to: currentView.value,
      clientTimestamp: Date.now(),
    })
    projectSocket.setMask(0, reason === 'auto' ? MASK_REVEAL_MS : 0)
    if (activeCentralImageId.value) projectSocket.focus(activeCentralImageId.value)
  }

  function activateCentral(id: ImageId) {
    if (currentView.value !== 'VIEW_3') return
    if (activeCentralImageId.value === id) return

    // ── HARD GUARD — terminal OVERVIEW state. No store mutation below. ──
    if (overviewConfirmed.value) {
      emit({
        type: 'central_activate',
        imageId: id,
        source: 'related',
        historyIndex: historyIndex.value,
        clientTimestamp: Date.now(),
      })
      projectSocket.focus(id)
      return
    }

    // ── BRANCH CAP — active branch bounded to OVERVIEW_THRESHOLD entries. ──
    // At the cap, the user must confirm OVERVIEW or step back to make room.
    // Log the attempted activation for telemetry but do not mutate or emit
    // on the project socket — the branch state must not change.
    if (historyIndex.value + 1 >= OVERVIEW_THRESHOLD) {
      emit({
        type: 'central_activate',
        imageId: id,
        source: 'related',
        historyIndex: historyIndex.value,
        clientTimestamp: Date.now(),
      })
      return
    }
    // ── Pre-OVERVIEW, pre-cap only. Provably unreachable otherwise. ──

    const prevId = activeCentralImageId.value!
    const isMidBranch = historyIndex.value < navigationHistory.value.length - 1
    const truncateKeepCount = historyIndex.value

    navigationHistory.value = navigationHistory.value.slice(0, historyIndex.value + 1)
    navigationHistory.value.push(id)
    historyIndex.value = navigationHistory.value.length - 1
    activeCentralImageId.value = id
    imageClick.value += 1
    emit({
      type: 'central_activate',
      imageId: id,
      source: 'related',
      historyIndex: historyIndex.value,
      clientTimestamp: Date.now(),
    })
    if (isMidBranch) projectSocket.pathTruncate(truncateKeepCount)
    projectSocket.focus(id)
    projectSocket.pathSegment(prevId, id)
  }

  function confirmOverview() {
    if (!overviewEligible.value) return
    overviewConfirmed.value = true
    emit({
      type: 'overview_confirm',
      imageId: activeCentralImageId.value!,
      historyIndex: historyIndex.value,
      clientTimestamp: Date.now(),
    })
    projectSocket.setState('overview')
  }

  function stepBackInHistory() {
    if (currentView.value !== 'VIEW_3') return
    if (historyIndex.value <= 0) return
    const fromIndex = historyIndex.value
    historyIndex.value -= 1
    activeCentralImageId.value = navigationHistory.value[historyIndex.value]!
    emit({
      type: 'history_step_back',
      fromIndex,
      toIndex: historyIndex.value,
      toImageId: activeCentralImageId.value,
      clientTimestamp: Date.now(),
    })
    projectSocket.focus(activeCentralImageId.value)
  }

  function stepForwardInHistory() {
    if (currentView.value !== 'VIEW_3') return
    if (historyIndex.value >= navigationHistory.value.length - 1) return
    const fromIndex = historyIndex.value
    historyIndex.value += 1
    activeCentralImageId.value = navigationHistory.value[historyIndex.value]!
    emit({
      type: 'history_step_forward',
      fromIndex,
      toIndex: historyIndex.value,
      toImageId: activeCentralImageId.value,
      clientTimestamp: Date.now(),
    })
    projectSocket.focus(activeCentralImageId.value)
  }

  function jumpToHistory(targetIndex: number) {
    if (currentView.value !== 'VIEW_3') return
    if (targetIndex < 0 || targetIndex >= navigationHistory.value.length) return
    if (targetIndex === historyIndex.value) return
    const fromIndex = historyIndex.value
    historyIndex.value = targetIndex
    activeCentralImageId.value = navigationHistory.value[targetIndex]!
    emit({
      type: 'history_jump',
      fromIndex,
      toIndex: targetIndex,
      toImageId: activeCentralImageId.value,
      clientTimestamp: Date.now(),
    })
    projectSocket.focus(activeCentralImageId.value)
  }

  return {
    currentView,
    navigationHistory,
    historyIndex,
    activeCentralImageId,
    imageClick,
    overviewConfirmed,
    overviewEligible,
    view2AutoAdvanceMs,
    view2RemainingMs,
    view2ExitReason,
    isInView1,
    isInView2,
    isInView3,
    historyHasPrevious,
    historyHasForward,
    selectImage,
    enterRelationalView,
    activateCentral,
    confirmOverview,
    stepBackInHistory,
    stepForwardInHistory,
    jumpToHistory,
  }
})
