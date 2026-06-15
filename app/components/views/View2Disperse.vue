<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import AtlasThumb from '~/components/AtlasThumb.vue'
import SkipButton from '~/components/SkipButton.vue'
import type { ImageId } from '~/types/interaction'
import { ROTATE_FADE_OUT_MS } from '~/utils/rotateText'

// Rotating intro caption — same Vue <Transition> + shared --rotate-*
// timing as View1Explanation `.caption` and View3Transition
// `.intro-caption`. Two sentences are scheduled per-sentence (ENTRY_HOLDS — 7s
// full-opacity each); on the last sentence the rotation stops and the caption
// fades, then the morph + project narration begin. The click triggers a
// smooth fade-out (entryCaptionVisible → false) before viewState
// advances to VIEW_3.
//
// VIEW_2 workaround: Vue's `<Transition appear>` was firing immediately
// instead of honouring the `--rotate-appear-delay` on VIEW_2 — likely
// because the iframe load + the parent view-level transition's reflow
// were committing styles before the appear classes could register. As a
// result, the first sentence drifted in WITHOUT the 1400ms hold that
// VIEW_1 and VIEW_3 have. To match VIEW_1's appear timing exactly, this
// view gates the FIRST render of the <p> on a setTimeout instead of
// relying on Vue's appear, then lets the enter-* classes (which read
// the same `--rotate-*` vars) handle the fade. The setTimeout duration
// is read from `--rotate-appear-delay` minus `--rotate-empty-beat` at
// runtime, so any CSS-var tweak in :root automatically propagates here.
// Interface NARRATION — rotates in the middle. NOT mirrored to project
// anymore: project shows its OWN centred narration (PROJECT_PANELS) later.
// Explicit line breaks (\n, honoured via `white-space: pre-line` on
// .entry-caption): sentence 1 breaks after "books", sentence 2 after "vision".
const ENTRY_PANELS = [
  'Proxima brings together thousands of images',

  'These images once belonged to the past, bounded by old books.',
 
   'Today you can explore them,\nthrough multiple ways of seeing at once',
]
// Project-ONLY centred narration, played (2s after the user's first hover) via
// set-center-caption with the same rotate params. Each sentence fades in,
// holds PROJECT_HOLDS[i], fades out — sequenced by playProjectNarration().
const PROJECT_PANELS = [
  'The same images are organized here\ninto four distinct maps.',
  'Each map structures them according to a different criterion.',
]
// CLICK_ACTION is a centred ROTATE caption (same `.entry-caption` style/timing
// as the intro narration), drifting in after the project narration once the
// interface has brightened back up (see playProjectNarration). (The earlier
// "Explore the images…" HOVER_ACTION bottom prompt was removed.)
const CLICK_ACTION = 'Select it to begin.'
// HOVER_ACTION is a centred ROTATE caption shown BEFORE the click action — it
// invites the user to move the mouse / explore once hover unlocks; it then
// fades and swaps to CLICK_ACTION (which is what also unlocks selection).
const HOVER_ACTION = 'Find an image that sparks your interest.'
const hoverCaptionVisible = ref(false)
// Delay after the project narration fades before the "Move your mouse…" caption
// appears (and hover/picking unlocks at that exact moment). It then STAYS until
// the user hovers an image, which dismisses it immediately — see dismissHoverCaption().
const HOVER_CAPTION_DELAY_MS = 1000
const clickCaptionVisible = ref(false)
const entryIndex = ref(0)
// Current entry sentence with "Proxima" italicised (rendered via v-html — the
// panels are static trusted constants, so no XSS surface). Mirrors VIEW_1's
// `panelHtml`.
const entryHtml = computed(() => (ENTRY_PANELS[entryIndex.value] ?? '').replace('Proxima', '<i>Proxima</i>'))
// CLICK_ACTION with "Proxima" italicised (same v-html approach as entryHtml).
const clickHtml = computed(() => CLICK_ACTION.replace('Proxima', '<i>Proxima</i>'))
const entryCaptionVisible = ref(false) // gated by setTimeout below — see comment block
// Iframe handle — used to post `view0:enable-hover` when phase 2 begins so the
// embedded canvas un-hides its cursor and enables picking.
const frameEl = ref<HTMLIFrameElement | null>(null)
// Per-sentence FULL-OPACITY hold (ms) for the interface intro — the time each
// sentence actually sits at opacity 1. The scheduler in onMounted adds the
// appear-delay / fade overhead on top (FIRST_APPEAR_MS / GAP_MS below) so the
// on-screen hold matches these exactly. All three sentences → 7s each.
const ENTRY_HOLDS = [5000, 6000, 7000]
// Mirror of the --rotate-* vars in app.vue :root (appear-delay 1400 · empty-beat
// 200 · fade 400). FIRST_APPEAR_MS = mount → sentence 1 fully visible; GAP_MS =
// trigger → next sentence fully visible under <Transition mode="out-in">.
const FIRST_APPEAR_MS = 1400 + ROTATE_FADE_OUT_MS
const GAP_MS = ROTATE_FADE_OUT_MS + 200 + ROTATE_FADE_OUT_MS
// Per-sentence FULL-OPACITY hold (ms) for the project narration — the time each
// sentence actually sits at opacity 1 on the feedback screen. The project
// caption's fade-in eats PROJECT_FADEIN_MS (empty-beat + fade ≈ 600ms), which
// the sequencer adds on top, so the on-screen hold matches these exactly and
// both sentences are equal. Independent of the interface intro hold.
const PROJECT_HOLDS = [7000, 7000]
const PROJECT_FADEIN_MS = 200 + ROTATE_FADE_OUT_MS
// ── VIEW_2 morph + darkening choreography ──
// After the 2nd intro sentence ("It was structured…") fades, the INTERFACE
// darkens and — coordinated with it — the standalone project morphs single →
// overview grid (store.morphToOverviewGrid). The project narration then
// auto-plays. Hover/picking unlocks when the 2nd project sentence ("Those
// configurations…") APPEARS, but the interface stays dark through that whole
// sentence and only brightens back up when it ENDS.
const VIEW2_DIM_LEVEL = 0.7   // 0 = full brightness, 1 = fully dark
// (Fade duration is no longer set here — the store derives it from the opacity
// delta so all darkenings share one constant SPEED. See store.setInterfaceDim.)
// Wait after "It was structured…" has faded before the darken + morph beat.
const MORPH_AFTER_SENTENCE_MS = ROTATE_FADE_OUT_MS
// Wait after the darken + morph before the project narration begins (lets the
// hidden morph settle + the dark beat land first).
const NARRATION_AFTER_MORPH_MS = 4200
// On image click, the disperse field (iframe sprites) fades out smoothly
// BEFORE the view advances to VIEW_3, so the swap happens from a calm
// gradient instead of cross-fading busy moving sprites into VIEW_3's layout
// (which read as harsh). Mirrors the mask-cover smoothing on the VIEW_1 →
// VIEW_2 step. The pinned preview of the clicked image is intentionally NOT
// faded here — it stays as a visual anchor through the swap.
const entryExiting = ref(false)
const ENTRY_EXIT_MS = 500
// Interaction is gated in TWO stages (the intro narration must finish first):
//  - hoverEnabled: true once the interface narration clears (HOVER_ACTION
//    appears) — hover preview/highlight only, NO selection.
//  - clickEnabled: true only after the project narration finishes — selection
//    unlocks and CLICK_ACTION replaces HOVER_ACTION.
const hoverEnabled = ref(false)
const clickEnabled = ref(false)
// Per-sentence rotation timeouts (replaces the old uniform setInterval so each
// sentence can hold its own FULL-OPACITY duration — see ENTRY_HOLDS).
let entryRotationTimers: ReturnType<typeof setTimeout>[] = []
let entryFirstShowTimer: ReturnType<typeof setTimeout> | null = null
// Fires the post-intro morph + narration beat (the last-sentence branch of the
// rotation timer schedules it); cancelled on skip/unmount via clearEntryTimer.
let hoverRevealTimer: ReturnType<typeof setTimeout> | null = null
// Every setTimeout spawned by the project-narration sequencer, so unmount can
// cancel a sequence mid-flight.
let projectNarrationTimers: ReturnType<typeof setTimeout>[] = []

