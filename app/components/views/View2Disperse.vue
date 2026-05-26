<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import CentralImage from '~/components/CentralImage.vue'
import type { ImageId } from '~/types/interaction'

const store = useInteractionStore()
const config = useRuntimeConfig()
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

// Hover stack with a single "pinned" entry (the sprite currently under the
// cursor). The pin never expires — it stays visible as long as the cursor
// is on it. When the cursor moves to a new sprite or off canvas, the
// previous pin becomes "expiring" and lives for STICKY_HOLD_MS before
// fading out. The project-side highlight is NOT delayed — it tracks the
// live cursor state via store.setHighlight.
const STICKY_HOLD_MS = 1000
type HoverEntry = { id: ImageId; pinned: boolean; expiresAt: number }
const hoverStack = ref<HoverEntry[]>([])
const hoverIds = computed<ImageId[]>(() => hoverStack.value.map((e) => e.id))
const hoverActiveIndex = computed<number>(() =>
  Math.max(0, hoverStack.value.length - 1),
)

let cleanupRaf: number | null = null
function scheduleCleanup() {
  if (cleanupRaf != null) return
  const tick = () => {
    cleanupRaf = null
    const now = performance.now()
    const kept = hoverStack.value.filter((e) => e.pinned || e.expiresAt > now)
    if (kept.length !== hoverStack.value.length) hoverStack.value = kept
    // Keep ticking as long as there's anything that can still expire.
    if (hoverStack.value.some((e) => !e.pinned)) {
      cleanupRaf = requestAnimationFrame(tick)
    }
  }
  cleanupRaf = requestAnimationFrame(tick)
}

function pushHover(id: ImageId) {
  const now = performance.now()
  const next: HoverEntry[] = []
  for (const e of hoverStack.value) {
    if (e.id === id) continue // we'll re-add this id as the new pin
    if (e.pinned) {
      // Demote the previous pin to expiring.
      next.push({ id: e.id, pinned: false, expiresAt: now + STICKY_HOLD_MS })
    } else {
      next.push(e)
    }
  }
  next.push({ id, pinned: true, expiresAt: Number.POSITIVE_INFINITY })
  hoverStack.value = next
  scheduleCleanup()
}

function clearPin() {
  const now = performance.now()
  let changed = false
  const next = hoverStack.value.map((e) => {
    if (!e.pinned) return e
    changed = true
    return { id: e.id, pinned: false, expiresAt: now + STICKY_HOLD_MS }
  })
  if (!changed) return
  hoverStack.value = next
  scheduleCleanup()
}

function onMessage(event: MessageEvent) {
  if (event.origin !== expectedOrigin.value) {
    console.warn('[view0] dropped message from unexpected origin', event.origin)
    return
  }
  const data = event.data as { type?: string; imageId?: unknown } | null
  if (!data) return
  if (data.type === 'view0:image-hover') {
    const next = typeof data.imageId === 'string' ? data.imageId : null
    store.setHighlight(next)
    if (next != null) pushHover(next)
    else clearPin()
    return
  }
  if (data.type === 'view0:image-click') {
    if (typeof data.imageId !== 'string') return
    store.selectImage(data.imageId)
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  if (cleanupRaf != null) {
    cancelAnimationFrame(cleanupRaf)
    cleanupRaf = null
  }
})
</script>

<template>
  <section class="view view-0">
    <iframe
      class="project-frame"
      :src="projectUrl"
      title="project disperse canvas"
    />
    <!-- Hover stack: each hovered image stays for STICKY_HOLD_MS; new ones
         pile on top (CentralImage's existing stack layout). Same `.central-slot`
         geometry as View2Transition so the click → VIEW-2 handoff is
         pixel-stable on the topmost (latest) image. -->
    <div v-if="hoverIds.length > 0" class="central-slot">
      <CentralImage :ids="hoverIds" :active-index="hoverActiveIndex" />
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
  background: #000;
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
  left: 1.5%;
  right: 1.5%;
  top: 50%;
  height: 1px;
  margin-top: -0.5px;
}
.view-0::after {
  top: 1.5%;
  bottom: 1.5%;
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
.central-slot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 22vmin;
  height: 22vmin;
  pointer-events: none;
  z-index: 10;
}
</style>
