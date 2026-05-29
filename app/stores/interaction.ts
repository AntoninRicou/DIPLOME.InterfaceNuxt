import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ImageId } from '~/types/interaction'
import { useInteractionEmitter } from '~/composables/useInteractionEmitter'
import { useProjectSocket } from '~/composables/useProjectSocket'
import { useViewStateStore } from '~/stores/viewState'
import { view3Interpretations, type View3ComponentId } from '~/view3/view3Interpretations'

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

  // After `confirmOverview`, the user can request a second hidden-morph
  // that drops the standalone project from `overview` back to `single`
  // so the contributed path can be read on the full map. One-shot —
  // flips true on the trigger and stays true (no inverse transition).
  const singlePathViewActive = ref(false)

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

  // VIEW_4 per-quadrant hover. `null` = no quadrant hovered (mouse on the
  // central image or outside the grid) → all four canvases zoomed on the
  // active central image (default split look). When a quadrant index is
  // set, that canvas stays zoomed and the other three unzoom to overview
  // cameraZ.
  const view4HoveredQuadrant = ref<number | null>(null)

  // Mirrors the actual project-side per-canvas state. Updated only when the
  // wire emission has been (or is about to be) sent; the delayed zoom-in
  // path waits for its timer to fire before flipping the flag, so a
  // cancelled timer correctly leaves the canvas marked as still-in-overview
  // and the next hover transition re-emits the zoom-in.
  const view4CanvasInOverview = ref<boolean[]>([false, false, false, false])

  // Hover-zoom pacing. Both motions match at 1.8s; the unzoom (j) fires
  // immediately on a quadrant-to-quadrant transition while the re-zoom (k)
  // is held back by 150ms so the visual flow reads as "the leaving canvas
  // moves first, then the entering canvas catches up". `null → k` and
  // `j → null` transitions don't combine motions, so no delay is applied.
  const HOVER_DURATION_SEC = 1.8
  const HOVER_LEAD_MS = 150
  let pendingZoomInTimer: ReturnType<typeof setTimeout> | null = null

  function setQuadrantHover(canvasIndex: number | null) {
    if (!viewState.is('RELATIONAL')) return
    if (overviewConfirmed.value) return
    if (canvasIndex !== null && (canvasIndex < 0 || canvasIndex > 3)) return
    const prev = view4HoveredQuadrant.value
    const next = canvasIndex
    if (prev === next) return
    view4HoveredQuadrant.value = next

    // Cancel any pending delayed zoom-in. The canvases it targeted are
    // still in overview project-side (the timer never fired), and
    // view4CanvasInOverview still reflects that — so the diff below
    // naturally re-emits the zoom-in if the new hover state demands it.
    if (pendingZoomInTimer !== null) {
      clearTimeout(pendingZoomInTimer)
      pendingZoomInTimer = null
    }

    if (!activeCentralImageId.value) return

    const shouldBeOverview = (i: number) => next !== null && i !== next
    const toUnzoom: number[] = []
    const toZoom: number[] = []
    for (let i = 0; i < 4; i++) {
      const desired = shouldBeOverview(i)
      const current = view4CanvasInOverview.value[i]
      if (desired && !current) toUnzoom.push(i)
      else if (!desired && current) toZoom.push(i)
    }

    for (const i of toUnzoom) {
      projectSocket.setCanvasOverview(i, HOVER_DURATION_SEC)
      view4CanvasInOverview.value[i] = true
    }

    if (toZoom.length === 0) return

    const fireZoomIns = () => {
      if (!viewState.is('RELATIONAL') || overviewConfirmed.value) return
      // Re-read at fire-time so a history-nav during the lead window pans
      // the canvas onto the *latest* image, not the one active when the
      // hover transition started.
      const currentId = activeCentralImageId.value
      if (!currentId) return
      for (const i of toZoom) {
        projectSocket.setCanvasZoom(i, currentId, HOVER_DURATION_SEC)
        view4CanvasInOverview.value[i] = false
      }
    }

    if (toUnzoom.length > 0) {
      pendingZoomInTimer = setTimeout(() => {
        fireZoomIns()
        pendingZoomInTimer = null
      }, HOVER_LEAD_MS)
    } else {
      fireZoomIns()
    }
  }

  function zoomCanvas(canvasIndex: number) {
    if (!viewState.is('TRANSITION')) return
    if (canvasIndex < 0 || canvasIndex > 3) return
    if (canvasZoomed.value[canvasIndex]) return
    const id = activeCentralImageId.value
    if (!id) return
    canvasZoomed.value = canvasZoomed.value.map((v, i) => i === canvasIndex ? true : v)
    projectSocket.setCanvasZoom(canvasIndex, id)
    // Mirror VIEW_3's per-quadrant text fade-in on the corresponding
    // project canvas — same content (title + body from
    // view3Interpretations), same component-id mapping (canvasIndex
    // 0..3 → component_1..4). One emission per cross click, matching
    // the per-cross interface reveal gated on canvasZoomed[i].
    const componentId = `component_${canvasIndex + 1}` as View3ComponentId
    const { title, body } = view3Interpretations[componentId]
    projectSocket.setCanvasText(canvasIndex, title, body)
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
    // Defensive title clears at the first user-driven state transition out
    // of `single`. The CSS `:not([data-state="single"])` guard hides every
    // component-title surface while project is in single, but the moment
    // the morph below flips state to `overview` the gate opens — so any
    // stale data-attribute / .visible class left over from a previous
    // session (e.g. a hot-reload that didn't re-register, or a closed-
    // and-reopened standalone project tab) would fade in under the
    // revealing mask. Clearing here pre-morph guarantees the user only
    // sees titles they actually triggered this session.
    projectSocket.setCornerLabels(false)
    for (let i = 0; i < 4; i++) projectSocket.setCanvasText(i, '', '')
    projectSocket.setCenterCaption('')
    // Hidden-morph on the project screen: gradient mask fades in to
    // cover the canvases, single → overview morph runs entirely behind
    // the opaque mask, a HOLD buffer absorbs socket/tick slop so the
    // morph fully settles before the reveal, then the mask fades out.
    // Without the HOLD, the morph tail leaks into the reveal frame.
    const FADE_IN_MS = 250
    const MORPH_MS = 350
    const HOLD_MS = 300
    const FADE_OUT_MS = 500
    projectSocket.setMask(1, FADE_IN_MS)
    setTimeout(() => projectSocket.setState('overview', MORPH_MS), FADE_IN_MS)
    setTimeout(() => projectSocket.setMask(0, FADE_OUT_MS), FADE_IN_MS + MORPH_MS + HOLD_MS)
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
    // Clear all four canvas texts on entry to VIEW_4. They were populated
    // one-by-one as the user clicked through the four quadrant crosses in
    // VIEW_3; VIEW_4 starts with interpretation mode OFF, so the canvases
    // should match (no text) until the user toggles the interpret control.
    for (let i = 0; i < 4; i++) projectSocket.setCanvasText(i, '', '')
    // Also clear the centred modes-caption that faded in 1 s after the
    // fourth cross. Empty string hides project's `#center-caption`.
    projectSocket.setCenterCaption('')
    // Reveal the four component corner labels on the standalone project
    // at this moment — the top-cross click is the first beat where the
    // user has committed to the relational view, so corner labels appear
    // together with VIEW_4 mounting (which renders its own always-visible
    // RelationComponent corner labels). Both screens land in
    // MIRROR/TRACE/SHIFT/REPLAY in lockstep.
    projectSocket.setCornerLabels(true)
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

  // Hidden-morph from `overview` back to `single` on the standalone
  // project, so the contributed path can be read on the full map.
  // Same gradient-mask choreography as `enterEntryView`: mask fades in,
  // morph runs behind the cover, HOLD absorbs socket/tick slop, mask
  // fades out to reveal the settled state. One-shot — gated by
  // `singlePathViewActive`. Requires `overviewConfirmed`.
  function enterSinglePathView() {
    if (!overviewConfirmed.value) return
    if (singlePathViewActive.value) return
    singlePathViewActive.value = true
    const FADE_IN_MS = 250
    const MORPH_MS = 350
    const HOLD_MS = 300
    const FADE_OUT_MS = 500
    projectSocket.setMask(1, FADE_IN_MS)
    setTimeout(() => projectSocket.setState('single', MORPH_MS), FADE_IN_MS)
    setTimeout(() => projectSocket.setMask(0, FADE_OUT_MS), FADE_IN_MS + MORPH_MS + HOLD_MS)
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
    // Mirror the interface-side interpretation-panel reveal on the four
    // project canvases. ON → push all four texts; OFF → clear all four.
    for (let i = 0; i < 4; i++) {
      if (view3InterpretationMode.value) {
        const componentId = `component_${i + 1}` as View3ComponentId
        const { title, body } = view3Interpretations[componentId]
        projectSocket.setCanvasText(i, title, body)
      } else {
        projectSocket.setCanvasText(i, '', '')
      }
    }
  }

  function setCanvasBackground(mode: 'black' | 'gradient') {
    canvasBackground.value = mode
    projectSocket.setCanvasBg(mode)
  }

  // Mirror VIEW_3's centred modes-caption on the standalone project's
  // viewport. Called from the 1s timer after the fourth quadrant cross.
  // Pass empty string to clear (done in `enterRelationalView` on VIEW_4
  // entry).
  function setCenterCaption(text: string) {
    projectSocket.setCenterCaption(text)
  }

  // Transient perception primitive. Highlights an id on the project canvas
  // (or clears with null). Pure ephemeral feedback channel — does NOT touch
  // navigationHistory, activeCentralImageId, imageClick, view state, or any
  // persisted store value. Any view's hover handler can call this.
  function setHighlight(id: ImageId | null) {
    projectSocket.setHighlight(id)
  }

  // Ghost-path companion to setHighlight. Draws a transient dashed line
  // on every project canvas from the active central image to `toId`,
  // showing the proximity link being previewed. Pass null to clear (fade
  // out). Same ephemerality rules as setHighlight — no persisted state
  // touched. Skipped if there's no active central image to anchor from.
  function setGhostPath(toId: ImageId | null) {
    if (!toId) {
      projectSocket.setGhostPath(null, null)
      return
    }
    const fromId = activeCentralImageId.value
    if (!fromId) return
    projectSocket.setGhostPath(fromId, toId)
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
    view4HoveredQuadrant,
    setQuadrantHover,
    historyHasPrevious,
    historyHasForward,
    enterEntryView,
    selectImage,
    enterRelationalView,
    activateCentral,
    confirmOverview,
    singlePathViewActive,
    enterSinglePathView,
    stepBackInHistory,
    stepForwardInHistory,
    jumpToHistory,
    view3InterpretationMode,
    toggleView3Interpretation,
    canvasBackground,
    setCanvasBackground,
    setCenterCaption,
    setHighlight,
    setGhostPath,
  }
})
