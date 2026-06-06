<script setup lang="ts">
import { computed, watch, ref, onMounted, onBeforeUnmount } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import RelationComponent from '~/components/relations/RelationComponent.vue'
import CentralImage from '~/components/CentralImage.vue'
import AtlasThumb from '~/components/AtlasThumb.vue'
import SkipButton from '~/components/SkipButton.vue'
import { IMAGE_CREDIT_LINES } from '~/view3/view3Interpretations'
import { ROTATE_FADE_OUT_MS } from '~/utils/rotateText'

const store = useInteractionStore()
const { naturalDimsVmin } = useCentralImageDims()

const MAX_BRANCH_DEPTH = 10

// ── "Explore others" corner circles (post-"See your path") ──
// Four existing Replay-proximity circles, one per quadrant. `x/y` are the
// quadrant centres (mirroring the VIEW_3 cross spots).
const CORNERS = [
  { key: 'tl', x: 18, y: 18 },
  { key: 'tr', x: 82, y: 18 },
  { key: 'bl', x: 18, y: 82 },
  { key: 'br', x: 82, y: 82 },
] as const

// Bumped on each corner selection (and on overview confirm) so the centred
// circle wrapper remounts and the inner CentralImage replays its drift
// reveal from the centre.
const centerKey = ref(0)

function onCornerClick(i: number) {
  centerKey.value++
  store.centerReplayCircle(i)
}

// Clicking the center cross enters the explore-others view. EXPLORE_TEXT shows
// on the PROJECT centre only (one line) — NOT on the interface. The corner
// ribbons no longer appear on the click; they wait until the user starts
// hovering the circle (see onCircleHover) + RIBBON_REVEAL_AFTER_HOVER_MS.
const EXPLORE_TEXT = 'See how you move across the different proximity maps.'
const EXPLORE_DELAY_MS = 2000 // beat after entering explore before the project caption appears
const EXPLORE_HOLD_MS = 5000
const ribbonsReady = ref(false)
// Interface-only rotate caption shown AFTER the ribbons (the ribbons fade in,
// then 1.5s later the user is told to "look for others").
const EXPLORE_RIBBONS_TEXT = 'Look around for previous participants journey.'
const exploreRibbonsCaptionVisible = ref(false)
// After the user FIRST hovers a circle image, the ribbons fade in at this
// point (8s); the "look for others" caption then appears
// RIBBON_CAPTION_AFTER_RIBBONS_MS later. Armed once in onCircleHover.
const RIBBON_REVEAL_AFTER_HOVER_MS = 8000
const RIBBON_CAPTION_AFTER_RIBBONS_MS = 1500 // caption follows the ribbons by 1.5s
let ribbonHoverTimer: ReturnType<typeof setTimeout> | null = null
// Auto-advance into the explore-others (single-path) view. This is the exact
// transition the center cross used to trigger on click — the cross is gone, so
// it now runs automatically once the finale rotate narration has finished
// (see startFinaleNarration).
function advanceToExplore() {
  store.enterSinglePathView()
  // EXPLORE_TEXT — PROJECT centre only, a beat after the advance; holds, fades.
  // Project is in `single` here (enterSinglePathView morphs overview → single),
  // where #center-caption is normally gated off — `allowSingle` opts this one
  // caption past that guard (and `single-ok` keeps it on one line).
  finaleTimers.push(setTimeout(() => {
    store.setCenterCaption(EXPLORE_TEXT, 'rotate', true)
    finaleTimers.push(setTimeout(() => {
      store.setCenterCaption('')
    }, EXPLORE_HOLD_MS))
  }, EXPLORE_DELAY_MS))
}

// Split a circle's ids into the two arms of the corner L-ribbon. The ribbon is
// one continuous sequence that bends at the window corner: the first part runs
// inward along the HORIZONTAL edge toward the corner (so it's reversed — its
// last image sits at the corner), then the rest runs out along the VERTICAL
// edge from the corner. So the order reads 0 → corner → N-1.
//
// The split leans HARD onto the horizontal arm: the top/bottom edges are long,
// so they hold most of the images with room to spare, while only ~2 go on the
// short vertical (left/right) arm. Combined with the edge-length-aware caps
// below, that keeps a clear mid-gap on every edge on any window aspect.
const RIBBON_VERTICAL_COUNT = 4 // images kept on the (short) vertical arm
function ribbonArms(ids: string[]): { h: string[]; v: string[] } {
  const mid = Math.max(1, ids.length - RIBBON_VERTICAL_COUNT)
  return { h: ids.slice(0, mid).slice().reverse(), v: ids.slice(mid) }
}

// Each ribbon image uses the SAME balanced natural-dims model as the central
// deck, the circle of 10 and the quadrant cells (ratio preserved, extreme
// aspects gently balanced, subtle per-image hash variation) scaled by
// RIBBON_SCALE — so the "explore others" corner images feel coherent with the
// rest of the view. RIBBON_SCALE matches the quadrant cells' QUADRANT_SCALE
// (0.6) so the two suggestion surfaces read at the same scale. Images sit SIDE
// BY SIDE (touching) along both arms.
//
// Each arm is capped at a reach derived from the EDGE it sits on (see
// ribbonArmCaps): if the touching length would exceed it the arm scales down to
// fit. Because the cap is half the real edge length minus half the mid-gap, the
// two ribbons sharing an edge can never meet — a clear gap is always left in
// the MIDDLE of every edge, on any window aspect (the old fixed cap overlapped
// on narrow/near-square windows because the top/bottom edge is shorter in vmin
// there).
const RIBBON_SCALE = 0.46 // base ribbon image scale
// Baseline spacing: images advance by AT MOST this fraction of their size, so
// even an arm with room overlaps its own images a little (≈15%) rather than
// sitting at exact touching — the spacing then varies organically with the
// per-image sizes (like the side arm). An arm with too many images compresses
// further than this to fit its cap.
const RIBBON_MAX_ADVANCE = 0.85
// Visible gap kept in the MIDDLE of each edge between the two DIFFERENT corner
// ribbons — they never overlap each other, so the edge stays readable. Images
// of the SAME ribbon may overlap each other within an arm to fit at full size
// (see layoutArm); only different ribbons are kept apart.
const RIBBON_EDGE_GAP_VMIN = 14