function clearEntryTimer() {
  for (const t of entryRotationTimers) clearTimeout(t)
  entryRotationTimers = []
  if (entryFirstShowTimer) {
    clearTimeout(entryFirstShowTimer)
    entryFirstShowTimer = null
  }
  if (hoverRevealTimer) {
    clearTimeout(hoverRevealTimer)
    hoverRevealTimer = null
  }
  for (const t of projectNarrationTimers) clearTimeout(t)
  projectNarrationTimers = []
}

// Guards the single → overview morph so it runs exactly once (the entry timer
// fires it; skipToPick guarantees it if the user skips first).
let overviewMorphed = false

// Arm hover/picking: un-hide the iframe cursor + enable picking, and unlock the
// interface-side hover gate. Called when the 2nd project sentence appears (and
// from skipToPick). Idempotent.
function armHover() {
  if (hoverEnabled.value) return
  hoverEnabled.value = true
  frameEl.value?.contentWindow?.postMessage(
    { type: 'view0:enable-hover' },
    expectedOrigin.value || '*',
  )
}

// Forward the interface day/night toggle to the disperse embed so its backdrop
// matches. The embed is off the socket relay (it can't get `set-canvas-bg`), so
// this postMessage is the channel. Posted on iframe load and on every toggle.
// NOTE: the `watch` that calls this lives below, AFTER `store` is defined — a
// watch getter runs immediately, so registering it up here (before `const
// store`) would hit `store` in its temporal dead zone and crash setup.
function postCanvasBg() {
  frameEl.value?.contentWindow?.postMessage(
    { type: 'view0:set-bg', mode: store.canvasBackground },
    expectedOrigin.value || '*',
  )
}

