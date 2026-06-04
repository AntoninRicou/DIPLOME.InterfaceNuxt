<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import AtlasThumb from '~/components/AtlasThumb.vue'
import ActionPrompt from '~/components/ActionPrompt.vue'
import type { ImageId } from '~/types/interaction'
import { VIEW2_PANEL_MS, ROTATE_FADE_OUT_MS } from '~/utils/rotateText'

// Rotating intro caption — same Vue <Transition> + shared --rotate-*
// timing as View1Explanation `.caption` and View3Transition
// `.intro-caption`. Two sentences cycle every ENTRY_PANEL_MS (6000ms); on the
// last sentence the timer stops and the caption sits visible until
// the user clicks a sprite in the iframe. The click triggers a
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
const ENTRY_PANELS = [
  'This corpus comes from scientific and encyclopedic books published between the 15th and 20th centuries.',
  'It was structured within a single dominant Western system of vision to produce and classify knowledge.',
]
// Project-ONLY centred narration, played (2s after the user's first hover) via
// set-center-caption with the same rotate params. Each sentence fades in,
// holds ENTRY_PANEL_MS, fades out — sequenced by playProjectNarration().
const PROJECT_PANELS = [
  'This same corpus is organized here in four distinct configurations.',
  'Each one determines how proximity and relations are established between images .',
]
// Two bottom prompts (interface-only). HOVER_ACTION appears once the interface
// narration clears and hover unlocks (but NOT click); after the project
// narration finishes it swaps to CLICK_ACTION and click unlocks.
const HOVER_ACTION = 'Explore images of the corpus and look up'
const CLICK_ACTION = 'Select an image to initiate exploration.'
const showHoverAction = ref(false)
const showClickAction = ref(false)
const entryIndex = ref(0)
const entryCaptionVisible = ref(false) // gated by setTimeout below — see comment block
// Iframe handle — used to post `view0:enable-hover` when phase 2 begins so the
// embedded canvas un-hides its cursor and enables picking.
const frameEl = ref<HTMLIFrameElement | null>(null)
// Per-sentence hold for both the interface and the project narration.
const ENTRY_PANEL_MS = VIEW2_PANEL_MS
// Delay between the user's first hover and the project narration starting.
const HOVER_TO_PROJECT_DELAY_MS = 4000
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
// First hover starts a 4s timer → playProjectNarration(). Guarded so only the
// first hover schedules it.
let projectNarrationStarted = false
let entryTimer: ReturnType<typeof setInterval> | null = null
let entryFirstShowTimer: ReturnType<typeof setTimeout> | null = null
let hoverRevealTimer: ReturnType<typeof setTimeout> | null = null
let firstHoverTimer: ReturnType<typeof setTimeout> | null = null
// Every setTimeout spawned by the project-narration sequencer, so unmount can
// cancel a sequence mid-flight.
let projectNarrationTimers: ReturnType<typeof setTimeout>[] = []

function clearEntryTimer() {
  if (entryTimer) {
    clearInterval(entryTimer)
    entryTimer = null
  }
  if (entryFirstShowTimer) {
    clearTimeout(entryFirstShowTimer)
    entryFirstShowTimer = null
  }
  if (hoverRevealTimer) {
    clearTimeout(hoverRevealTimer)
    hoverRevealTimer = null
  }
  if (firstHoverTimer) {
    clearTimeout(firstHoverTimer)
    firstHoverTimer = null
  }
  for (const t of projectNarrationTimers) clearTimeout(t)
  projectNarrationTimers = []
}