// Window size (px), tracked so the arm caps follow the real edge lengths.
const ribbonViewport = ref<{ w: number; h: number }>({ w: 1920, h: 1080 })
function updateRibbonViewport() {
  ribbonViewport.value = { w: window.innerWidth, h: window.innerHeight }
}
// Max reach (vmin) of each arm from its corner: half the edge MINUS half the
// mid-edge gap, so the two arms sharing an edge never meet — a RIBBON_EDGE_GAP_VMIN
// gap is always left in the middle (the edge stays visible). Horizontal edge =
// 100vw, vertical edge = 100vh, both in vmin.
const ribbonArmCaps = computed(() => {
  const { w, h } = ribbonViewport.value
  const vmin = Math.min(w, h) || 1
  const horizEdgeVmin = (100 * w) / vmin
  const vertEdgeVmin = (100 * h) / vmin
  return {
    h: Math.max(16, horizEdgeVmin / 2 - RIBBON_EDGE_GAP_VMIN / 2),
    v: Math.max(16, vertEdgeVmin / 2 - RIBBON_EDGE_GAP_VMIN / 2),
  }
})
type RibbonThumb = { id: string; w: number; h: number; d: number }
// Lay an arm's images at FULL size (RIBBON_SCALE — no per-arm rescale, so every
// ribbon image is the same scale), spreading them from `startD` toward the cap
// `avail`. If the touching length exceeds the available span, the SPACING
// compresses so the images OVERLAP EACH OTHER within the arm (same ribbon) while
// the arm's far end still lands at `avail` — i.e. it never crosses into the
// other ribbon's half of the edge. If they fit, they simply touch from the
// corner.
function layoutArm(ids: string[], main: 'w' | 'h', startD: number, avail: number): RibbonThumb[] {
  const base = ids.map((id) => {
    const dm = naturalDimsVmin(id)
    return { id, w: dm.width * RIBBON_SCALE, h: dm.height * RIBBON_SCALE }
  })
  if (base.length === 0) return []
  const sizeOf = (b: { w: number; h: number }) => (main === 'w' ? b.w : b.h)
  const out: RibbonThumb[] = []
  if (base.length === 1) {
    out.push({ ...base[0]!, d: startD })
    return out
  }
  const span = Math.max(0, avail - startD)
  const lastSize = sizeOf(base[base.length - 1]!)
  const touchAdvance = base.slice(0, -1).reduce((s, b) => s + sizeOf(b), 0) // advance if touching
  const targetAdvance = Math.max(0, span - lastSize) // advance so the last far edge = avail
  const fitFactor = touchAdvance > targetAdvance && touchAdvance > 0 ? targetAdvance / touchAdvance : 1
  // Always overlap a little (RIBBON_MAX_ADVANCE), and more than that only when
  // the arm must compress to fit its cap.
  const f = Math.min(RIBBON_MAX_ADVANCE, fitFactor)
  let d = startD
  for (const b of base) {
    out.push({ ...b, d })
    d += sizeOf(b) * f
  }
  return out
}
function ribbonLayout(ids: string[]): { hThumbs: RibbonThumb[]; vThumbs: RibbonThumb[] } {
  const { h, v } = ribbonArms(ids)
  const caps = ribbonArmCaps.value
  const hThumbs = layoutArm(h, 'w', 0, caps.h)
  // vertical arm starts just past the corner image (the first horizontal one)
  const offset = hThumbs[0]?.h ?? 0
  const vThumbs = layoutArm(v, 'h', offset, caps.v)
  return { hThumbs, vThumbs }
}
const ribbonLayouts = computed(() => store.replayCircles.map((c) => ribbonLayout(c.ids)))

// Per-corner absolute placement: thumb sized to its natural footprint, offset
// `d` along the corner's edge, flush to the two window edges that meet there.
function ribbonThumbStyle(corner: string, t: RibbonThumb, axis: 'h' | 'v'): Record<string, string> {
  const s: Record<string, string> = {
    width: `${t.w.toFixed(2)}vmin`,
    height: `${t.h.toFixed(2)}vmin`,
  }
  const along = `${t.d.toFixed(2)}vmin`
  const left = corner === 'tl' || corner === 'bl'
  const top = corner === 'tl' || corner === 'tr'
  if (axis === 'h') {
    // run along the horizontal edge; flush to top/bottom
    s[left ? 'left' : 'right'] = along
    s[top ? 'top' : 'bottom'] = '0'
  } else {
    // run along the vertical edge; flush to left/right
    s[top ? 'top' : 'bottom'] = along
    s[left ? 'left' : 'right'] = '0'
  }
  return s
}

watch(() => store.overviewConfirmed, (v) => { if (v) { centerKey.value++; startFinaleNarration() } })

// ── Deck → circle hand-off (flash fix) ──
// The central deck fades out during the `fadeout` phase. We must NOT un-hide it
// the instant the phase clears at confirm: that reset (opacity → 1) made the
// already-faded deck flash back for a frame while the `center-fade` out-in
// transition was still leaving it. Instead the deck stays hidden until its
// leave transition completes (@after-leave) — by which point the circle is
// entering — so the swap is a clean cross-fade with no flash.
const deckHidden = ref(false)
// Fade the centred deck out simultaneously with the full-opacity cells (the
// `dissolve` phase), not a step later on `fadeout`.
watch(() => store.overviewFinalePhase, (p) => { if (p === 'dissolve') deckHidden.value = true })
function onCenterAfterLeave() { deckHidden.value = false }

// ── Post-overview finale narration + center cross ──
// 4s after the circle reveals (overviewConfirmed), a two-beat rotate text
// plays SEQUENTIALLY: sentence 1 on the INTERFACE (centred, rotate style),
// then — once it's faded — sentence 2 on the PROJECT (set-center-caption). When
// both are done, the `+` cross fades in at the centre of the circle, replacing
// the old "See your path" button (clicking it = enterSinglePathView).
const FINAL_INTERFACE_TEXT = 'Your produced a unique journey through your selection.'
const FINAL_PROJECT_TEXT = 'Your images found different neighbors across each proximity maps.'
const FINAL_TEXT_DELAY_MS = 2500   // wait before sentence 1 appears (after circle reveals)
const HOLD_INTERFACE_MS = 3000     // sentence 1 (interface) full-opacity dwell
const HOLD_PROJECT_MS = 6000       // sentence 2 (project) full-opacity dwell (+1s)
const ADVANCE_DELAY_MS = 2000      // wait after sentence 2 fades before auto-advancing
const finalCaptionVisible = ref(false) // interface sentence 1
let finaleTimers: ReturnType<typeof setTimeout>[] = []