// First hover: KEEP the "Find an image…" (HOVER_ACTION) prompt visible —
// clicking is already live (clickEnabled was set when the prompt appeared), so
// the user can select straight from here. Just schedule the "Select it…"
// (CLICK_ACTION) nudge to swap in after a beat. Armed once. If the user clicks
// BEFORE this fires, it's cancelled in the image-click handler, so "Select it…"
// never appears.
let clickActionTimer: ReturnType<typeof setTimeout> | null = null
function dismissHoverCaption() {
  if (!hoverCaptionVisible.value || clickActionTimer != null) return
  clickActionTimer = setTimeout(() => {
    hoverCaptionVisible.value = false   // swap: "Find an image…" → "Select it…"
    clickCaptionVisible.value = true
    clickActionTimer = null
  }, ROTATE_FADE_OUT_MS + 2500)
  projectNarrationTimers.push(clickActionTimer)
}

// Coordinated beat AFTER the 2nd intro sentence ("It was structured…"):
// darken the interface + morph the project single → overview grid together,
// then auto-play the project narration once the morph has settled.
function startMorphAndNarration() {
  store.setInterfaceDim(VIEW2_DIM_LEVEL) // interface darkens (constant-speed fade)
  if (!overviewMorphed) {
    overviewMorphed = true
    store.morphToOverviewGrid()                            // project morph (mask-hidden)
  }
  projectNarrationTimers.push(setTimeout(playProjectNarration, NARRATION_AFTER_MORPH_MS))
}

