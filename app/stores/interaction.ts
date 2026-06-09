import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ImageId } from '~/types/interaction'
import { useInteractionEmitter } from '~/composables/useInteractionEmitter'
import { useProjectSocket } from '~/composables/useProjectSocket'
import { useViewStateStore } from '~/stores/viewState'
import { view3Interpretations, IMAGE_CREDIT_LINES, type View3ComponentId } from '~/view3/view3Interpretations'

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

  // Interface-only hover flag: true while the cursor is over the central
  // image. Read by RelationComponent to fade all quadrant cells to full
  // opacity. Never on the wire.
  const centralHovered = ref(false)
  function setCentralHovered(v: boolean) { centralHovered.value = v }

  // After `confirmOverview`, the user can request a second hidden-morph
  // that drops the standalone project from `overview` back to `single`
  // so the contributed path can be read on the full map. One-shot —
  // flips true on the trigger and stays true (no inverse transition).
  const singlePathViewActive = ref(false)

  // "Explore others" — once the single-path view is active, four existing
  // Replay-proximity circles appear in the corners (loaded from
  // /api/replay-circles). Clicking one centres it and redraws the project's
  // single-state path to that circle. `centeredCircleIds` is the currently
  // centred foreign circle, or null = showing the user's own path. All
  // interface-only; the redraw reuses the existing path primitives.
  const replayCircles = ref<{ anchorId: ImageId; ids: ImageId[] }[]>([])
  const centeredCircleIds = ref<ImageId[] | null>(null)
  // Prefetched per-zone map-words (keywords/subjects/years), cached by
  // loadMapWords and pushed to the project by showMapWords when the "See how…"
  // caption disappears. null until the prefetch lands.
  const mapWordsData = ref<{
    form: { id: ImageId; text: string }[]
    source: { id: ImageId; text: string }[]
    semantic: { id: ImageId; text: string }[]
    time: { id: ImageId; text: string }[]
  } | null>(null)
  // How many corner ribbons the user has picked (each pick refreshes the
  // corners, so every pick is a different ribbon). The "Start over" control
  // appears once this reaches REPLAY_PICKS_FOR_RESTART.
  const replayPickCount = ref(0)
  // The deck the centred CentralImage renders: the clicked foreign circle if
  // one is centred, otherwise the user's own path (centralStack). View4 binds
  // this and never needs to know which source it is.
  const centeredStack = computed<ImageId[]>(
    () => centeredCircleIds.value ?? centralStack.value,
  )

  const view3InterpretationMode = ref(false)

  const canvasBackground = ref<'black' | 'gradient'>('gradient')

  // ── Luminosity dimmers ──
  // Two independent dim levels (0 = full brightness, 1 = fully dark), one for
  // each layer. The interface level drives a full-screen black overlay in
  // app.vue; the project level is mirrored to the project render window via the
  // `set-dim` wire directive. Fire `setInterfaceDim` / `setProjectDim` at any
  // scripted moment in the flow. `interfaceDimDuration` carries the fade time
  // so the overlay's CSS transition matches the requested duration.
  const interfaceDimLevel = ref(0)
  const interfaceDimDuration = ref(600)

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
  // Set true on the first VIEW_3 quadrant cross click — once the per-quadrant
  // suggestion-image preview has begun revealing in VIEW_3, the relational
  // view (VIEW_4) must NOT replay its first-mount clockwise sweep (the images
  // are already revealed). RelationComponent reads this to suppress its
  // on-mount entrance + corner-label announce-glow. One-way for the session
  // (the VIEW_3 → VIEW_4 progression is forward-only).
  const relationsPreRevealed = ref(false)

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
    // Central image is frozen during the overview finale — no hover-zoom.
    if (overviewFinaleActive.value) return
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
    // The per-quadrant suggestion-image preview has begun — suppress VIEW_4's
    // first-mount clockwise re-sweep (the images reveal here in VIEW_3 now).
    relationsPreRevealed.value = true
    projectSocket.setCanvasZoom(canvasIndex, id)
    // Mirror VIEW_3's per-quadrant text fade-in on the corresponding
    // project canvas — same content (title + body from
    // view3Interpretations), natural mapping canvasIndex 0..3 →
    // component_1..4. One emission per cross click, matching the
    // per-cross interface reveal gated on canvasZoomed[i].
    const componentId = `component_${canvasIndex + 1}` as View3ComponentId
    const { title, body } = view3Interpretations[componentId]
    projectSocket.setCanvasText(canvasIndex, title, body)
    // Reveal this quadrant's corner label on project at the same beat the
    // interface reveals its own (View3Transition gates on canvasZoomed[i]),
    // so SOURCE / FORM / SEMANTIC / TIME pop per-quadrant on both
    // screens instead of all four at VIEW_4 entry.
    projectSocket.setCornerLabel(canvasIndex, true)
  }

  // Clear the four per-quadrant interpretation texts on the project canvases
  // (fades them out — `.canvas-text` is opacity-gated). Used by the VIEW_3
  // central-image click so the project quadrant texts fade out at the SAME
  // moment as the interface ones (`.quadrant-text.dissolving`), before the
  // view advances to VIEW_4. enterRelationalView also clears them defensively.
  function clearCanvasTexts() {
    for (let i = 0; i < 4; i++) projectSocket.setCanvasText(i, '', '')
  }

  // Reveal/clear a SINGLE quadrant's interpretation text on the project canvas —
  // mirrors the VIEW_4 corner-label hover (RelationComponent). visible=true
  // emits that quadrant's title+body; false clears it. (The `+` interpretation
  // mode still drives all four via toggleView3Interpretation.)
  function setQuadrantText(canvasIndex: number, visible: boolean) {
    if (canvasIndex < 0 || canvasIndex > 3) return
    if (visible) {
      const componentId = `component_${canvasIndex + 1}` as View3ComponentId
      const { title, body } = view3Interpretations[componentId]
      projectSocket.setCanvasText(canvasIndex, title, body)
    } else {
      projectSocket.setCanvasText(canvasIndex, '', '')
    }
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
    // NOTE: the single → overview morph used to fire HERE (hidden behind the
    // render-mask, revealed in sync with the disperse burst). It is now
    // deferred to View2Disperse — fired AFTER the 2nd intro sentence ("It was
    // structured…"), coordinated with the interface darkening — so the
    // standalone project stays in `single` through the VIEW_2 intro. See
    // `morphToOverviewGrid`.
  }

  // Morph the standalone project single → overview (the 2×2 grid), hidden
  // behind the render-mask, then reveal it on a simple timer. Called from
  // View2Disperse after the 2nd intro sentence, coordinated with the interface
  // darkening (store.setInterfaceDim). Same hidden-snap choreography the old
  // enterEntryView used, minus the disperse-spawn reveal gating (now timed).
  function morphToOverviewGrid() {
    const FADE_IN_MS = 250
    const MORPH_DELAY_MS = 80
    const FADE_OUT_MS = 400
    projectSocket.setMask(1, FADE_IN_MS)
    setTimeout(() => {
      projectSocket.setState('overview', 0) // instant snap behind the opaque mask
      setTimeout(() => projectSocket.setMask(0, FADE_OUT_MS), MORPH_DELAY_MS)
    }, FADE_IN_MS + MORPH_DELAY_MS)
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
    // Reveal all four corner labels on project. In the normal flow they were
    // already revealed per-quadrant during VIEW_3 (one `set-corner-label` per
    // cross click), so this all-on re-assert is an idempotent no-op; but when
    // VIEW_3 is SKIPPED (the "Next" button) the crosses were never clicked, so
    // this is what reveals them. Safe to re-assert now that the one-shot
    // announce-glow was removed (the reveal is opacity-only).
    projectSocket.setCornerLabels(true)
  }

  // `quadrant` (0=tl,1=tr,2=bl,3=br) identifies which relation component the
  // user clicked in; it's forwarded on the path-segment wire so project can
  // colour the new segment by quadrant (see project/src/pathColors.js).
  function activateCentral(id: ImageId, quadrant?: number) {
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
    projectSocket.pathSegment(prevId, id, quadrant)
  }

  // ── Overview finale sequence (replaces the old tick-ring loader) ──
  // When the 10th image is reached, the four quadrants' suggestion images
  // flash to full opacity, hold, then fade out — ALL CELLS TOGETHER (the old
  // clockwise sweep was removed) — only then does confirmOverview fire (→ the
  // circle of 10 reveals). The central image + all interaction are frozen for
  // the duration. The cells' fade lives in CSS (`.finale-dissolve .cell` →
  // opacity 600ms, uniform), matched here by OVERVIEW_DISSOLVE_MS. The central
  // DECK fades out simultaneously with the cells (it starts on the `dissolve`
  // phase — see View4's deckHidden watch). The grid cross + corner labels fade
  // a step later, on the `fadeout` phase (`.view-3.finale-fadeout` rules).
  const OVERVIEW_BRIGHT_MS = 2300
  // Uniform fade-out duration for the finale cells (the clockwise sweep was
  // removed). All cells fade to 0 together over this window — matches the
  // `.finale-dissolve .cell` CSS in RelationComponent (600ms).
  const OVERVIEW_DISSOLVE_MS = 600
  // After the quadrants have disappeared, the central deck + cross + corner
  // labels fade out together over this window (matches the 700ms CSS fades on
  // `.center-anchor.deck-fadeout`, `.view-3.finale-fadeout::before`, and
  // `.rel.finale-fadeout .corner-label`) before confirmOverview fires.
  const OVERVIEW_FADEOUT_MS = 700
  // "See your path" appears this long after the circle has revealed.
  const SEE_YOUR_PATH_DELAY_MS = 6000
  const overviewFinalePhase = ref<'idle' | 'bright' | 'dissolve' | 'fadeout'>('idle')
  const overviewFinaleActive = computed(() => overviewFinalePhase.value !== 'idle')
  // Gates the post-confirm "See your path" control behind a delay.
  const overviewControlsReady = ref(false)
  let finaleTimers: ReturnType<typeof setTimeout>[] = []

  function startOverviewFinale() {
    if (!overviewEligible.value) return
    if (overviewFinalePhase.value !== 'idle') return
    // Fadeout begins once the cells have fully faded (bright + dissolve), so
    // the deck/cross/labels start leaving right as the cells finish.
    const fadeoutStart = OVERVIEW_BRIGHT_MS + OVERVIEW_DISSOLVE_MS
    overviewFinalePhase.value = 'bright'
    finaleTimers.push(setTimeout(() => {
      overviewFinalePhase.value = 'dissolve'
      // EVERYTHING fades out at this one moment: the interface cells, deck,
      // cross and corner labels all fade on the `dissolve` phase now (View4's
      // finale-fadeout class is bound to dissolve||fadeout), and this fades the
      // project's render mask in over the SAME duration so both screens go to
      // gradient together. Mask is opaque well before confirmOverview, so the
      // setMask(1) in enterSinglePathView is a no-op re-assert.
      projectSocket.setMask(1, OVERVIEW_FADEOUT_MS)
    }, OVERVIEW_BRIGHT_MS))
    finaleTimers.push(setTimeout(() => {
      overviewFinalePhase.value = 'fadeout'
    }, fadeoutStart))
    finaleTimers.push(setTimeout(() => {
      confirmOverview()
      overviewFinalePhase.value = 'idle'
    }, fadeoutStart + OVERVIEW_FADEOUT_MS))
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
    // No overview dezoom: the finale goes straight to the single path-map (the
    // masked overview→single morph used to follow this; now it's split→single
    // and is driven by View4's startFinaleNarration → enterSinglePathView). We
    // deliberately do NOT emit set-state('overview') here anymore — the user
    // never sees the zoom-out-to-grid step.
    // "See your path" surfaces only after a beat (the user takes in the
    // circle first). Gated by overviewControlsReady, flipped 6s later.
    overviewControlsReady.value = false
    setTimeout(() => { overviewControlsReady.value = true }, SEE_YOUR_PATH_DELAY_MS)
    // Light the WHOLE contributed path on every canvas (not just the last
    // selected image). set-marks clears the single focus track project-side, so
    // every path image reads equally — and hover (set-highlight) then works
    // uniformly for any of them, including the last. The path itself is
    // untouched (marks never mutate pathTrace), so it stays frozen as drawn.
    // Lit now (project still in split, where the zoomed-in camera barely shows
    // it) and carried untouched through the morph, so it reads on the full
    // single map the instant the mask reveals it.
    projectSocket.setMarks([...navigationHistory.value])
  }

  // Hidden-morph to `single` on the standalone project, so the contributed
  // path can be read on the full map. The finale skips the overview dezoom, so
  // this now morphs straight from `split` → `single` (setState('single') works
  // from any state); the mask choreography is unchanged.
  // Same gradient-mask choreography as `enterEntryView`: mask fades in,
  // morph runs behind the cover, HOLD absorbs socket/tick slop, mask
  // fades out to reveal the settled state. One-shot — gated by
  // `singlePathViewActive`. Requires `overviewConfirmed`.
  function enterSinglePathView() {
    if (!overviewConfirmed.value) return
    if (singlePathViewActive.value) return
    singlePathViewActive.value = true
    // Load the four "existing circles" (Replay proximities) for the corners
    // so they're ready as the single-path view appears. Fire-and-forget.
    loadReplayCircles()
    // PREFETCH the per-zone map-words (keywords on the Form map, subjects on the
    // Source map, years on the Time map). The data is cached now but NOT shown
    // yet — it's pushed to the project later, the moment the "See how…" caption
    // disappears (see showMapWords / View4's advanceToExplore).
    loadMapWords()
    // Mask is ALREADY opaque here (faded in during the finale dissolve so the
    // project fell out with the interface). This re-asserts it before the morph;
    // visually a no-op (opacity 1 → 1).
    const FADE_IN_MS = 250
    // Instant morph behind the opaque mask — the reshape must never be seen, so
    // it's a snap, not a tween. The mask hold is the deliberate beat.
    const MORPH_MS = 0
    // 8s hold: the project sits under the gradient mask (while the interface
    // circle + journey sentence are read) before the single map is revealed.
    const HOLD_MS = 8000
    // Reveal fade — 700ms so the single map fades IN gently (a quick 400ms read
    // as a brutal pop) and matches the screens' fade-OUT duration. Fires at the
    // same instant the journey sentence fades out — project reveal and interface
    // text leave correspond. (View4's SINGLE_REVEAL_MS = FADE_IN + MORPH + HOLD.)
    const FADE_OUT_MS = 700
    projectSocket.setMask(1, FADE_IN_MS)
    setTimeout(() => {
      projectSocket.setState('single', MORPH_MS)
      // Arm the top-left map label so it names the auto-cycling map as the
      // single explore view appears (fades in with the mask reveal).
      projectSocket.setMapLabel(true)
    }, FADE_IN_MS)
    setTimeout(() => projectSocket.setMask(0, FADE_OUT_MS), FADE_IN_MS + MORPH_MS + HOLD_MS)
  }

  function hideMapLabel() {
    projectSocket.setMapLabel(false)
    projectSocket.pathFadeOut()
    projectSocket.setMapWords({ form: [], source: [], semantic: [], time: [] })
  }

  // Fetch four corner circles, each a random Replay-proximity neighbourhood
  // resolved server-side (see /api/replay-circles). `force` re-fetches a
  // fresh set even if some are already loaded — used to refresh the corners
  // after each pick so a new set of existing circles appears every time.
  async function loadReplayCircles(force = false) {
    if (!force && replayCircles.value.length > 0) return
    try {
      const res = await $fetch<{ circles: { anchorId: ImageId; ids: ImageId[] }[] }>(
        '/api/replay-circles',
        { query: { count: 4, size: 10 } },
      )
      replayCircles.value = res?.circles ?? []
    } catch (err) {
      console.warn('[interaction] loadReplayCircles failed', err)
    }
  }

  // Fetch the per-zone map-words (computed server-side, static) and CACHE them.
  // No push here — showMapWords() pushes them to the project later so the maps
  // only reveal their keywords/subjects/years once the "See how…" caption has
  // left. Fire-and-forget; leaves the cache null on failure (harmless).
  async function loadMapWords() {
    try {
      const res = await $fetch<{
        form: { id: ImageId; text: string }[]
        source: { id: ImageId; text: string }[]
        semantic: { id: ImageId; text: string }[]
        time: { id: ImageId; text: string }[]
      }>('/api/map-words')
      mapWordsData.value = { form: res?.form ?? [], source: res?.source ?? [], semantic: res?.semantic ?? [], time: res?.time ?? [] }
    } catch (err) {
      console.warn('[interaction] loadMapWords failed', err)
    }
  }

  // Push the prefetched map-words to the project so the explore-single maps
  // reveal their characteristic keywords/subjects/years. Called the instant the
  // "See how…" caption disappears (see View4's advanceToExplore) — the metadata
  // appears as that sentence leaves. Falls back to a fetch if the prefetch from
  // enterSinglePathView hasn't landed yet.
  async function showMapWords() {
    if (!mapWordsData.value) await loadMapWords()
    if (mapWordsData.value) projectSocket.setMapWords(mapWordsData.value)
  }

  // Redraw the standalone project's single-state path to an ordered list of
  // ids — instant, no transition (the perspective switch must feel
  // immediate). Connects the ids in array order (matching the centred
  // circle's clockwise-from-top layout) and marks all of them. Shared by
  // `centerReplayCircle` and the (future) restore-to-own-path hook.
  function redrawCircleOnSingle(ids: ImageId[]) {
    projectSocket.pathClear()
    for (let i = 0; i < ids.length - 1; i++) {
      projectSocket.pathSegment(ids[i]!, ids[i + 1]!)
    }
    projectSocket.setMarks([...ids])
  }

  // Click a corner circle: centre it (drives `centeredStack`) and redraw the
  // project's single map to that circle. The four corners stay for continued
  // browsing.
  function centerReplayCircle(index: number) {
    const circle = replayCircles.value[index]
    if (!circle || circle.ids.length === 0) return
    centeredCircleIds.value = circle.ids
    replayPickCount.value += 1
    redrawCircleOnSingle(circle.ids)
    // Refresh the four corners so a fresh set of existing circles appears
    // after each pick (the chosen one is now centred). `centeredCircleIds`
    // holds its own copy of the ids, so replacing `replayCircles` doesn't
    // disturb the centred circle.
    loadReplayCircles(true)
  }

  function stepBackInHistory() {
    if (!viewState.is('RELATIONAL')) return
    if (overviewFinaleActive.value) return
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
    if (overviewFinaleActive.value) return
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
    if (overviewFinaleActive.value) return
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
    // Mirror the centred image-credit (the three-line provenance note) on the
    // project's `#center-caption`, same on/off beat as the quadrant texts.
    // Joined with newlines; the project caption renders them as three lines.
    projectSocket.setCenterCaption(
      view3InterpretationMode.value ? IMAGE_CREDIT_LINES.join('\n') : '',
    )
    // Mirror the interface's beige blur veil on the project canvas so the
    // standalone reads the same "field recedes behind the text" effect.
    projectSocket.setCanvasVeil(view3InterpretationMode.value)
  }

  function setCanvasBackground(mode: 'black' | 'gradient') {
    canvasBackground.value = mode
    projectSocket.setCanvasBg(mode)
  }

  // Dim the INTERFACE (Nuxt UI layer): drives the full-screen black overlay in
  // app.vue. level 0 = full brightness, 1 = fully dark; duration is the fade.
  function setInterfaceDim(level: number, duration = 600) {
    interfaceDimDuration.value = Math.max(0, duration)
    interfaceDimLevel.value = Math.max(0, Math.min(1, level))
  }

  // Dim the PROJECT (Three.js render window): mirrored over the wire to the
  // #render-dim overlay. Same semantics as setInterfaceDim.
  function setProjectDim(level: number, duration = 600) {
    projectSocket.setDim(Math.max(0, Math.min(1, level)), Math.max(0, duration))
  }

  // Mirror VIEW_3's centred modes-caption on the standalone project's
  // viewport. Called from the 1s timer after the fourth quadrant cross.
  // Pass empty string to clear (done in `enterRelationalView` on VIEW_4
  // entry).
  // `variant` is forwarded to project: 'rotate' styles the caption like the
  // interface rotating intro (VIEW_2/VIEW_3 mirror); 'default' (modes-caption,
  // image-credit) keeps project's plain center-caption style.
  // `allowSingle` opts the caption past project's single-state guard
  // (`body:not([data-state="single"]) #center-caption`). Only the
  // explore-others prompt needs it — that view is in `single` and still wants
  // a centred caption; every other caption fires in overview/split.
  function setCenterCaption(
    text: string,
    variant: 'default' | 'rotate' = 'default',
    allowSingle = false,
  ) {
    projectSocket.setCenterCaption(text, variant, allowSingle)
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
    centralHovered,
    setCentralHovered,
    imageClick,
    overviewConfirmed,
    overviewEligible,
    view2ExitReason,
    canvasZoomed,
    allCanvasesZoomed,
    relationsPreRevealed,
    zoomCanvas,
    clearCanvasTexts,
    setQuadrantText,
    view4HoveredQuadrant,
    setQuadrantHover,
    historyHasPrevious,
    historyHasForward,
    enterEntryView,
    morphToOverviewGrid,
    selectImage,
    enterRelationalView,
    activateCentral,
    confirmOverview,
    overviewFinalePhase,
    overviewFinaleActive,
    overviewControlsReady,
    startOverviewFinale,
    singlePathViewActive,
    enterSinglePathView,
    showMapWords,
    hideMapLabel,
    replayCircles,
    centeredCircleIds,
    centeredStack,
    centerReplayCircle,
    replayPickCount,
    stepBackInHistory,
    stepForwardInHistory,
    jumpToHistory,
    view3InterpretationMode,
    toggleView3Interpretation,
    canvasBackground,
    setCanvasBackground,
    interfaceDimLevel,
    interfaceDimDuration,
    setInterfaceDim,
    setProjectDim,
    setCenterCaption,
    setHighlight,
    setGhostPath,
  }
})
