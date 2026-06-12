<script setup lang="ts">
import { computed, watch, ref, onMounted, onBeforeUnmount } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import RelationComponent from '~/components/relations/RelationComponent.vue'
import CentralImage from '~/components/CentralImage.vue'
import SkipButton from '~/components/SkipButton.vue'
import { ROTATE_FADE_OUT_MS } from '~/utils/rotateText'

const store = useInteractionStore()
const { naturalDimsVmin } = useCentralImageDims()

const MAX_BRANCH_DEPTH = 10

// ── "Explore others" side circles (post-"See your path") ──
// TWO existing Replay-proximity circles, half-visible on each side edge (swipe
// look): `index` picks which loaded circle, `key` which edge. Click → centre it.
const SIDE_CIRCLES = [
  { key: 'left', index: 0 },
  { key: 'right', index: 1 },
] as const
// Ring size for the side half-circles (CentralImage radius multipliers).
// radiusScaleY > 1 rounds the default wide oval toward a circle so the
// half cut by the edge reads as a clean semicircle.
const SIDE_CIRCLE_RADIUS_SCALE = 1
const SIDE_CIRCLE_RADIUS_SCALE_Y = 1.3

// Bumped on each corner selection (and on overview confirm) so the centred
// circle wrapper remounts and the inner CentralImage replays its drift
// reveal from the centre.
const centerKey = ref(0)

function onCornerClick(i: number) {
  centerKey.value++
  store.centerReplayCircle(i)
  // The FIRST side-circle click drives the rest of the end sequence (once):
  if (!endSequenceStarted) {
    endSequenceStarted = true
    // The "Previous participants…" intro gives way to "Click around…", held 5s.
    exploreRibbonsIntroVisible.value = false
    exploreRibbonsCaptionVisible.value = true
    finaleTimers.push(setTimeout(() => {
      exploreRibbonsCaptionVisible.value = false
    }, CLICK_AROUND_HOLD_MS))
    // After the click, reveal the end controls (Start over + About).
    finaleTimers.push(setTimeout(() => {
      endControlsReady.value = true
    }, END_CONTROLS_AFTER_CLICK_MS))
  }
}