// Sequences the project-only centred narration (auto-played after the morph):
// each PROJECT_PANELS sentence fades in (set-center-caption rotate), holds
// PROJECT_PANEL_MS, fades out. The 2nd sentence ("Those configurations…") is
// the cue to brighten the interface back up AND unlock hover/picking; after the
// last sentence fades, the "Select an image…" rotate caption + selection unlock.
function playProjectNarration() {
  let i = 0
  const showSentence = () => {
    const sentenceIndex = i
    store.setCenterCaption(PROJECT_PANELS[i] ?? '', 'rotate')
    if (i === 1) {
      // 2nd sentence appears → interface brightens at its END (else branch).
      // Hover/picking is NOT armed here — it only unlocks when the
      // "Move your mouse…" caption appears (see armHover() below).
    }
    projectNarrationTimers.push(setTimeout(() => {
      store.setCenterCaption('') // fade current sentence out
      i++
      if (i < PROJECT_PANELS.length) {
        projectNarrationTimers.push(setTimeout(showSentence, ROTATE_FADE_OUT_MS))
      } else {
        // End of the 2nd sentence "Those configurations…" → the interface
        // brightens back up (the darkening held through the whole sentence).
        store.setInterfaceDim(0)
        // Narration done: 1s later the "Move your mouse…" rotate caption appears
        // AND hover/picking unlocks at that exact moment (not before). It STAYS
        // until the user hovers an image, which dismisses it IMMEDIATELY (→ click
        // caption). So an idle user keeps reading the prompt; the moment they
        // hover, it swaps. See dismissHoverCaption().
        projectNarrationTimers.push(setTimeout(() => {
          hoverCaptionVisible.value = true
          armHover()
          // Selection works the MOMENT the "Find an image…" caption appears — no
          // hover-then-wait gate. (The caption still swaps to CLICK_ACTION on
          // hover, but clicking a sprite is already live here.)
          clickEnabled.value = true
          // If the cursor is already on a sprite the moment it appears, swap
          // right away (no hover event would fire while stationary).
          if (lastHoverId != null) dismissHoverCaption()
        }, HOVER_CAPTION_DELAY_MS))
      }
    }, (PROJECT_HOLDS[sentenceIndex] ?? 0) + PROJECT_FADEIN_MS))
  }
  showSentence()
}

// Reads a CSS custom property as milliseconds. Falls back to 0 if the
// value is missing or unparseable.
function readMsVar(name: string): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (v.endsWith('ms')) return parseFloat(v)
  if (v.endsWith('s')) return parseFloat(v) * 1000
  return parseFloat(v) || 0
}

const store = useInteractionStore()
// Mirror the interface day/night toggle into the disperse embed (see
// postCanvasBg above). Registered here — after `store` exists — because a watch
// getter runs immediately.
watch(() => store.canvasBackground, postCanvasBg)
const config = useRuntimeConfig()
// Per-image natural dimensions in vmin — shared with CentralImage so
// VIEW_2 previews land at the same footprint as the VIEW_3 / VIEW_4
// deck (no longer a fixed 22vmin square).
const { naturalDimsVmin } = useCentralImageDims()
// `?embed=1` puts project into a self-contained mode: it boots straight
// into the `disperse` state and does NOT connect to the socket relay, so
// the standalone project window stays in `single` and is unaffected by
// anything VIEW-0 does. The iframe receives native pointer events directly;
// it raycasts and posts hover + click image ids back via postMessage.
const projectUrl = computed(() => {
  const base = config.public.projectUrl as string
  return base.includes('?') ? `${base}&embed=1` : `${base}?embed=1`
})

const expectedOrigin = computed(() => {
  try {
    return new URL(config.public.projectUrl as string).origin
  } catch {
    return ''
  }
})

// Classical hover preview: the currently-hovered sprite shows its image at
// full opacity instantly; moving to a new sprite or off the field removes it
// immediately. No fade-in, no fade-out, no hold/timers — purely tied to
// whether a sprite is hovered.

const MARGIN_VMIN = 2

type Preview = {
  uid: number
  id: ImageId
  left: number
  top: number
  widthVmin: number
  heightVmin: number
  startTime: number // when this preview spawned
  pinned: boolean
  expireStartTime: number // performance.now() at demotion
  expireStartOpacity: number // opacity at demotion
  opacity: number
}
const previews = ref<Preview[]>([])
let nextUid = 1
let lastHoverId: ImageId | null = null

