<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import AtlasThumb from '~/components/AtlasThumb.vue'
import type { ImageId } from '~/types/interaction'
import { ROTATE_PANEL_MS, ROTATE_FADE_OUT_MS } from '~/utils/rotateText'

// Rotating intro caption — same Vue <Transition> + shared --rotate-*
// timing as View1Explanation `.caption` and View3Transition
// `.intro-caption`. Two sentences cycle every ROTATE_PANEL_MS; on the
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
const ENTRY_PANELS = [
  "Here's a corpus from scientific and encyclopedic publications (15th–20th century), structured to classify and organize knowledge within Western systems.",
  'Engage with this corpus through alternative readings and contribute to Proxima.',
]
const entryIndex = ref(0)
const entryCaptionVisible = ref(false) // gated by setTimeout below — see comment block
let entryTimer: ReturnType<typeof setInterval> | null = null
let entryFirstShowTimer: ReturnType<typeof setTimeout> | null = null

function clearEntryTimer() {
  if (entryTimer) {
    clearInterval(entryTimer)
    entryTimer = null
  }
  if (entryFirstShowTimer) {
    clearTimeout(entryFirstShowTimer)
    entryFirstShowTimer = null
  }
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

// Pinned-then-demoted preview lifecycle. The currently-hovered sprite
// gets a "pinned" preview that fades in then HOLDS INDEFINITELY (no
// fade-out while pinned). Moving to a new sprite, or leaving the canvas,
// demotes the current pin: at that moment its current opacity is
// captured and it fades out over FADE_OUT_MS from there, then evicts.
// Multiple expiring previews can overlap with the pinned one at
// different stages of their own fade-out.
const FADE_IN_MS = 150
const FADE_OUT_MS = 900

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

let rafHandle: number | null = null
function tickLifecycle() {
  rafHandle = null
  const now = performance.now()
  let anyAnimating = false
  const list = previews.value
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]!
    if (p.pinned) {
      // Fade-in then hold at 1 indefinitely. No eviction while pinned.
      const age = now - p.startTime
      if (age < FADE_IN_MS) {
        p.opacity = age / FADE_IN_MS
        anyAnimating = true
      } else {
        p.opacity = 1
        // No need to keep ticking just to hold at 1; the loop will be
        // re-kicked on demotion or new spawn.
      }
    } else {
      // Expiring — linear fade from the captured demotion opacity to 0.
      const elapsed = now - p.expireStartTime
      if (elapsed >= FADE_OUT_MS) {
        list.splice(i, 1)
        continue
      }
      p.opacity = p.expireStartOpacity * (1 - elapsed / FADE_OUT_MS)
      anyAnimating = true
    }
  }
  if (anyAnimating) rafHandle = requestAnimationFrame(tickLifecycle)
}

function kickLoop() {
  if (rafHandle == null) rafHandle = requestAnimationFrame(tickLifecycle)
}

function demoteAllPinned() {
  const now = performance.now()
  let changed = false
  for (const p of previews.value) {
    if (p.pinned) {
      p.pinned = false
      p.expireStartTime = now
      p.expireStartOpacity = p.opacity
      changed = true
    }
  }
  if (changed) kickLoop()
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
    opacity: 0,
  })
  kickLoop()
}

function onMessage(event: MessageEvent) {
  if (event.origin !== expectedOrigin.value) {
    console.warn('[view0] dropped message from unexpected origin', event.origin)
    return
  }
  const data = event.data as { type?: string; imageId?: unknown; x?: unknown; y?: unknown } | null
  if (!data) return
  if (data.type === 'view0:image-hover') {
    const next = typeof data.imageId === 'string' ? data.imageId : null
    store.setHighlight(next)
    if (next != null && next !== lastHoverId) {
      // Fresh sprite entered — spawn a preview at the spot the cursor hit it.
      const x = typeof data.x === 'number' ? data.x : window.innerWidth / 2
      const y = typeof data.y === 'number' ? data.y : window.innerHeight / 2
      spawnPreview(next, x, y)
    } else if (next == null && lastHoverId != null) {
      // Cursor left all sprites (off canvas or onto empty area) — demote
      // the current pin so it fades out gracefully. Re-entering will
      // spawn fresh.
      demoteAllPinned()
    }
    lastHoverId = next
    return
  }
  if (data.type === 'view0:image-click') {
    if (typeof data.imageId !== 'string') return
    const id = data.imageId
    // Stop any running rotation timer regardless of caption state.
    clearEntryTimer()
    if (entryCaptionVisible.value) {
      // Caption still visible — fade it out first, then advance.
      // Mirrors VIEW_1's advance() fade-then-advance pattern.
      entryCaptionVisible.value = false
      setTimeout(() => store.selectImage(id), ROTATE_FADE_OUT_MS)
    } else {
      // Caption already faded (timer-driven fade-out completed
      // before user clicked). Advance immediately.
      store.selectImage(id)
    }
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
  // its full ROTATE_PANEL_MS display time) fires its fade-out by
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
      return
    }
    entryIndex.value += 1
  }, ROTATE_PANEL_MS)
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  clearEntryTimer()
  if (rafHandle != null) {
    cancelAnimationFrame(rafHandle)
    rafHandle = null
  }
})
</script>

<template>
  <section class="view view-0 bg-gradient">
    <iframe
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
        {{ ENTRY_PANELS[entryIndex] }}
      </p>
    </Transition>
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
  top: 4vh;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0 1.5rem;
  max-width: 60vw;
  font-size: var(--label-size);
  line-height: 1.3;
  text-align: center;
  color: #595b54;
  z-index: 12;
  pointer-events: none;
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