// Clicking the center cross enters the explore-others view. EXPLORE_TEXT shows
// on the PROJECT centre only (one line) — NOT on the interface. The corner
// ribbons are armed by the first circle hover after the dim lifts (see onCircleHover).
const EXPLORE_TEXT = 'See how you traveled.'
// A second sentence shown right after the first, same hold duration. Everything
// downstream (map keywords, ribbons) is pushed back by one sentence cycle so it
// still lands after BOTH sentences have played (see advanceToExplore).
const EXPLORE_TEXT_2 = 'Your journey crosses different areas of the maps.'
// "See how…" appears after the journey sentence leaves / single map reveals
// (SINGLE_REVEAL_MS 8250). Hand-tuned to 10750ms (+500 over the prior 10250).
const EXPLORE_DELAY_MS = 11750 // wait before the "See how…" project caption appears
const EXPLORE_HOLD_MS = 5000
// Interface darkening while the two project sentences play. The fade duration
// is no longer set here — the store derives it from the opacity delta so this
// darkening moves at the SAME constant SPEED as VIEW_2's (see
// store.setInterfaceDim). Only the target level is set here.
const EXPLORE_DIM_LEVEL = 0.7      // 0 = full brightness, 1 = fully dark
// Empty beat between the two sentences (lets the first fade out before the
// second drifts in) — matches the rotate-caption fade timing.
const EXPLORE_SENTENCE_GAP_MS = 600
// After "See how…" fades out, wait this long before revealing the map keywords.
const MAPWORDS_AFTER_SEE_HOW_MS = 500
const ribbonsReady = ref(false)
// Hovering the final circle is disabled while the interface is darkened (during
// the narration); it unlocks once the dim lifts (end of the 2nd explore sentence).
const circleHoverReady = ref(false)
// Interface-only rotate caption shown the moment the dim deactivates (hover
// unlocks) — invites the user to hover the circle.
const EXPLORE_HOVER_HINT_TEXT = 'Hover over images to see where they live from a map to another.'
const EXPLORE_HOVER_HINT_DELAY_MS = 4000 // beat after the dim lifts before the hint appears
const exploreHoverHintVisible = ref(false)
// True once the user has hovered a circle image. If they hover BEFORE the hint's
// delay elapses, the hint never appears (no point prompting them to do something
// they're already doing). See onCircleHover + the hint timer.
const hasHoveredCircle = ref(false)
// Interface-only rotate caption shown BEFORE the ribbons (context-setting). It
// STAYS visible (no auto-fade) until the user clicks a side circle.
const EXPLORE_RIBBONS_INTRO_TEXT = 'Previous participants have also wandered through Proxima.'
// "Proxima" italicised (rendered via v-html — static trusted constant).
const exploreRibbonsIntroHtml = computed(() => EXPLORE_RIBBONS_INTRO_TEXT.replace('Proxima', '<i>Proxima</i>'))
const exploreRibbonsIntroVisible = ref(false)
// The ribbons appear this long after the intro caption shows.
const RIBBONS_AFTER_INTRO_MS = 1500
// Interface-only rotate caption shown WHEN the user clicks a side circle —
// invites them to keep exploring. Holds CLICK_AROUND_HOLD_MS, then fades.
const EXPLORE_RIBBONS_TEXT = 'Look around to discover their explorations.'
const exploreRibbonsCaptionVisible = ref(false)
const CLICK_AROUND_HOLD_MS = 5000
// The end controls (Start over + About) appear END_CONTROLS_AFTER_CLICK_MS after
// the FIRST side-circle (ribbon) click — i.e. 4s after the user first clicks a
// "Previous participants…" ribbon.
const END_CONTROLS_AFTER_CLICK_MS = 4000
// True once the end controls (Start over + credits) should appear. Gates BOTH
// the controls and the end caption (replaces the old replay-pick-count gate).
const endControlsReady = ref(false)
// Guards the once-only end sequence so it fires on the FIRST side-circle click.
let endSequenceStarted = false
// The ribbon sequence is HOVER-gated: RIBBONS_AFTER_HOVER_MS after the user FIRST
// hovers a circle image, the "Previous participants…" caption appears (and stays),
// and the ribbons appear RIBBONS_AFTER_INTRO_MS later.
const RIBBONS_AFTER_HOVER_MS = 7000
// Armed once on the first post-dim circle hover (see onCircleHover).
let ribbonHoverTimer: ReturnType<typeof setTimeout> | null = null
// Advance into the explore-others (single-path) view. Runs automatically from
// startFinaleNarration — the finale goes straight here, no overview dezoom.
function advanceToExplore() {
  store.enterSinglePathView()
  // EXPLORE_TEXT — PROJECT centre only, a beat after the advance; holds, fades.
  // Project is in `single` here (enterSinglePathView morphs split → single),
  // where #center-caption is normally gated off — `allowSingle` opts this one
  // caption past that guard (and `single-ok` keeps it on one line).
  finaleTimers.push(setTimeout(() => {
    store.setCenterCaption(EXPLORE_TEXT, 'rotate', true)        // sentence 1 in
    finaleTimers.push(setTimeout(() => {
      store.setCenterCaption('')   // "See how…" begins fading out
      // Second sentence drifts in after the fade beat, held the same duration.
      finaleTimers.push(setTimeout(() => {
        store.setCenterCaption(EXPLORE_TEXT_2, 'rotate', true)  // sentence 2 in
        finaleTimers.push(setTimeout(() => {
          store.setCenterCaption('') // sentence 2 begins fading out
          store.setInterfaceDim(0)   // interface brightens back (constant-speed fade)
          circleHoverReady.value = true                   // circle hover unlocks once bright
          // …and the hover hint appears after the brighten — but ONLY if the
          // user hasn't already started hovering the circle by then (no point
          // telling them to do what they're doing). It STAYS until the first
          // real hover (dismissed in onCircleHover), and does NOT auto-fade.
          finaleTimers.push(setTimeout(() => {
            if (!hasHoveredCircle.value) exploreHoverHintVisible.value = true
          }, EXPLORE_HOVER_HINT_DELAY_MS))
          // …then the map keywords/subjects/years appear 500ms after that fade-out.
          finaleTimers.push(setTimeout(() => { store.showMapWords() }, MAPWORDS_AFTER_SEE_HOW_MS))
          // The ribbon sequence is NOT scheduled here anymore — it's armed by
          // the first circle hover (now possible since the dim just lifted).
        }, EXPLORE_HOLD_MS))
      }, EXPLORE_SENTENCE_GAP_MS))
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

// "You can now explore…" dismisses the instant the user actually picks an image
// in a quadrant — the central image changes, so the prompt has served its
// purpose and shouldn't linger over the new selection. Hiding it here also
// short-circuits its pending auto-fade (the finaleTimers entry is harmless: it
// only re-sets the already-false ref).
watch(() => store.activeCentralImageId, () => { relationalIntroVisible.value = false })

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
watch(() => store.overviewFinalePhase, (p) => { if (p === 'transition') deckHidden.value = true })
function onCenterAfterLeave() { deckHidden.value = false }

// ── Post-overview finale narration ──
// No overview dezoom: a short beat after the circle reveals (overviewConfirmed),
// the project runs its masked morph straight to the single path-map, and at the
// SAME instant the INTERFACE "unique journey" sentence fades in (gradient). The
// project is hidden behind its render mask while it morphs, so the eye goes to
// the interface; once the single map is revealed, "See how..." plays on the
// project (advanceToExplore drives both the morph and that caption). The old
// second sentence on the project ("Your images found different neighbors…") was
// removed.
const FINAL_INTERFACE_TEXT = 'Your selection formed a unique path through your journey.'
// Journey sentence appears 1.8s AFTER the circle (the transition itself starts
// with the circle, at t=0 — they're decoupled). Brought 1s earlier so it holds
// 1s longer; its fade-out still lands at SINGLE_REVEAL_MS (project reveal).
const JOURNEY_TEXT_DELAY_MS = 1800
// …and fades out at the project's mask-reveal moment (enterSinglePathView:
// FADE_IN 250 + MORPH 0 + HOLD 8000 = 8250) so the interface text leaving and
// the project reveal correspond.
const SINGLE_REVEAL_MS = 8250
const finalCaptionVisible = ref(false) // interface journey sentence
let finaleTimers: ReturnType<typeof setTimeout>[] = []

// VIEW_4 entry guidance — a centred rotate caption (same .final-caption style)
// shown once when the relational view is entered (i.e. right after the user
// clicks the central image in VIEW_3). Fades in after a short settle beat,
// holds, fades out.
const RELATIONAL_INTRO_TEXT = '	You can now explore the corpus through the centered image.'
const RELATIONAL_INTRO_DELAY_MS = 1400 // settle beat before it drifts in
const RELATIONAL_INTRO_HOLD_MS = 5500  // "You can now explore…" full-opacity hold before fading out
const RELATIONAL_INTRO2_HOLD_MS = 6000 // mode-words caption full-opacity hold before fading out
const relationalIntroVisible = ref(false)

// Second entry caption — names the four proximity modes, each mode word glowing
// with its quadrant colour (source/form/semantic/time → orange/sky/green/pink,
// mirroring QUADRANT_SOLID_COLORS in RelationComponent.vue — keep in lockstep).
// Plays right after RELATIONAL_INTRO_TEXT fades out.
const RELATIONAL_MODES = [
  { word: 'Source', color: '#f0a05c' },
  { word: 'Form', color: '#6cb4e6' },
  { word: 'Semantic', color: '#74cf92' },
  { word: 'Time', color: '#ef82ac' },
] as const
const RELATIONAL_INTRO2_GAP_MS = 250 // beat between caption 1 fading out and caption 2 drifting in
const relationalIntro2Visible = ref(false)

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
// depth 9 (picks the 10th, steps back) before the hold elapses. Selection is
// LOCKED for the whole hold (reusing relationalSelectionLocked, which gates
// activateCentral) so the user can't blow past the "last pick" message — they
// can only pick the 10th once it has been read and faded.
watch(oneImageLeftReached, (reached) => {
  if (oneLeftTimer) { clearTimeout(oneLeftTimer); oneLeftTimer = null }
  if (reached) {
    oneLeftVisible.value = true
    store.relationalSelectionLocked = true
    oneLeftTimer = setTimeout(() => {
      oneLeftVisible.value = false
      store.relationalSelectionLocked = false
    }, ONE_LEFT_HOLD_MS)
  } else {
    oneLeftVisible.value = false
    store.relationalSelectionLocked = false
  }
})

function startFinaleNarration() {
  // The project transition fires the instant the circle appears (t=0).
  // advanceToExplore runs the masked split→single morph (enterSinglePathView)
  // and schedules "See how…" on the project (EXPLORE_DELAY_MS later).
  advanceToExplore()
  // The interface journey sentence appears 1.5s after the circle, then fades out
  // at the reveal moment so its exit corresponds to the project revealing single.
  finaleTimers.push(setTimeout(() => { finalCaptionVisible.value = true }, JOURNEY_TEXT_DELAY_MS))
  finaleTimers.push(setTimeout(() => {
    finalCaptionVisible.value = false
    // Darken the interface JUST AFTER "You produced…" leaves (same params as
    // VIEW_2's narration dim, level 0.7 / 600ms). Held through the project
    // narration ("See how…" + "Your journey…"); lifted at the 2nd sentence's
    // end, which also unlocks the circle hover.
    store.setInterfaceDim(EXPLORE_DIM_LEVEL)
  }, SINGLE_REVEAL_MS))
}

onMounted(() => {
  updateRibbonViewport()
  window.addEventListener('resize', updateRibbonViewport)
  // VIEW_3's Skip (stage 2) lands here: skip ONLY the mode-words caption and
  // open directly on "You can now explore…", with hover + selection live
  // immediately. The "You can now explore…" sentence still drifts in (and fades
  // after its hold) so the landing reads the same as the organic path — just
  // without the leading mode-words sentence. (Consume the flag so it's one-shot.)
  if (store.bypassRelationalIntro) {
    store.bypassRelationalIntro = false
    store.relationalSelectionLocked = false
    relationalIntroVisible.value = true
    finaleTimers.push(setTimeout(() => {
      relationalIntroVisible.value = false
    }, RELATIONAL_INTRO_HOLD_MS))
    return
  }
  // Lock image selection until the entry narration finishes (released when the
  // 2nd caption "You can now explore…" fades out below).
  store.relationalSelectionLocked = true
  // VIEW_4 entry guidance — INVERTED order: the mode-words caption ("Your
  // selected image shares proximity…") plays FIRST, then "You can now explore…".
  finaleTimers.push(setTimeout(() => {
    relationalIntro2Visible.value = true
    finaleTimers.push(setTimeout(() => {
      relationalIntro2Visible.value = false
      // After the mode-words caption fades, drift "You can now explore…" in.
      finaleTimers.push(setTimeout(() => {
        relationalIntroVisible.value = true
        // Unlock hover + selection the MOMENT "You can now explore…" APPEARS
        // (not when it fades out) — relationalSelectionLocked gates both
        // setQuadrantHover and activateCentral.
        store.relationalSelectionLocked = false
        finaleTimers.push(setTimeout(() => {
          relationalIntroVisible.value = false
        }, RELATIONAL_INTRO_HOLD_MS))
      }, ROTATE_FADE_OUT_MS + RELATIONAL_INTRO2_GAP_MS))
    }, RELATIONAL_INTRO2_HOLD_MS))
  }, RELATIONAL_INTRO_DELAY_MS))
})

onBeforeUnmount(() => {
  for (const t of finaleTimers) clearTimeout(t)
  finaleTimers = []
  if (oneLeftTimer) { clearTimeout(oneLeftTimer); oneLeftTimer = null }
  store.relationalSelectionLocked = false // never leave selection stuck locked
  window.removeEventListener('resize', updateRibbonViewport)
  store.setCenterCaption('') // don't leave the project sentence lingering
  store.setInterfaceDim(0, { instant: true }) // never leave the interface stuck dim
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
  // Hover is disabled while the interface is darkened during the narration; it
  // unlocks once the dim lifts (end of the 2nd explore sentence).
  if (!circleHoverReady.value) return
  store.setHighlight(id)
  // Hovering a circle image dismisses the "Hover over images…" hint (and marks
  // that the user hovered, so the hint's delayed reveal is suppressed if they
  // hovered before it would have appeared).
  if (id) {
    hasHoveredCircle.value = true
    exploreHoverHintVisible.value = false
  }
  // The FIRST hover (now that the dim has lifted) arms the ribbon sequence:
  // RIBBONS_AFTER_HOVER_MS later the "Previous user…" caption plays, then the
  // ribbons, then "Look around…". Armed once.
  if (id && ribbonHoverTimer === null) {
    ribbonHoverTimer = setTimeout(() => { scheduleRibbons() }, RIBBONS_AFTER_HOVER_MS)
    finaleTimers.push(ribbonHoverTimer)
  }
}

// Run the explore-others reveal sequence: the "Previous user…" intro caption,
// then the ribbons, then the "Look around…" caption. Armed by the first
// post-dim circle hover + RIBBONS_AFTER_HOVER_MS (see onCircleHover).
function scheduleRibbons() {
  // Intro caption ("Previous participants…") — STAYS until the user clicks a
  // side circle (hidden in onCornerClick). The ribbons appear
  // RIBBONS_AFTER_INTRO_MS after it shows; the rest of the sequence ("Click
  // around…" + the end controls) is driven by the first side-circle click.
  exploreRibbonsIntroVisible.value = true
  finaleTimers.push(setTimeout(() => {
    ribbonsReady.value = true
  }, RIBBONS_AFTER_INTRO_MS))
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

// The credits / about-the-project overlay (and the "i" + day/night control that
// opens it) now live globally in app.vue so they persist across the whole
// experience. They were removed from VIEW_4.
</script>

<template>
  <section
    class="view view-3"
    :class="[`bg-${store.canvasBackground}`, {
      minimal: store.overviewConfirmed,
      interpreting: store.view3InterpretationMode,
      // The grid cross is part of the rest — it fades once the last quadrant
      // is gone (the rest phase), together with the corner labels.
      'finale-fadeout': store.overviewFinalePhase === 'rest' || store.overviewFinalePhase === 'transition',
      'is-restarting': restarting,
    }]"
  >
    <!-- Teleport target for the Semantic quadrant's bridge connector lines.
         Low z-index (below the cells / central image, above the gradient) so the
         leader lines tuck UNDER the images. RelationComponent teleports its two
         line segments in here; the bridge TAGS stay on top (body overlay). -->
    <div id="bridge-line-layer" class="bridge-line-layer" aria-hidden="true" />

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
      @click="store.toggleView3Interpretation()"
    />

    <div v-if="!store.overviewConfirmed" class="grid">
      <RelationComponent component-id="component_1" label="Source" position="tl" />
      <RelationComponent component-id="component_2" label="Form" position="tr" />
      <RelationComponent component-id="component_3" label="Semantic" position="bl" />
      <RelationComponent component-id="component_4" label="Time" position="br" />
    </div>

    <!-- The top "About" control (day/night dots + "i") + the credits overlay
         now live globally in app.vue so they persist across the whole
         experience — see *Persistent "About" control*. -->

    <!-- The big circle-wide glow was removed — each selected image keeps its own
         per-image glow via CentralImage's `glow-all`. -->

    <div
      class="center-anchor"
      :class="{
        suppressed: store.view3InterpretationMode,
        expanded: store.overviewConfirmed,
        'deck-fadeout': deckHidden,
        // During the overview finale the central image is fading out — no hover
        // halo on it (it isn't `expanded` yet, so the hover rule below would
        // otherwise still fire).
        finale: store.overviewFinaleActive,
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
            :interactive="circleHoverReady"
            :glow-all="store.overviewConfirmed"
            source="original"
            @update:hovered="store.setCentralHovered"
            @hover="onCircleHover"
          />
        </div>
      </Transition>
      <!-- Teleport target for the Semantic bridge's centre-side segment. Sits in
           the central deck's own stacking context at z 50 — BELOW the active
           (current) image (z 100) but ABOVE the older stacked images (z ≤ 10),
           so the line is sandwiched: tucked under the current image, over the
           rest. (Overflow is visible, so the segment extends out to the tags.) -->
      <div id="bridge-line-mid" class="bridge-line-mid" aria-hidden="true" />
    </div>

    <!-- "Explore others" — four existing Replay-proximity circles, one per
         corner, shown once the single-path view is active. Each is laid out as
         an L-shaped RIBBON hugging the window's two edges at that corner (90°
         bend, images touching, in circle order). Clicking one promotes it to
         the centre and redraws the project's single-state path
         (store.centerReplayCircle). -->
    <!-- Explore-others: TWO foreign "replay" circles, one half-visible on each
         side edge — each circle's CENTRE sits ON the edge so only its inner half
         (a semicircle of images) shows, like a swipe carousel. The whole
         half-circle is ONE click target → promotes it to the centre and redraws
         the project's single-state path (store.centerReplayCircle). Per-image
         hover stays on the centre circle only. -->
    <TransitionGroup name="ribbon" tag="div" class="side-circle-layer" appear>
      <div
        v-for="side in (store.singlePathViewActive && ribbonsReady ? SIDE_CIRCLES : [])"
        :key="side.key"
        class="side-circle"
        :data-side="side.key"
        role="button"
        :aria-label="`focus the ${side.key} existing circle`"
        @click="onCornerClick(side.index)"
      >
        <CentralImage
          :ids="store.replayCircles[side.index]?.ids ?? []"
          :active-index="-1"
          expanded
          :interactive="false"
          :reveal="false"
          source="original"
          :radius-scale="SIDE_CIRCLE_RADIUS_SCALE"
          :radius-scale-y="SIDE_CIRCLE_RADIUS_SCALE_Y"
        />
      </div>
    </TransitionGroup>

    <!-- The image-credit text no longer shows during interpretation mode (the
         first `+`). It lives ONLY in the credits `+` menu at the end (the
         `.credits-panel` below). Interpretation mode now reveals the field +
         per-quadrant text only; the centre stays blank on both screens. -->

    <!-- Post-overview finale journey sentence (interface, centred, rotate
         style). Fades in (gradient) at the same instant the project starts its
         masked morph to the single path-map, then fades out. Stays mounted
         through singlePathViewActive (the transition flips it true) so the fade
         can complete — its own finalCaptionVisible flag drives show/hide. -->
    <p
      v-if="store.overviewConfirmed"
      class="final-caption"
      :class="{ visible: finalCaptionVisible }"
      aria-live="polite"
    >
      <span class="caption-text">{{ FINAL_INTERFACE_TEXT }}</span>
    </p>

    <!-- Hover hint — interface centre only, appears as the dim deactivates. -->
    <p
      v-if="store.singlePathViewActive"
      class="final-caption"
      :class="{ visible: exploreHoverHintVisible }"
      aria-live="polite"
    >
      <span class="caption-text">{{ EXPLORE_HOVER_HINT_TEXT }}</span>
    </p>

    <!-- Intro caption — interface centre only, plays BEFORE the ribbons. -->
    <p
      v-if="store.singlePathViewActive"
      class="final-caption"
      :class="{ visible: exploreRibbonsIntroVisible }"
      aria-live="polite"
    >
      <span class="caption-text" v-html="exploreRibbonsIntroHtml"></span>
    </p>

    <!-- "Click around…" prompt — interface centre only, shown for 5s when the
         user clicks a side circle. -->
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

    <!-- VIEW_4 entry guidance — centred rotate caption shown once on entry
         (right after the central-image click in VIEW_3). Fades in, holds,
         fades out. -->
    <p
      class="final-caption"
      :class="{ visible: relationalIntroVisible }"
      aria-live="polite"
    >
      <span class="caption-text">{{ RELATIONAL_INTRO_TEXT }}</span>
    </p>

    <!-- Second entry caption — names the four proximity modes, each mode word
         glowing with its quadrant colour. Plays right after the first fades. -->
    <p
      class="final-caption"
      :class="{ visible: relationalIntro2Visible }"
      aria-live="polite"
    >
      <span class="caption-text"
        >Your selected image shares proximity with surrounding images through:<br /><!--
        --><template v-for="(m, i) in RELATIONAL_MODES" :key="m.word">{{ i === 0 ? '' : i === RELATIONAL_MODES.length - 1 ? ' & ' : ', ' }}<span
          class="mode-word"
          :style="{ '--mode-glow': m.color }"
          >{{ m.word }}</span></template></span>
    </p>

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
    <!-- "Start over" control at the BOTTOM — appears with the end caption
         (endControlsReady, 10s after the first side-circle click). Reuses the
         shared SkipButton (default bottom placement, aligned to the bottom
         corner labels). Click → smooth gradient fade, then restart at VIEW_0. -->
    <SkipButton
      v-if="store.singlePathViewActive && endControlsReady"
      label="Start Over"
      @click="onStartOver"
    />

    <!-- The "About" control + credits overlay are now global (app.vue), shared
         across the whole experience — removed from VIEW_4. -->

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
      transparent calc(50% - 0.6px),
      rgba(166, 154, 128, 0.85) calc(50% - 0.6px),
      rgba(166, 154, 128, 0.85) calc(50% + 0.6px),
      transparent calc(50% + 0.6px)),
    linear-gradient(to right,
      transparent calc(50% - 0.6px),
      rgba(166, 154, 128, 0.85) calc(50% - 0.6px),
      rgba(166, 154, 128, 0.85) calc(50% + 0.6px),
      transparent calc(50% + 0.6px));
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
  /* Pure blur, no tint — just a neutral blurry field (no bluish/whitening
     cast). The blur alone separates the text from the field. */
  background: transparent;
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  /* Clickable so a click on the blurred field exits interpretation mode
     (no need to click the `+` again). The interactive surfaces that sit
     ABOVE the veil — central deck (z:10), corner labels / text panels (z:6),
     the `+` and bg dots (top-controls) — keep their own clicks. */
  pointer-events: auto;
  cursor: pointer;
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

/* Teleport target for the Semantic bridge connector lines. z-index 0 keeps it
   ABOVE the gradient background but BELOW the suggestion cells (z 1–4), the
   cross (z 6) and the central deck (z 60), so the leader lines render under the
   images. Full-viewport so RelationComponent's centre-anchored connectors land
   correctly. */
.bridge-line-layer {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
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
/* Re-specify the active layer's transition in single-image mode so the hover
   halo's drop-shadow EASES in/out instead of snapping. The base `.layer` rule
   (in CentralImage) transitions only transform/width/height; we keep those and
   add `filter` so the glow fades up and away smoothly. Scoped to the
   non-expanded / non-finale centre (in expanded/circle mode the glow is owned by
   CentralImage's own `.is-highlighted` rule, and the finale runs its own pulse). */
.center-anchor:not(.expanded):not(.finale) :deep(.layer.is-active) {
  transition:
    transform 900ms cubic-bezier(0.45, 0, 0.55, 1),
    width 900ms cubic-bezier(0.45, 0, 0.55, 1),
    height 900ms cubic-bezier(0.45, 0, 0.55, 1),
    filter 320ms ease-out;
}
/* Hover halo — warm beige glow matching the system palette
   (history-strip `.current` step, contribute button bloom). Targets
   ONLY the topmost layer (`.layer.is-active`) so the drop-shadow
   wraps just the active image's alpha contour, not the union of every
   stacked silhouette in the deck. The `filter` now eases via the
   transition rule above, so the glow blooms in and away smoothly rather
   than snapping. Suppressed in interpretation mode (`.center-anchor.suppressed`
   sits behind the `:not(.suppressed)` guard) — the central reference
   is intentionally receding then. Also disabled in `.expanded` (circle /
   overview) mode: there the cursor is over the whole deck while hovering
   any circle image, so this rule would force-glow the last selected image
   on every hover. Per-image hover emphasis in circle mode is owned by
   CentralImage's own `.is-highlighted` rule instead. */
.center-anchor:not(.suppressed):not(.expanded):not(.finale):hover :deep(.layer.is-active) {
  /* Blue-grey glow matching the rotate-text stroke (--rotate-panel-bg ≈
     rgb(175,180,188)). Diffuse + strong — larger blur radii, higher alpha. */
  filter:
    drop-shadow(0 0 16px rgba(175, 180, 188, 0.95))
    drop-shadow(0 0 34px rgba(175, 180, 188, 0.7))
    drop-shadow(0 0 60px rgba(175, 180, 188, 0.42));
}
/* After the 10th pick, the finale fades everything else out and leaves the
   SELECTED image alone in the centre — pulse a blue-grey glow on it so the eye
   lands on the contributed centre. Runs only while the finale is active. */
.center-anchor.finale :deep(.layer.is-active) {
  animation: center-select-pulse 1.4s ease-in-out infinite;
}
@keyframes center-select-pulse {
  0%, 100% {
    filter:
      drop-shadow(0 0 8px rgba(175, 180, 188, 0.45))
      drop-shadow(0 0 18px rgba(175, 180, 188, 0.22));
  }
  50% {
    filter:
      drop-shadow(0 0 22px rgba(175, 180, 188, 0.95))
      drop-shadow(0 0 46px rgba(175, 180, 188, 0.6))
      drop-shadow(0 0 76px rgba(175, 180, 188, 0.35));
  }
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

/* Teleport target for the Semantic bridge's centre segment. z-index 50 places
   it in the central deck's stacking context between the active layer (z 100)
   and the older layers (z ≤ 10) — the sandwich. Fills .center-anchor so the
   connector's 50%/50% lands on the viewport centre; overflow stays visible so
   the line extends out toward the tags. */
.bridge-line-mid {
  position: absolute;
  inset: 0;
  z-index: 50;
  pointer-events: none;
}

/* Explore-others SIDE CIRCLES — two foreign replay circles, one half-visible on
   each side edge. Each `.side-circle` box STRADDLES the edge (its centre lands
   ON the edge via the translate), so the CentralImage ring centred in the box
   is cut in half by the viewport → only the inner semicircle of images shows
   (swipe look). The whole box is ONE click target; low rest opacity, full on
   hover — the group-lift the old ribbons had. Per-image hover stays on the
   centre circle. Ring size: SIDE_CIRCLE_RADIUS_SCALE* in <script>. */
.side-circle-layer {
  display: contents;
}
.side-circle {
  position: absolute; /* anchors to .view-3 (full viewport), like the old ribbons */
  top: 50%;
  width: 64vmin;
  height: 64vmin;
  cursor: pointer;
  pointer-events: auto;
  z-index: 40;
  opacity: 0.36; /* rest opacity, same as the old ribbons */
  transition: opacity 240ms ease-out;
  /* Overall size of the half-circle (ring + images together), scaled around the
     box centre which sits on the edge — so shrinking keeps it edge-anchored. */
  --side-scale: 0.85;
}
.side-circle:hover {
  opacity: 1;
}
/* left:0 / right:0 + the half-shift puts each box's CENTRE on the edge. */
.side-circle[data-side="left"]  { left: 0;  transform: translate(-50%, -50%) scale(var(--side-scale)); }
.side-circle[data-side="right"] { right: 0; transform: translate(50%, -50%) scale(var(--side-scale)); }

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

/* The credits / about overlay styles now live globally in app.vue (the
   persistent "About" control). */

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
  /* Wide enough that the entry caption's first line ("…images through:") keeps
     "through:" on line 1 before its explicit <br/>. Shorter captions don't reach
     this, so they're unaffected. */
  max-width: min(52em, 92vw);
  text-align: center;
  font-size: var(--rotate-size);
  line-height: var(--rotate-line-height);
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
  color: var(--rotate-fill);
  text-shadow:
    0 0 4px var(--rotate-stroke),
    0 0 6px var(--rotate-stroke),
    0 0 6px var(--rotate-stroke),
    0 0 9px var(--rotate-stroke),
    0 0 9px var(--rotate-stroke),
    0 0 12px var(--rotate-stroke),
    0 0 12px var(--rotate-stroke),
    0 0 15px var(--rotate-stroke),
    0 0 18px var(--rotate-stroke);
}

/* Each mode name carries its own quadrant-coloured glow (--mode-glow set
   inline per word), overriding the neutral blue-grey stroke above. */
.final-caption .caption-text .mode-word {
  font-style: italic;
  text-shadow:
    0 0 4px var(--mode-glow),
    0 0 6px var(--mode-glow),
    0 0 6px var(--mode-glow),
    0 0 9px var(--mode-glow),
    0 0 9px var(--mode-glow),
    0 0 12px var(--mode-glow),
    0 0 12px var(--mode-glow),
    0 0 15px var(--mode-glow),
    0 0 18px var(--mode-glow);
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

/* The top "About" control (day/night dots + "i") now lives globally in
   app.vue — its styles moved there with it. */

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
  /* Fade with the rest of the finale (cells/deck/cross/labels/mask) instead of
     popping out. The finale fade-out happens on `dissolve` (before confirm), so
     by the time `v-if` removes the strip at confirm it has already faded to 0. */
  transition: opacity 700ms ease-out;
}
.view-3.finale-fadeout .history-strip {
  opacity: 0;
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
  /* Timeline is now display-only — the squares still render, glow, and update
     with navigation, but are no longer clickable (jump-to-history disabled).
     pointer-events:none also drops the pointer cursor + hover tooltip; the
     @click/@keydown handlers stay in the template, just never fire. */
  pointer-events: none;
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