function clampedTopLeft(cursorX: number, cursorY: number, widthVmin: number, heightVmin: number) {
  // Preview spawns at the cursor's upper-right: bottom-left corner of
  // the box sits OFFSET_PX away from the cursor, so the box hangs
  // up-and-to-the-right. Keeps the sprite under the cursor visible.
  const OFFSET_PX = 10
  const vw = window.innerWidth
  const vh = window.innerHeight
  const vmin = Math.min(vw, vh) / 100
  const w = widthVmin * vmin
  const h = heightVmin * vmin
  const margin = MARGIN_VMIN * vmin
  const rawLeft = cursorX + OFFSET_PX
  const rawTop = cursorY - OFFSET_PX - h
  return {
    left: Math.max(margin, Math.min(rawLeft, vw - w - margin)),
    top: Math.max(margin, Math.min(rawTop, vh - h - margin)),
  }
}

function demoteAllPinned() {
  // Classical hover — the preview exists only while a sprite is hovered, so
  // clearing it (on hover-out, or before showing a new one) removes it
  // immediately: no hold, no fade, no animation loop.
  if (previews.value.length) previews.value = []
}

function spawnPreview(id: ImageId, cursorX: number, cursorY: number) {
  // New sprite hovered — demote any existing pin so it starts fading
  // from its current opacity, then push the new pin at full lifecycle.
  demoteAllPinned()
  const dims = naturalDimsVmin(id)
  const { left, top } = clampedTopLeft(cursorX, cursorY, dims.width, dims.height)
  previews.value.push({
    uid: nextUid++,
    id,
    left,
    top,
    widthVmin: dims.width,
    heightVmin: dims.height,
    startTime: performance.now(),
    pinned: true,
    expireStartTime: 0,
    expireStartOpacity: 0,
    opacity: 1, // instant appear — no fade-in, no animation
  })
}

function onMessage(event: MessageEvent) {
  if (event.origin !== expectedOrigin.value) {
    console.warn('[view0] dropped message from unexpected origin', event.origin)
    return
  }
  const data = event.data as { type?: string; imageId?: unknown; x?: unknown; y?: unknown } | null
  if (!data) return
  if (data.type === 'view0:image-hover') {
    // Hover is armed only once the 2nd project sentence appears (armHover) — so
    // before that this early-returns even if the iframe posts hover events.
    if (!hoverEnabled.value) return
    const next = typeof data.imageId === 'string' ? data.imageId : null
    // The user moved onto a sprite → dismiss the "Move your mouse…" prompt (if its
    // hold has armed it). No-op until armed, so an idle user keeps the prompt.
    if (next != null) dismissHoverCaption()
    // Hover lights the CORRESPONDING IMAGE on the standalone project (the iframe
    // lights its own sprite locally). The project narration is NOT hover-driven
    // anymore — it auto-plays after the morph (see startMorphAndNarration).
    store.setHighlight(next)
    // The big preview at the cursor (the "image view") now appears as soon as
    // hover is unlocked (PHASE 2 — the "Explore…" prompt), so the user sees the
    // hovered image at full size immediately rather than waiting for the
    // project narration to finish. (We're already past the hoverEnabled guard
    // above, so no further gate is needed here.)
    if (next != null && next !== lastHoverId) {
      // Fresh sprite entered — spawn a preview at the spot the cursor hit it.
      const x = typeof data.x === 'number' ? data.x : window.innerWidth / 2
      const y = typeof data.y === 'number' ? data.y : window.innerHeight / 2
      spawnPreview(next, x, y)
    } else if (next == null && lastHoverId != null) {
      // Cursor left all sprites — demote the current pin so it fades out.
      demoteAllPinned()
    }
    lastHoverId = next
    return
  }
  if (data.type === 'view0:image-click') {
    // Selecting is inert until the project narration has finished (clickEnabled).
    if (!clickEnabled.value) return
    if (typeof data.imageId !== 'string') return
    if (entryExiting.value) return // ignore further clicks once the exit began
    const id = data.imageId
    // Stop any running rotation timer regardless of caption state.
    clearEntryTimer()
    // Cancel the pending "Select it…" swap — clicked before it appeared, so it
    // must never show.
    if (clickActionTimer) { clearTimeout(clickActionTimer); clickActionTimer = null }
    // Fade the caption (if still up), the bottom prompts, and the disperse
    // field out together, then advance once the field has calmed. The clicked
    // image's pinned preview stays visible as an anchor through the swap.
    entryCaptionVisible.value = false
    hoverCaptionVisible.value = false
    clickCaptionVisible.value = false
    // Clear any project caption still mirrored on the feedback screen.
    store.setCenterCaption('')
    entryExiting.value = true
    setTimeout(() => store.selectImage(id), ENTRY_EXIT_MS)
  }
}