// Sequences the project-only centred narration: each PROJECT_PANELS sentence
// fades in (set-center-caption rotate), holds ENTRY_PANEL_MS, fades out — then
// after the last one, swaps the bottom prompt (HOVER→CLICK) and unlocks click.
function playProjectNarration() {
  let i = 0
  const showSentence = () => {
    store.setCenterCaption(PROJECT_PANELS[i] ?? '', 'rotate')
    projectNarrationTimers.push(setTimeout(() => {
      store.setCenterCaption('') // fade current sentence out
      i++
      if (i < PROJECT_PANELS.length) {
        projectNarrationTimers.push(setTimeout(showSentence, ROTATE_FADE_OUT_MS))
      } else {
        // Narration done: fade the hover prompt out, then fade the click
        // prompt in (sequenced so the two never overlap at the bottom) and
        // unlock selection.
        showHoverAction.value = false
        projectNarrationTimers.push(setTimeout(() => {
          showClickAction.value = true
          clickEnabled.value = true
        }, ROTATE_FADE_OUT_MS))
      }
    }, ENTRY_PANEL_MS))
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
  if (data.type === 'view0:dispersed') {
    // The iframe's disperse burst has begun — release the standalone
    // project's overview reveal so it lights up in sync with the spawning
    // sprites here.
    store.notifyDisperseSpawned()
    return
  }
  if (data.type === 'view0:image-hover') {
    // Phase 1 (narration): no hover at all — the iframe's picking isn't even
    // armed yet, so this won't fire; the guard is belt-and-braces.
    if (!hoverEnabled.value) return
    const next = typeof data.imageId === 'string' ? data.imageId : null
    // Phase 2+ ("Explore…"): hover lights the CORRESPONDING IMAGE on the
    // standalone project (the iframe lights its own sprite locally).
    store.setHighlight(next)
    // First hover → after a 4s beat, play the project-only centred narration.
    // Guarded so only the first hover schedules it.
    if (next != null && !projectNarrationStarted) {
      projectNarrationStarted = true
      firstHoverTimer = setTimeout(() => {
        firstHoverTimer = null
        playProjectNarration()
      }, HOVER_TO_PROJECT_DELAY_MS)
    }
    // The big preview at the cursor (the "image view") is PHASE 3 only — it
    // appears once "Select an image…" shows (clickEnabled), alongside the
    // ability to select. In phase 2 hover only lights the image, no preview.
    if (clickEnabled.value) {
      if (next != null && next !== lastHoverId) {
        // Fresh sprite entered — spawn a preview at the spot the cursor hit it.
        const x = typeof data.x === 'number' ? data.x : window.innerWidth / 2
        const y = typeof data.y === 'number' ? data.y : window.innerHeight / 2
        spawnPreview(next, x, y)
      } else if (next == null && lastHoverId != null) {
        // Cursor left all sprites — demote the current pin so it fades out.
        demoteAllPinned()
      }
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
    // Fade the caption (if still up), the bottom prompts, and the disperse
    // field out together, then advance once the field has calmed. The clicked
    // image's pinned preview stays visible as an anchor through the swap.
    entryCaptionVisible.value = false
    showHoverAction.value = false
    showClickAction.value = false
    // Clear any project caption still mirrored on the feedback screen.
    store.setCenterCaption('')
    entryExiting.value = true
    setTimeout(() => store.selectImage(id), ENTRY_EXIT_MS)
  }
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
  // Rotation timer — same tick rhythm as VIEW_1's panel timer.
  // Advances entryIndex through ENTRY_PANELS, and on the tick AFTER
  // the last sentence arrives (i.e. once the last sentence has had
  // its full 5000ms display time) fires its fade-out by
  // flipping entryCaptionVisible to false. The view itself doesn't
  // auto-advance — the user still needs to click a sprite — but the
  // caption clears the way so the canvas reads cleanly.
  entryTimer = setInterval(() => {
    if (entryIndex.value >= ENTRY_PANELS.length - 1) {
      if (entryTimer) {
        clearInterval(entryTimer)
        entryTimer = null
      }
      entryCaptionVisible.value = false
      // Once the last narration sentence has fully faded out
      // (ROTATE_FADE_OUT_MS = the leave-fade duration): reveal the bottom
      // HOVER_ACTION prompt AND unlock HOVER (not click) at the same moment.
      // Click stays gated until the project narration finishes.
      hoverRevealTimer = setTimeout(() => {
        hoverEnabled.value = true
        showHoverAction.value = true
        // Arm the embedded canvas: un-hide its cursor + enable picking so hover
        // lights the corresponding image (no big preview yet — that's phase 3).
        frameEl.value?.contentWindow?.postMessage(
          { type: 'view0:enable-hover' },
          expectedOrigin.value || '*',
        )
        hoverRevealTimer = null
      }, ROTATE_FADE_OUT_MS)
      return
    }
    entryIndex.value += 1
  }, ENTRY_PANEL_MS) /* VIEW_2 hold per sentence; fade stays shared --rotate-fade-ms */
})
// NOTE: the interface narration is no longer mirrored to project. The project
// shows its OWN centred narration (PROJECT_PANELS), played by
// playProjectNarration() 2s after the first hover — see above.

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  clearEntryTimer()
  // Clear the mirrored caption so it doesn't linger on project into VIEW_3.
  store.setCenterCaption('')
})
</script>

<template>
  <section class="view view-0 bg-gradient" :class="{ 'is-exiting': entryExiting, 'hover-armed': hoverEnabled }">
    <iframe
      ref="frameEl"
      class="project-frame"
      :src="projectUrl"
      title="project disperse canvas"
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
        <span class="caption-text">{{ ENTRY_PANELS[entryIndex] }}</span>
      </p>
    </Transition>

    <!-- Bottom prompts (interface-only). HOVER_ACTION appears once the
         narration clears (hover unlocks here, click does NOT); after the
         project narration finishes it swaps to CLICK_ACTION and click unlocks.
         Only one is ever visible at a time. -->
    <ActionPrompt :visible="showHoverAction" :text="HOVER_ACTION" />
    <ActionPrompt :visible="showClickAction" :text="CLICK_ACTION" />
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
  /* Phase 1 (before the "Explore…" prompt): no cursor at all. The iframe hides
     its own cursor too (see project main.js embed) since it covers the
     viewport; this covers the brief pre-load moment + any parent-level area.
     `.hover-armed` (set when hoverEnabled flips at phase 2) restores it. */
  cursor: none;
  /* Background paints via the global .bg-gradient class (app.vue) — the
     same day-gradient as VIEW-1, so the cross-fade no longer reveals a
     dark backdrop while project's iframe is still loading. Setting
     `background` here would win against the global class via scoped
     specificity. */
}

/* Grid cross — mirrors the cross in VIEW-1 / VIEW-3 / VIEW-4 so the
   structural seam reads as continuous across the whole view chain. Split
   into two pseudo-elements (horizontal in ::before, vertical in ::after)
   to stay animation-ready (matches View1Explanation's pattern). No draw
   animation here — static, fully visible from mount. Sits at z-index 5,
   above the iframe; the .central-slot hover preview at z-index 10 stays
   on top. */
.view-0::before,
.view-0::after {
  content: "";
  position: absolute;
  background: rgba(166, 154, 128, 0.85);
  pointer-events: none;
  z-index: 5;
}
.view-0::before {
  left: 5%;
  right: 5%;
  top: 50%;
  height: 1px;
  margin-top: -0.5px;
}
.view-0::after {
  top: 5%;
  bottom: 5%;
  left: 50%;
  width: 1px;
  margin-left: -0.5px;
}
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
/* Phase 2+ — cursor restored once hover is armed. */
.view-0.hover-armed {
  cursor: auto;
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
  line-height: 1.5;
  text-align: center;
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