// "One image left to pick" — a narrative rotate caption (same centred
// rotate-text style as the finale narration) that plays once the active branch
// reaches depth 9 (the user has just clicked the 9th image): one more pick
// reaches the cap (10) and auto-runs the overview finale. It's a transient
// beat — fades in, holds, fades out — so it doesn't sit over the central image
// while the user picks the 10th.
const ONE_LEFT_TEXT = 'One image left to pick'
const ONE_LEFT_HOLD_MS = 3000
const oneLeftVisible = ref(false)
let oneLeftTimer: ReturnType<typeof setTimeout> | null = null
const oneImageLeftReached = computed(
  () =>
    store.historyIndex + 1 === MAX_BRANCH_DEPTH - 1 &&
    !store.overviewConfirmed &&
    store.overviewFinalePhase === 'idle',
)
// Play the beat when depth 9 is reached; hide immediately if the user leaves
// depth 9 (picks the 10th, steps back) before the hold elapses.
watch(oneImageLeftReached, (reached) => {
  if (oneLeftTimer) { clearTimeout(oneLeftTimer); oneLeftTimer = null }
  if (reached) {
    oneLeftVisible.value = true
    oneLeftTimer = setTimeout(() => { oneLeftVisible.value = false }, ONE_LEFT_HOLD_MS)
  } else {
    oneLeftVisible.value = false
  }
})

function startFinaleNarration() {
  const t1 = FINAL_TEXT_DELAY_MS                                   // sentence 1 (interface) in
  const t1out = t1 + HOLD_INTERFACE_MS                             // sentence 1 out
  const PROJECT_SENTENCE_EXTRA_MS = 1000                           // +1s wait before sentence 2 fades in
  const t2 = t1out + ROTATE_FADE_OUT_MS + PROJECT_SENTENCE_EXTRA_MS // sentence 2 (project) in
  const t2out = t2 + HOLD_PROJECT_MS                               // sentence 2 out
  const tAdvance = t2out + ADVANCE_DELAY_MS                        // auto-advance (no cross)
  finaleTimers.push(setTimeout(() => { finalCaptionVisible.value = true }, t1))
  finaleTimers.push(setTimeout(() => { finalCaptionVisible.value = false }, t1out))
  finaleTimers.push(setTimeout(() => { store.setCenterCaption(FINAL_PROJECT_TEXT, 'rotate') }, t2))
  finaleTimers.push(setTimeout(() => { store.setCenterCaption('') }, t2out))
  // Once the finale rotate narration has finished (the text disappears), the
  // experience auto-advances into the explore-others view — the same
  // transition the center cross used to do on click, minus the cross moment.
  finaleTimers.push(setTimeout(() => { advanceToExplore() }, tAdvance))
}

onMounted(() => {
  updateRibbonViewport()
  window.addEventListener('resize', updateRibbonViewport)
})

onBeforeUnmount(() => {
  for (const t of finaleTimers) clearTimeout(t)
  finaleTimers = []
  if (oneLeftTimer) { clearTimeout(oneLeftTimer); oneLeftTimer = null }
  window.removeEventListener('resize', updateRibbonViewport)
  store.setCenterCaption('') // don't leave the project sentence lingering
})

// ── Overview finale trigger ──
// The moment the active branch reaches depth 10 (`overviewEligible`), the
// store runs the finale sequence: the four quadrants' suggestion images
// flash to full opacity, hold, then fade out clockwise (RelationComponent
// reacts to store.overviewFinalePhase), after which confirmOverview fires
// and the circle of 10 reveals. The central image + all interaction are
// frozen for the duration (store gates hover-zoom + history nav).
watch(
  () => store.overviewEligible,
  (eligible) => { if (eligible) store.startOverviewFinale() },
)

// Track the visible silhouette of the active central image so .center-
// anchor (the hover-zoom sensor) matches it pixel-for-pixel. With the
// previous fixed 22vmin square, landscape/portrait images extended past
// the hit area (cursor on image → no hover) and small images left blank
// in-box space (cursor in box → hover with nothing under it). Disabled
// in expanded mode (overview-confirmed) — the deck spreads into a circle
// then and there's no single "active layer at the centre" to match.
const centerAnchorStyle = computed(() => {
  if (store.overviewConfirmed) return {}
  const id = store.activeCentralImageId
  if (!id) return {}
  const dims = naturalDimsVmin(id)
  // Match the deck's CENTER_IMAGE_SCALE so the hover hit-box tracks the
  // (reduced) visible central image, not the full natural dims.
  return {
    width: `${dims.width * CENTER_IMAGE_SCALE}vmin`,
    height: `${dims.height * CENTER_IMAGE_SCALE}vmin`,
  }
})

// Post-overview circle of images: hovering any image forwards its id to
// the project canvases via set-highlight, so the matching sprite lights up
// on every canvas (same primitive VIEW_2 sprite-hover and VIEW_4 cell-hover
// use). Pure perception — does NOT touch the path, focus, or camera, so the
// contributed path stays frozen exactly as drawn. null on leave clears it.
function onCircleHover(id: string | null) {
  store.setHighlight(id)
  // The moment the user FIRST hovers a circle image AFTER entering the explore
  // (single-path) view, start the reveal timer: the ribbons fade in at 8s, then
  // the "look for others" rotate caption appears 1.5s later. Gated on
  // singlePathViewActive so hovering the circle during the earlier finale
  // doesn't arm it. Armed once.
  if (id && store.singlePathViewActive && !ribbonsReady.value && ribbonHoverTimer === null) {
    ribbonHoverTimer = setTimeout(() => {
      // Ribbons first…
      ribbonsReady.value = true
      // …then the caption 1.5s later.
      finaleTimers.push(setTimeout(() => {
        exploreRibbonsCaptionVisible.value = true
        finaleTimers.push(setTimeout(() => { exploreRibbonsCaptionVisible.value = false }, EXPLORE_HOLD_MS))
      }, RIBBON_CAPTION_AFTER_RIBBONS_MS))
    }, RIBBON_REVEAL_AFTER_HOVER_MS)
    finaleTimers.push(ribbonHoverTimer)
  }
}