// "Next" skip button — jumps straight to the pickable state (phase 3),
// bypassing the interface intro + project narrations. Picking is armed, the
// hover preview works, and the "Select an image…" prompt is shown; the user
// then picks an image to advance to VIEW_3 as normal (the button does NOT
// auto-advance — it just unlocks selection early).
// Keeps the Skip button mounted through its 500ms exit fade — otherwise the
// `clickEnabled` flip below removes it via v-if on the same tick and the fade
// is cut. Cleared after the fade so the button then unmounts.
const skipFading = ref(false)

function skipToPick() {
  if (clickEnabled.value || entryExiting.value) return
  skipFading.value = true
  setTimeout(() => { skipFading.value = false }, 500)
  clearEntryTimer()
  entryCaptionVisible.value = false     // drop the intro caption if still up
  hoverCaptionVisible.value = false     // drop the "Move your mouse…" caption if up
  store.setInterfaceDim(0, { instant: true }) // drop any in-flight dim (skip bypasses narration)
  store.setCenterCaption('')            // clear any in-flight project narration
  // Guarantee the project reached the overview grid — VIEW_3 expects it. If the
  // user skipped before the morph beat, fire it now (instant-ish, no dark beat).
  if (!overviewMorphed) {
    overviewMorphed = true
    store.morphToOverviewGrid()
  }
  clickEnabled.value = true             // unlock selection
  clickCaptionVisible.value = true      // "Select an image…" rotate caption
  armHover()                            // arm iframe picking + interface hover gate
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  // First-render delay (replaces Vue Transition's `appear` for this
  // view — see top-of-file comment block). Once entryCaptionVisible
  // flips true, Vue Transition's enter-active class adds its own
  // `--rotate-empty-beat` delay before the 500ms fade. Subtract that
  // from the appear-delay target so the total elapsed time from mount
  // to first sentence visible matches VIEW_1 exactly.
  const appearDelayMs = readMsVar('--rotate-appear-delay')
  const emptyBeatMs = readMsVar('--rotate-empty-beat')
  const firstShowWait = Math.max(0, appearDelayMs - emptyBeatMs)
  entryFirstShowTimer = setTimeout(() => {
    entryCaptionVisible.value = true
    entryFirstShowTimer = null
  }, firstShowWait)
  // Per-sentence rotation, scheduled (relative to mount) so each sentence's
  // FULL-OPACITY hold equals ENTRY_HOLDS[i]. Sentence 1 is fully visible at
  // FIRST_APPEAR_MS; we flip to the next index after its hold, and each later
  // sentence becomes fully visible GAP_MS after the flip. After the LAST
  // sentence's hold, fade it out, then (ROTATE_FADE_OUT_MS later) darken the
  // interface + morph single → overview + auto-play the project narration —
  // unchanged choreography. The view doesn't auto-advance; the user still picks.
  let t = FIRST_APPEAR_MS + (ENTRY_HOLDS[0] ?? 0)
  for (let i = 1; i < ENTRY_PANELS.length; i++) {
    const next = i
    entryRotationTimers.push(setTimeout(() => { entryIndex.value = next }, t))
    t += GAP_MS + (ENTRY_HOLDS[i] ?? 0)
  }
  entryRotationTimers.push(setTimeout(() => {
    entryCaptionVisible.value = false
    hoverRevealTimer = setTimeout(() => {
      startMorphAndNarration()
      hoverRevealTimer = null
    }, MORPH_AFTER_SENTENCE_MS)
  }, t))
})
// NOTE: the interface narration is no longer mirrored to project. The project
// shows its OWN centred narration (PROJECT_PANELS), played by
// playProjectNarration() 2s after the first hover — see above.

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  clearEntryTimer()
  // Clear the mirrored caption so it doesn't linger on project into VIEW_3.
  store.setCenterCaption('')
  // Lift any active interface dim so it can't carry into VIEW_3 (e.g. the user
  // clicks to advance while the narration dim is still up).
  store.setInterfaceDim(0)
})
</script>

