import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ImageId } from '~/types/interaction'
import { useInteractionEmitter } from '~/composables/useInteractionEmitter'
import { useProjectSocket } from '~/composables/useProjectSocket'
import { useViewStateStore } from '~/stores/viewState'

const OVERVIEW_THRESHOLD = 10

export const useInteractionStore = defineStore('interaction', () => {
  const { emit } = useInteractionEmitter()
  const projectSocket = useProjectSocket()
  const viewState = useViewStateStore()

  const navigationHistory = ref<ImageId[]>([])
  const historyIndex = ref(-1)
  const activeCentralImageId = ref<ImageId | null>(null)

  // Visual deck used by `CentralImage`. Mirrors `navigationHistory` (the
  // bounded mutable active branch), with a VIEW-2 fallback to the just-
  // selected image while `navigationHistory` is still empty.
  //
  // - history nav (stepBack/stepForward/jumpToHistory) does NOT mutate
  //   `navigationHistory`; the component lifts `centralStackActiveIndex`
  //   (= historyIndex) to the top z-index so the active image visually
  //   comes back on top while the others remain staggered behind.
  // - new mid-branch selection truncates `navigationHistory` forward
  //   and appends — `centralStack` reflects that automatically, matching
  //   the `path-truncate` analogue on the project-side path.
  //
  // Interface-only — never on the wire.
  const centralStack = computed<ImageId[]>(() => {
    if (navigationHistory.value.length > 0) return navigationHistory.value
    if (activeCentralImageId.value) return [activeCentralImageId.value]
    return []
  })
  const centralStackActiveIndex = computed<number>(() => {
    if (navigationHistory.value.length > 0) return historyIndex.value
    return 0
  })

  const imageClick = ref(0)
  const overviewConfirmed = ref(false)

  const view3InterpretationMode = ref(false)

  const canvasBackground = ref<'black' | 'gradient'>('gradient')

  // Set by `enterRelationalView` when the VIEW_3 → VIEW_4 trigger (the
  // "next" chevron after the four-quadrant zoom-in flow) fires, consumed by
  // View4Relational's reveal-overlay animation.
  const view2ExitReason = ref<'auto' | 'skip' | null>(null)

  // Per-canvas zoom-in tracking for VIEW_3. Each entry flips to `true` once
  // the user clicks the corresponding quadrant cross — that emits
  // `set-canvas-zoom` so the standalone project zooms canvas[i] from the
  // overview cameraZ to split's cameraZ on the selected image. When all
  // four are true the "next" chevron appears, and clicking it advances to
  // VIEW_4 with project visually already in split.
  const canvasZoomed = ref<boolean[]>([false, false, false, false])
  const allCanvasesZoomed = computed(() => canvasZoomed.value.every(Boolean))

  function zoomCanvas(canvasIndex: number) {
    if (!viewState.is('TRANSITION')) return
    if (canvasIndex < 0 || canvasIndex > 3) return
    if (canvasZoomed.value[canvasIndex]) return
    const id = activeCentralImageId.value
    if (!id) return
    canvasZoomed.value = canvasZoomed.value.map((v, i) => i === canvasIndex ? true : v)
    projectSocket.setCanvasZoom(canvasIndex, id)
  }

  const historyHasPrevious = computed(() => historyIndex.value > 0)
  const historyHasForward = computed(
    () => historyIndex.value >= 0 && historyIndex.value < navigationHistory.value.length - 1,
  )

  const overviewEligible = computed(
    () => historyIndex.value + 1 >= OVERVIEW_THRESHOLD && !overviewConfirmed.value,
  )

  function enterEntryView() {
    if (!viewState.is('EXPLANATION')) return
    const from = viewState.current
    viewState.advance()
    emit({
      type: 'view_advance',
      from,
      to: viewState.current,
      clientTimestamp: Date.now(),
    })
    // Hidden-morph on the project screen: fade mask to opaque, swap
    // single → overview behind the cover, fade mask back to reveal the
    // settled overview. EXPLANATION has no in-view hold timer (unlike
    // VIEW-2's 10.5s buffer) so the mask itself bookends the morph
    // symmetrically here.
    const FADE_MS = 400
    const MORPH_MS = 500
    projectSocket.setMask(1, FADE_MS)
    setTimeout(() => projectSocket.setState('overview', MORPH_MS), FADE_MS)
    setTimeout(() => projectSocket.setMask(0, FADE_MS), FADE_MS + MORPH_MS)
  }

  function selectImage(id: ImageId) {
    if (!viewState.is('ENTRY')) return
    activeCentralImageId.value = id
    imageClick.value += 1
    const from = viewState.current
    viewState.advance()
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
      to: viewState.current,
      clientTimestamp: Date.now(),
    })
    // Project stays in `overview` through VIEW_2 → VIEW_3. No mask snap,
    // no state morph here — only bind the camera target to the selection
    // so the eventual overview→split morph (fired on VIEW_3 → VIEW_4)
    // converges on the right image. View-3 auto-advance timer is disabled
    // (no startView2Timer call) per the new flow; the transition out of
    // VIEW_3 will be driven by a future explicit trigger.
    projectSocket.focus(id)
  }

  function enterRelationalView(reason: 'auto' | 'skip' = 'auto') {
    if (!viewState.is('TRANSITION')) return
    view2ExitReason.value = reason
    if (activeCentralImageId.value && navigationHistory.value.length === 0) {
      navigationHistory.value.push(activeCentralImageId.value)
      historyIndex.value = 0
    }
    const from = viewState.current
    viewState.advance()
    emit({
      type: 'view_advance',
      from,
      to: viewState.current,
      clientTimestamp: Date.now(),
    })
    // Instant state-name flip. The four per-canvas zoom-in overrides
    // applied during VIEW_3's cross flow have already brought every
    // canvas to split's cameraZ on the selected image — so flipping the
    // state name with duration 0 produces no visible change here, while
    // still releasing the overrides (cleared on goTo) and unlocking the
    // pan-on-focus behavior project needs for VIEW_4's history nav and
    // relational clicks.
    projectSocket.setState('split', 0)
    if (activeCentralImageId.value) projectSocket.focus(activeCentralImageId.value)
    // Reset per-canvas zoom flags so a future return to VIEW_3 starts
    // clean. (No backward navigation today, but cheap and defensive.)
    canvasZoomed.value = [false, false, false, false]
  }

  function activateCentral(id: ImageId) {
    if (!viewState.is('RELATIONAL')) return
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
    if (!viewState.is('RELATIONAL')) return
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
    if (!viewState.is('RELATIONAL')) return
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
    if (!viewState.is('RELATIONAL')) return
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

  function toggleView3Interpretation() {
    view3InterpretationMode.value = !view3InterpretationMode.value
  }

  function setCanvasBackground(mode: 'black' | 'gradient') {
    canvasBackground.value = mode
    projectSocket.setCanvasBg(mode)
  }

  // Transient perception primitive. Highlights an id on the project canvas
  // (or clears with null). Pure ephemeral feedback channel — does NOT touch
  // navigationHistory, activeCentralImageId, imageClick, view state, or any
  // persisted store value. Any view's hover handler can call this.
  function setHighlight(id: ImageId | null) {
    projectSocket.setHighlight(id)
  }

  return {
    navigationHistory,
    historyIndex,
    activeCentralImageId,
    centralStack,
    centralStackActiveIndex,
    imageClick,
    overviewConfirmed,
    overviewEligible,
    view2ExitReason,
    canvasZoomed,
    allCanvasesZoomed,
    zoomCanvas,
    historyHasPrevious,
    historyHasForward,
    enterEntryView,
    selectImage,
    enterRelationalView,
    activateCentral,
    confirmOverview,
    stepBackInHistory,
    stepForwardInHistory,
    jumpToHistory,
    view3InterpretationMode,
    toggleView3Interpretation,
    canvasBackground,
    setCanvasBackground,
    setHighlight,
  }
})