function dotStateAt(i: number): 'current' | 'past' | 'future' | 'empty' {
  if (i >= store.navigationHistory.length) return 'empty'
  if (i === store.historyIndex) return 'current'
  if (i < store.historyIndex) return 'past'
  return 'future'
}

function onDotClick(i: number) {
  if (i < store.navigationHistory.length) store.jumpToHistory(i)
}

// "Start over" appears only after the user has explored at least this many
// corner ribbons (each pick refreshes the corners, so every pick is a
// different ribbon).
const REPLAY_PICKS_FOR_RESTART = 3

// Restart the whole experience from VIEW_0. A full reload is the clean reset
// (re-boots at VIEW_0 + re-registers the socket so the boot handshake wipes
// project's path/state), rather than leaving stale interaction state behind a
// partial view swap. To make it read like the other view transitions, the
// VIEW_4 surface first FADES OUT to the shared gradient backdrop, THEN reloads
// — so the visible change is a smooth gradient cross-fade, not a hard cut.
const RESTART_FADE_MS = 600
const restarting = ref(false)
function onStartOver() {
  if (restarting.value) return
  restarting.value = true
  // Fade the single-explore map label out with the rest of the restart fade
  // (600ms label fade ≈ RESTART_FADE_MS, so it's gone before the reload).
  store.hideMapLabel()
  finaleTimers.push(setTimeout(() => { window.location.reload() }, RESTART_FADE_MS))
}
</script>

<template>
  <section
    class="view view-3"
    :class="[`bg-${store.canvasBackground}`, {
      minimal: store.overviewConfirmed,
      interpreting: store.view3InterpretationMode,
      'finale-fadeout': store.overviewFinalePhase === 'fadeout',
      'is-restarting': restarting,
    }]"
  >
    <div
      v-if="store.view2ExitReason === 'auto'"
      class="reveal-overlay"
      aria-hidden="true"
    />

    <!-- Single full-field beige blur veil for interpretation mode. One element
         (not four per-quadrant) so there are no seams between quadrants that
         would read as a phantom second cross. Sits above the full-opacity
         cells + grid cross (blurring them into a soft field) but below the
         interpretation text panels (z: 6) so the quadrant copy stays legible. -->
    <div
      v-if="store.view3InterpretationMode && !store.overviewConfirmed"
      class="interpret-veil"
      aria-hidden="true"
    />

    <div v-if="!store.overviewConfirmed" class="grid">
      <RelationComponent component-id="component_1" label="Source" position="tl" />
      <RelationComponent component-id="component_2" label="Form" position="tr" />
      <RelationComponent component-id="component_3" label="Semantic" position="bl" />
      <RelationComponent component-id="component_4" label="Time" position="br" />
    </div>

    <div v-if="!store.overviewConfirmed" class="top-controls">
      <button
        class="bg-toggle"
        :class="{ active: store.canvasBackground === 'black', revealed: store.view3InterpretationMode }"
        :aria-pressed="store.canvasBackground === 'black'"
        aria-label="night background"
        @click="store.setCanvasBackground('black')"
      >
        <span class="dot dot-black" aria-hidden="true" />
      </button>
      <button
        class="interpret-control"
        :class="{ active: store.view3InterpretationMode }"
        :aria-pressed="store.view3InterpretationMode"
        aria-label="toggle interpretation mode"
        @click="store.toggleView3Interpretation()"
      >
        +
      </button>
      <button
        class="bg-toggle"
        :class="{ active: store.canvasBackground === 'gradient', revealed: store.view3InterpretationMode }"
        :aria-pressed="store.canvasBackground === 'gradient'"
        aria-label="day background"
        @click="store.setCanvasBackground('gradient')"
      >
        <span class="dot dot-white" aria-hidden="true" />
      </button>
    </div>

    <div
      class="center-anchor"
      :class="{
        suppressed: store.view3InterpretationMode,
        expanded: store.overviewConfirmed,
        'deck-fadeout': deckHidden,
      }"
      :style="centerAnchorStyle"
      aria-hidden="true"
      @mouseenter="store.setQuadrantHover(null)"
    >
      <Transition name="center-fade" mode="out-in" appear @after-leave="onCenterAfterLeave">
        <div :key="centerKey" class="center-focus">
          <CentralImage
            :ids="store.centeredStack"
            :active-index="store.centeredCircleIds ? 0 : store.centralStackActiveIndex"
            :expanded="store.overviewConfirmed"
            :reveal="store.overviewConfirmed"
            :reveal-key="centerKey"
            :reveal-stagger="0"
            :reveal-delay="400"
            :radius-scale="1.05"
            :radius-scale-y="0.85"
            source="original"
            @update:hovered="store.setCentralHovered"
            @hover="onCircleHover"
          />
        </div>
      </Transition>
    </div>

    <!-- "Explore others" — four existing Replay-proximity circles, one per
         corner, shown once the single-path view is active. Each is laid out as
         an L-shaped RIBBON hugging the window's two edges at that corner (90°
         bend, images touching, in circle order). Clicking one promotes it to
         the centre and redraws the project's single-state path
         (store.centerReplayCircle). -->
    <TransitionGroup name="ribbon" tag="div" class="ribbon-layer" appear>
      <button
        v-for="(circle, i) in (store.singlePathViewActive && ribbonsReady ? store.replayCircles : [])"
        :key="circle.anchorId"
        class="corner-ribbon"
        :data-corner="CORNERS[i]?.key"
        :aria-label="`focus existing circle ${i + 1}`"
        @click="onCornerClick(i)"
      >
        <!-- horizontal arm — flush to the top/bottom window edge -->
        <span
          v-for="t in ribbonLayouts[i]?.hThumbs ?? []"
          :key="`h-${t.id}`"
          class="ribbon-thumb"
          :style="ribbonThumbStyle(CORNERS[i]?.key ?? 'tl', t, 'h')"
        >
          <AtlasThumb :id="t.id" fit="contain" source="original" />
        </span>
        <!-- vertical arm — flush to the left/right window edge -->
        <span
          v-for="t in ribbonLayouts[i]?.vThumbs ?? []"
          :key="`v-${t.id}`"
          class="ribbon-thumb"
          :style="ribbonThumbStyle(CORNERS[i]?.key ?? 'tl', t, 'v')"
        >
          <AtlasThumb :id="t.id" fit="contain" source="original" />
        </span>
      </button>
    </TransitionGroup>

    <p
      v-if="!store.overviewConfirmed"
      class="interpret-message"
      :class="{ visible: store.view3InterpretationMode }"
      aria-live="polite"
    >
      <template v-for="(line, i) in IMAGE_CREDIT_LINES" :key="i">
        <span :class="{ 'interpret-message-url': i === IMAGE_CREDIT_LINES.length - 1 }">{{ line }}</span>
        <br v-if="i < IMAGE_CREDIT_LINES.length - 1" />
      </template>
    </p>


    <!-- Post-overview finale: sentence 1 on the interface (centred, rotate
         style), 4s after the circle reveals. Sentence 2 plays on the project.
         (Interface-only here; the project sentence is set-center-caption.) -->
    <p
      v-if="store.overviewConfirmed && !store.singlePathViewActive"
      class="final-caption"
      :class="{ visible: finalCaptionVisible }"
      aria-live="polite"
    >
      <span class="caption-text">{{ FINAL_INTERFACE_TEXT }}</span>
    </p>

    <!-- "Look for others" prompt — interface centre only, appears WITH the
         corner ribbons (4s after the user starts hovering the circle). -->
    <p
      v-if="store.singlePathViewActive"
      class="final-caption"
      :class="{ visible: exploreRibbonsCaptionVisible }"
      aria-live="polite"
    >
      <span class="caption-text">{{ EXPLORE_RIBBONS_TEXT }}</span>
    </p>

    <!-- (No center cross anymore — the explore-others view is entered
         automatically once the finale rotate narration finishes; see
         startFinaleNarration → advanceToExplore.) -->

    <!-- "One image left to pick" — narrative rotate caption (same centred
         rotate-text style as the finale narration) played at branch depth 9
         (just after the 9th pick); the 10th completes the journey and runs the
         overview finale. Transient beat — fades in, holds, fades out. -->
    <p
      class="final-caption"
      :class="{ visible: oneLeftVisible }"
      aria-live="polite"
    >
      <span class="caption-text">{{ ONE_LEFT_TEXT }}</span>
    </p>
    <!-- Single "Start over" control at the top — appears only after the user
         has picked at least REPLAY_PICKS_FOR_RESTART different ribbons. Reuses
         the shared SkipButton (same class + parameters as the skip/next
         control), top-placed so it aligns with the top corner labels. Click →
         smooth gradient fade, then restart at VIEW_0. -->
    <SkipButton
      v-if="store.singlePathViewActive && store.replayPickCount >= REPLAY_PICKS_FOR_RESTART"
      label="Start over"
      @click="onStartOver"
    />

    <nav
      v-if="!store.overviewConfirmed"
      class="history-strip"
      aria-label="navigation history"
    >
      <ol class="strip-steps">
        <li
          v-for="i in MAX_BRANCH_DEPTH"
          :key="i"
          :class="dotStateAt(i - 1)"
          :tabindex="i - 1 < store.navigationHistory.length ? 0 : -1"
          :title="store.navigationHistory[i - 1] ?? ''"
          @click="onDotClick(i - 1)"
          @keydown.enter="onDotClick(i - 1)"
          @keydown.space.prevent="onDotClick(i - 1)"
        >
          <span class="step" />
        </li>
      </ol>
    </nav>
  </section>