<template>
  <section class="view view-0" :class="[`bg-${store.canvasBackground}`, { 'is-exiting': entryExiting }]">
    <iframe
      ref="frameEl"
      class="project-frame"
      :src="projectUrl"
      title="project disperse canvas"
      @load="postCanvasBg"
    />
    <!-- Rotating intro caption — same shared `--rotate-*` vars and same
         Vue <Transition> shape as View1Explanation / View3Transition,
         EXCEPT no `appear` here: the first render is gated by JS
         (entryCaptionVisible flips from false → true after the
         appear-delay setTimeout in onMounted). See top-of-file
         comment block for why VIEW_2 needs this workaround. The
         enter-* classes still handle the actual fade timing via
         `--rotate-empty-beat` + `--rotate-fade-ms`. -->
    <Transition name="entry" mode="out-in">
      <p
        v-if="entryCaptionVisible"
        :key="entryIndex"
        class="entry-caption"
      >
        <span class="caption-text" v-html="entryHtml"></span>
      </p>
    </Transition>

    <!-- "Move your mouse…" — a centred ROTATE caption shown first (once hover is
         armed), inviting exploration before the selection prompt appears. -->
    <Transition name="entry" mode="out-in">
      <p
        v-if="hoverCaptionVisible"
        key="hover-action"
        class="entry-caption"
      >
        <span class="caption-text">{{ HOVER_ACTION }}</span>
      </p>
    </Transition>

    <!-- "Select an image…" — now a centred ROTATE caption (same `.entry-caption`
         style + shared `--rotate-*` timing as the intro narration), drifting in
         after the project narration once the interface has brightened. -->
    <Transition name="entry" mode="out-in">
      <p
        v-if="clickCaptionVisible"
        key="click-action"
        class="entry-caption"
      >
        <span class="caption-text" v-html="clickHtml"></span>
      </p>
    </Transition>

    <!-- Skip-to-pick button: jumps past the narrations straight to the
         pickable state (clickEnabled), leaving the "Select an image…" prompt
         showing. Hidden once selection is unlocked (whether via this button or
         the natural phase progression) and during the exit. -->
    <SkipButton v-if="(!clickEnabled || skipFading) && !entryExiting" @click="skipToPick" />
    <!-- Spawn-and-fade hover previews. Each preview is anchored to the
         viewport position where the cursor first entered its sprite and
         runs its own fade-in → hold → fade-out lifecycle. Multiple can
         overlap at different stages. The rAF tick in <script> updates
         `opacity` per frame; v-for/key by uid means evicted previews
         drop out of the DOM cleanly. -->
    <div
      v-for="p in previews"
      :key="p.uid"
      class="preview"
      :style="{
        left: `${p.left}px`,
        top: `${p.top}px`,
        width: `${p.widthVmin}vmin`,
        height: `${p.heightVmin}vmin`,
        opacity: p.opacity,
      }"
    >
      <AtlasThumb :id="p.id" :alt="p.id" fit="contain" source="original" />
    </div>
  </section>