</template>

<style scoped>
.view-3 {
  position: relative;
  width: 100vw;
  height: 100vh;
  /* Background comes from the global .bg-black / .bg-gradient class in
     app.vue, applied via :class="bg-${store.canvasBackground}". Setting
     `background` here would win against the global class due to scoped
     style specificity. */
  color: #595b54;
  overflow: hidden;
}
/* Grid cross — mirrors project's body::before (project/src/style.css L67-86)
   so the 2×2 split reads as the same structural surface in both apps.
   Project shows it whenever data-state is "split" or "overview"; in
   interface_nuxt, VIEW-3 mounts iff project is in split or overview, so
   the cross is unconditionally visible here. */
.view-3::before {
  content: "";
  position: absolute;
  inset: 5%;
  pointer-events: none;
  /* Above the interpretation veil (z: 5) so the beige tint doesn't wash the
     thin cross line out entirely; still below the central deck (z: 10). In
     interpretation mode the cross gets its OWN blur (see `.interpreting`
     below) so it stays a soft, discreet cross instead of vanishing. */
  z-index: 6;
  transition: filter 240ms ease-out, opacity 700ms ease-out;
  background:
    linear-gradient(to bottom,
      transparent calc(50% - 0.5px),
      rgba(166, 154, 128, 0.85) calc(50% - 0.5px),
      rgba(166, 154, 128, 0.85) calc(50% + 0.5px),
      transparent calc(50% + 0.5px)),
    linear-gradient(to right,
      transparent calc(50% - 0.5px),
      rgba(166, 154, 128, 0.85) calc(50% - 0.5px),
      rgba(166, 154, 128, 0.85) calc(50% + 0.5px),
      transparent calc(50% + 0.5px));
}
/* Overview finale `fadeout` phase — the grid cross fades out TOGETHER with
   the central deck (`.center-anchor.deck-fadeout`) and the corner labels
   (`.rel.finale-fadeout .corner-label`), all starting at the end of the
   700ms clock-effect dissolve. By the time `.minimal` removes it at confirm
   the cross has already faded to 0, so there's no visible cut. */
.view-3.finale-fadeout::before {
  opacity: 0;
}
/* `.minimal` mode (post-Contribute) — only the central image deck, the
   gradient backdrop, and the `See your path` button remain. The grid
   cross is part of "everything else" and gets suppressed too. */
.view-3.minimal::before {
  display: none;
}
/* In interpretation mode the cross stays visible but goes soft — blurred to
   match the veiled field behind it, never removed. */
.view-3.interpreting::before {
  filter: blur(3px);
}
/* Interpretation-mode beige blur veil — single full-viewport element so the
   four quadrants blur into one continuous field (no seams = no phantom
   cross). z: 5 sits above the cross (z: 4) and the full-opacity cells, below
   the text panels (z: 6) and the central deck (z: 10 suppressed). */
.interpret-veil {
  position: absolute;
  inset: 0;
  z-index: 5;
  /* Light beige tint — the blur does the heavy lifting for readability; the
     tint is kept low so the cross (and images) stay faintly visible behind
     the blur rather than being painted out. */
  background: rgba(232, 224, 206, 0.32);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  pointer-events: none;
}
/* Canvas-background modes live globally in app.vue (`.bg-black` /
   `.bg-gradient`) — shared across all views. .view-3 just applies the
   right class via `:class="bg-${store.canvasBackground}"`. */

@keyframes reveal-fade {
  from { opacity: 1; }
  to { opacity: 0; }
}
.reveal-overlay {
  position: fixed;
  inset: 0;
  background: #1a1a1a;
  z-index: 100;
  pointer-events: none;
  animation: reveal-fade 400ms ease-out forwards;
}

.grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  /* No background — the gradient from .view-3 must pass through unfiltered.
     The 1px gap reveals the gradient itself as the seam between quadrants. */
}

.center-anchor {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  /* Above `.rel:hover` (z: 50). Once the cursor was inside a quadrant,
     .rel:hover stayed true as the cursor moved toward the centre and the
     lifted .rel occluded the central image — quadrant hover kept firing
     even while the cursor was visually on the central image. With the
     centre on top, the moment the cursor enters its box .rel:hover drops
     false (cursor no longer designates .rel) and the centre's mouseenter
     fires, so setQuadrantHover(null) lands at the right beat. Cells don't
     overlap the centre geometrically (they sit at the outer corners of
     each quadrant), so this doesn't hide any cell hover feedback. */
  z-index: 60;
  /* Acts as the hover sensor that returns all four canvases to the
     default zoom-on-image (VIEW_4 hover-zoom rule). Was `none` so
     hovers fell through to the quadrant below the central image; the
     hit box overlaps the inner corner of each quadrant but the
     relation cells sit at 10% from the outer corners, so swallowing
     pointer events here doesn't block any cell. */
  pointer-events: auto;
  /* Fallback size — overridden inline (`:style="centerAnchorStyle"`)
     with the active image's natural dimensions in vmin so the hover
     hit area tracks the visible image silhouette. Width/height are
     NOT transitioned — on activeCentralImageId change, the new active
     layer is a fresh-mounted DOM element (new TransitionGroup key) so
     it paints at its target dims instantly; the hit area must snap
     in lockstep, not animate. A transition here would leave the hit
     area lagging behind the visible image for ~700ms after each
     click — exactly the "cursor on image but no hover" symptom the
     dynamic sizing is supposed to remove. */
  width: 22vmin;
  height: 22vmin;
  transition:
    opacity 240ms ease-out,
    filter 240ms ease-out;
}
/* unified field suppression during interpretation mode — same rule as
   .constellation.suppressed in RelationComponent so the central reference
   recedes with the relational field as a single perceptual background. */
.center-anchor.suppressed {
  opacity: 0.4;
  filter: blur(1px);
  /* In interpretation mode the centred `.interpret-message` (z: 11)
     must sit above the suppressed central deck — drop the centre's
     z below it. Hover-zoom isn't a concern here: the rel quadrants
     are .is-inert (pointer-events: none) in interpretation mode, so
     no quadrant hover can fire either way. */
  z-index: 10;
}
/* Overview finale `fadeout` phase — once the quadrants have disappeared the
   central image deck fades out smoothly (before the circle reveals), so the
   deck → ring hand-off has no size jump. Slower than the default 240ms
   opacity transition. */
.center-anchor.deck-fadeout {
  opacity: 0;
  transition: opacity 700ms ease-out;
}
/* Hover halo — warm beige glow matching the system palette
   (history-strip `.current` step, contribute button bloom). Targets
   ONLY the topmost layer (`.layer.is-active`) so the drop-shadow
   wraps just the active image's alpha contour, not the union of every
   stacked silhouette in the deck. No filter transition on the layer
   (its `transition` rule covers only transform/width/height), so the
   glow snaps in and out instantly — same feel as the quadrant cell
   hover. Suppressed in interpretation mode (`.center-anchor.suppressed`
   sits behind the `:not(.suppressed)` guard) — the central reference
   is intentionally receding then. Also disabled in `.expanded` (circle /
   overview) mode: there the cursor is over the whole deck while hovering
   any circle image, so this rule would force-glow the last selected image
   on every hover. Per-image hover emphasis in circle mode is owned by
   CentralImage's own `.is-highlighted` rule instead. */
.center-anchor:not(.suppressed):not(.expanded):hover :deep(.layer.is-active) {
  filter:
    drop-shadow(0 0 8px rgba(249, 236, 208, 0.75))
    drop-shadow(0 0 18px rgba(249, 236, 208, 0.45))
    drop-shadow(0 0 32px rgba(249, 236, 208, 0.22));
}

/* Centred circle wrapper — fills the center-anchor box. The `:key` bump
   (on overview confirm and each corner pick) remounts it so the inner
   CentralImage replays its drift reveal. No wrapper animation of its own —
   the per-image drift IS the entrance, and a wrapper fade/scale here would
   dim the seamless hand-off from the central image deck. */
.center-focus {
  position: absolute;
  inset: 0;
  transform-origin: center center;
}

/* Corner "existing circle" — now an L-shaped RIBBON hugging the window's two
   edges at the corner (no oval). The button is a 0-size anchor at the window
   corner; each image is absolutely positioned off it (offset + size computed
   in `ribbonLayout` / `ribbonThumbStyle`, keeping the image's natural ratio +
   size variation). Single click target → centerReplayCircle. Tune RIBBON_SCALE
   (image size), RIBBON_EDGE_GAP_VMIN (gap between the two ribbons on an edge)
   and RIBBON_VERTICAL_COUNT (images per side arm) in <script>. */
.corner-ribbon {
  position: absolute;
  width: 0;
  height: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  z-index: 40;
}
.corner-ribbon:focus-visible {
  outline: none;
}
.corner-ribbon[data-corner="tl"] { top: 0; left: 0; }
.corner-ribbon[data-corner="tr"] { top: 0; right: 0; }
.corner-ribbon[data-corner="bl"] { bottom: 0; left: 0; }
.corner-ribbon[data-corner="br"] { bottom: 0; right: 0; }