</template>

<style scoped>
.view-0 {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  /* The cursor stays visible the whole time in VIEW_2 (it used to be hidden
     until the "Explore…" prompt; the iframe also no longer hides its own —
     see project main.js embed). */
  /* Background paints via the global .bg-gradient class (app.vue) — the
     same day-gradient as VIEW-1, so the cross-fade no longer reveals a
     dark backdrop while project's iframe is still loading. Setting
     `background` here would win against the global class via scoped
     specificity. */
}

/* Grid cross is NOT drawn here in VIEW_2. The interface can only paint over
   the opaque project iframe, which would put the cross on top of the spawning
   sprites. Instead the cross is drawn INSIDE the project's disperse view,
   behind the transparent sprite canvas (see `body[data-state="disperse"]
   #container-1::before` in project/src/style.css), so it reads behind the
   images. VIEW-1 / VIEW-3 / VIEW-4 still draw their own cross. */
.project-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  /* On image click, the disperse field fades out smoothly (.is-exiting)
     before the view advances to VIEW_3, so the swap reads as a calm
     gradient → VIEW_3 fade rather than a harsh overlap of moving sprites
     and the new layout. Duration matches ENTRY_EXIT_MS in <script>. */
  transition: opacity 500ms ease;
}
.view-0.is-exiting .project-frame {
  opacity: 0;
  pointer-events: none;
}
.preview {
  position: absolute;
  /* left / top / width / height / opacity all set inline per-preview.
     Width and height come from the same natural-vmin sizing used by
     CentralImage (hash-derived variation × aspect-balance penalty), so
     VIEW_2 previews match the VIEW_3 / VIEW_4 deck footprint. The
     inline coords are pre-clamped so the box never overflows. */
  pointer-events: none;
  z-index: 10;
  /* No CSS transition on opacity — the rAF loop drives the curve
     directly; a CSS easing on top would fight it. */
}

/* Entry intro caption — same upper-centre placement and typography as
   View1's `.caption` and View3's `.intro-caption`, but with `max-width`
   + wrapping (instead of `white-space: nowrap`) because the corpus
   description is too long to fit on one line. z-index sits above the
   iframe and the hover previews. */
.entry-caption {
  position: absolute;
  /* Centred in the viewport (was top: 4vh), over the disperse canvas. */
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0;
  /* Wide enough that the long corpus sentence wraps to ~2 lines (not 3-4).
     `em` ties the wrap to the font-size; the vw cap keeps it inside narrow
     viewports. */
  max-width: min(46em, 88vw);
  font-size: var(--rotate-size);
  line-height: var(--rotate-line-height);
  text-align: center;
  /* Honour the explicit \n break points in ENTRY_PANELS (still wraps if a
     segment is too wide for a narrow viewport). */
  white-space: pre-line;
  color: #595b54;
  z-index: 12;
  pointer-events: none;
}

/* Organic backing that traces the text glyphs (not a box) — layered
   text-shadow in the blue-grey panel colour hugs the letterforms across the
   wrapped lines, reading as a soft text-shaped stroke rather than a 60vw
   rectangle. Matches VIEW_1 `.caption-text` / VIEW_3 `.intro-caption
   .caption-text`. */
.entry-caption .caption-text {
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

/* Vue <Transition name="entry"> CSS hooks — opacity-only fades using
   the shared --rotate-* custom properties so this caption animates
   identically to View1's `.caption` and View3's `.intro-caption`.
   Change a value once in app.vue's :root and all three views update.
   No `appear-*` rules here: VIEW_2 gates its first render via JS
   (setTimeout in onMounted) instead of Vue's `appear` attribute —
   see the comment block at the top of <script setup>. */
.entry-enter-active {
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing) var(--rotate-empty-beat);
}
.entry-enter-from {
  opacity: 0;
}
.entry-leave-active {
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing);
}
.entry-leave-to {
  opacity: 0;
}
</style>