/* TransitionGroup wrapper — no box of its own (the buttons are absolute and
   anchor to .view-3); it only carries the fade transitions. */
.ribbon-layer {
  display: contents;
}

/* Each thumb is absolutely placed (top/bottom/left/right + width/height set
   inline by ribbonThumbStyle). The AtlasThumb fills it (contain → the natural
   aspect matches the inline w/h, so no letterboxing). Low opacity at rest;
   hovering ANYWHERE on the ribbon lifts the WHOLE group to full (mimics the
   relation-field reveal) — no per-image hover on the side (that's reserved for
   the centre circle). */
.ribbon-thumb {
  position: absolute;
  line-height: 0;
  opacity: 0.36; /* 10% less than the prior 0.4 rest opacity */
  transition: opacity 240ms ease-out;
}
.corner-ribbon:hover .ribbon-thumb,
.corner-ribbon:focus-visible .ribbon-thumb {
  opacity: 1;
}
.ribbon-thumb :deep(.atlas-thumb) {
  width: 100%;
  height: 100%;
}

/* Fade in/out for the corner ribbons (appear on entering explore-others, and
   swap on each corner pick) and for the centred circle — so nothing pops.
   The ribbon enter is deliberately slow + softly eased so the images drift in
   gently rather than snapping on. */
.ribbon-enter-active,
.ribbon-leave-active,
.ribbon-appear-active {
  transition: opacity 1100ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.ribbon-enter-from,
.ribbon-leave-to,
.ribbon-appear-from {
  opacity: 0;
}
.center-fade-enter-active,
.center-fade-leave-active,
.center-fade-appear-active {
  transition: opacity 450ms ease;
}
.center-fade-enter-from,
.center-fade-leave-to,
.center-fade-appear-from {
  opacity: 0;
}

.interpret-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0 1.5rem;
  max-width: 70rem;
  white-space: nowrap;
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.2;
  color: #595b54;
  opacity: 0;
  pointer-events: none;
  z-index: 11;
  transition: opacity 240ms ease-out;
}
.interpret-message.visible {
  opacity: 1;
}
.interpret-message-url {
  opacity: 0.8;
}

.overview-control {
  position: absolute;
  bottom: 4.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
}

/* Post-overview finale interface caption (sentence 1) — centred, rotate style
   (--rotate-size + the organic blue-grey glyph stroke on .caption-text),
   fading on the shared rotate timing. Sits in the empty centre of the circle. */
.final-caption {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0 1rem;
  max-width: min(46em, 88vw);
  text-align: center;
  font-size: var(--rotate-size);
  line-height: 1.4;
  color: #595b54;
  pointer-events: none;
  /* Above the centred circle deck (.center-anchor z:60) so the finale
     narration AND the explore-others prompt read on TOP of the circle of
     ten, not behind its side images. */
  z-index: 70;
  opacity: 0;
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing);
}
.final-caption.visible {
  opacity: 1;
}
.final-caption .caption-text {
  text-shadow:
    0 0 4px var(--rotate-panel-bg),
    0 0 6px var(--rotate-panel-bg),
    0 0 6px var(--rotate-panel-bg),
    0 0 9px var(--rotate-panel-bg),
    0 0 9px var(--rotate-panel-bg),
    0 0 12px var(--rotate-panel-bg),
    0 0 12px var(--rotate-panel-bg),
    0 0 15px var(--rotate-panel-bg),
    0 0 18px var(--rotate-panel-bg);
}

/* "Start over" now reuses the shared SkipButton component (same class +
   parameters), so its styling lives in SkipButton.vue — no local rule here. */

/* Smooth restart: fade the whole VIEW_4 surface out to the shared gradient
   backdrop (body wears the same day gradient), matching the other view
   cross-fades, before the page reloads into VIEW_0. */
.view-3.is-restarting {
  opacity: 0;
  pointer-events: none;
  transition: opacity 600ms var(--rotate-fade-easing);
}

/* `finale` — two stacked options shown after `See your path` is clicked.
   Vertical stack keeps each call-to-action on its own line so the warm
   pulse glow of each button doesn't overlap the next. */
.overview-control.finale {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

/* 3-column grid spanning the full viewport width: side buttons live in
   1fr columns and hug the centre; the interpret-control sits in the
   auto-sized middle column, which is the viewport's geometric centre
   regardless of how wide `night` / `gradient` text are. */
.top-controls {
  position: absolute;
  /* Aligned to the top corner labels (Mirror / Trace): those sit at
     top:0 + 0.75rem padding, so their text centre is ~1.12rem down.
     The buttons are 1.8rem tall, so top = 1.12 - 0.9 ≈ 0.22rem puts
     the button centres on the same line as the component titles. */
  top: 0.22rem;
  left: 0;
  right: 0;
  z-index: 12;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
}
.top-controls > .bg-toggle:first-of-type { justify-self: end; }
.top-controls > .bg-toggle:last-of-type  { justify-self: start; }
.interpret-control,
.bg-toggle {
  padding: 0.45rem 0.95rem;
  background: rgba(13, 13, 16, 0.7);
  color: #595b54;
  border: 1px solid #2a2a2e;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  cursor: pointer;
  transition: background 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out;
}

/* Background toggles are now circle-icon buttons. The colored dot itself
   represents the mode (black = night, white = day); the button frame is
   stripped so only the dot is visible. */
.bg-toggle {
  background: transparent;
  border-color: transparent;
  padding: 0;
  width: 1.8rem;
  height: 1.8rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Hidden by default — the background toggles are only revealed once the
     user clicks the `+` (interpretation mode). They keep their layout slot
     (opacity, not display) so the `+` stays centred between them. Clicking
     `+` again hides them. */
  opacity: 0;
  pointer-events: none;
  transition: opacity 240ms ease-out;
}
.bg-toggle.revealed {
  opacity: 1;
  pointer-events: auto;
}
.bg-toggle .dot {
  /* Square (not circle), sized to match the timeline history squares.
     Only the aspect changes — the toggle behaviour, click target
     (1.8rem button), fills, active ring and hover are unchanged. */
  width: 5px;
  height: 5px;
  border-radius: 0;
  display: block;
  transition: transform 150ms ease-out, box-shadow 150ms ease-out;
}
.bg-toggle .dot-black {
  background: #0d0d10;
  /* Faint outline so the black dot stays visible against the black
     background mode without merging into it. */
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
}
.bg-toggle .dot-white {
  background: #ffffff;
  /* Same idea inverted — keeps the white dot legible on the bright day
     gradient. */
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
}
.bg-toggle:hover .dot {
  transform: scale(1.15);
}
.bg-toggle.active .dot {
  /* Active mode: outline ring around the dot to mark current selection. */
  box-shadow: 0 0 0 1px currentColor, 0 0 0 3px rgba(255, 255, 255, 0.55);
}
.bg-toggle.active .dot-black { color: #0d0d10; }
.bg-toggle.active .dot-white { color: #ffffff; }
/* Interpret control is a single-glyph icon — no background, no border.
   The glyph is centered in a square box via flex so its visual centre
   sits on the button's geometric centre (typography baseline alone
   would leave it slightly low). Color is deliberately dark enough to
   read against the bright day gradient. */
.interpret-control {
  background: transparent;
  border-color: transparent;
  width: 1.8rem;
  height: 1.8rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  line-height: 1;
  letter-spacing: 0;
  color: #595b54;
}
.interpret-control:hover {
  color: #2a2e36;
}
.interpret-control.active {
  color: #2a2e36;
}
/* "Contribute to proxima" — surfaces once the active branch reaches the
   overview cap. Uses the title typography (`.proximity-panel-title` in
   app.vue: serif / 0.95rem / 600 / 0.02em) and the same warm pulsing
   bloom palette as VIEW_3's `.cross-button`.

   Perf note: the bloom is rendered as a single radial-gradient on a
   ::before pseudo-element animating opacity only (GPU-compositable),
   instead of an animated `text-shadow`. text-shadow with multi-layer
   large-radius blurs is paint-per-character per-frame — fine for the
   single `+` glyph in VIEW_3, but ~21× the cost on this 21-char string,
   and was visibly slowing the interface. */
.contribute {
  position: relative;
  background: transparent;
  border: none;
  padding: 0.4rem 0.6rem;
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.2;
  color: #595b54;
  cursor: pointer;
  transition: color 150ms ease-out;
}
.contribute:hover {
  color: #2a2e36;
}
.contribute::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 280px;
  height: 140px;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    ellipse at center,
    rgba(255, 245, 215, 0.95) 0%,
    rgba(252, 230, 180, 0.85) 12%,
    rgba(245, 215, 155, 0.65) 28%,
    rgba(238, 200, 135, 0.4) 50%,
    rgba(230, 188, 120, 0.18) 72%,
    rgba(220, 175, 105, 0) 100%
  );
  pointer-events: none;
  z-index: -1;
  opacity: 0;
  animation: contribute-glow 1.8s ease-in-out infinite;
  will-change: opacity;
}

@keyframes contribute-glow {
  0%, 100% { opacity: 0; }
  50% { opacity: 0.45; }
}

/* Navigation history — a row of discrete square steps. No prev/next
   controls, no connecting line: navigation happens by clicking a square
   directly (same handler as the old dots). The wrapper is neutral (no
   pill, no border) so the squares read as a bare sequence over the
   gradient. Behaviour is unchanged — this is a visual-only restyle. */
/* `bottom: 0.75rem` matches the bottom corner labels' (`Semantic` / `Time`)
   padding so the square row sits on the same band — reads as one line
   with the component names. */
.history-strip {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 11;
  display: flex;
  align-items: center;
}
.strip-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 0.15rem;
  align-items: center;
}
.strip-steps li {
  padding: 0.1rem;
  outline: none;
  cursor: pointer;
}
.strip-steps li.empty {
  cursor: default;
}
/* Square step. No border-radius — discrete squares. Every square glows
   at all times.
     past    (behind current)  → beige 100%
     current (the actual image) → beige + pulsing glow
     future  (ahead, already selected after stepping back) → beige 50%
     empty   (not reached yet)  → component-name colour + warm title halo
   Classes recompute from historyIndex, so stepping forward/back
   reassigns past/future automatically. */
.strip-steps li .step {
  display: block;
  width: 5px;
  height: 5px;
  background: #595b54;
  transition: background 150ms ease-out, box-shadow 150ms ease-out, opacity 150ms ease-out;
  box-sizing: border-box;
}
/* behind current — full beige */
.strip-steps li.past .step {
  background: #f9ecd0;
  box-shadow:
    0 0 5px rgba(249, 236, 208, 0.9),
    0 0 12px rgba(249, 236, 208, 0.55),
    0 0 22px rgba(249, 236, 208, 0.3);
}
/* ahead of current but already selected — same beige, dimmed to 50% */
.strip-steps li.future .step {
  background: #f9ecd0;
  opacity: 0.5;
  box-shadow:
    0 0 5px rgba(249, 236, 208, 0.9),
    0 0 12px rgba(249, 236, 208, 0.55),
    0 0 22px rgba(249, 236, 208, 0.3);
}
/* the actual image: same beige, same size, pulsing glow */
.strip-steps li.current .step {
  background: #f9ecd0;
  animation: step-pulse 1.8s ease-in-out infinite;
}
/* waiting — not reached yet */
.strip-steps li.empty .step {
  background: #595b54;
  box-shadow:
    0 0 6px rgba(255, 252, 230, 0.9),
    0 0 16px rgba(255, 248, 220, 0.55),
    0 0 32px rgba(255, 244, 210, 0.3);
}
.strip-steps li:not(.empty):hover .step,
.strip-steps li:not(.empty):focus .step {
  background: #fff3da;
}

/* pulsing glow for the current image — a single small square, so the
   box-shadow animation is cheap (no per-char paint blow-up). */
@keyframes step-pulse {
  0%, 100% {
    box-shadow:
      0 0 5px rgba(249, 236, 208, 0.85),
      0 0 12px rgba(249, 236, 208, 0.5),
      0 0 22px rgba(249, 236, 208, 0.28);
  }
  50% {
    box-shadow:
      0 0 9px rgba(249, 236, 208, 1),
      0 0 22px rgba(249, 236, 208, 0.8),
      0 0 40px rgba(249, 236, 208, 0.5);
  }
}
</style>
