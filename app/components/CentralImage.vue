<script setup lang="ts">
import type { ImageId } from '~/types/interaction'
import AtlasThumb from '~/components/AtlasThumb.vue'

const props = withDefaults(defineProps<{
  ids: ImageId[]
  activeIndex?: number
  expanded?: boolean
  source?: 'atlas' | 'original'
  // When false, per-image hover is inert: no `hover` emit and no
  // `is-highlighted` emphasis. Used by the VIEW_4 corner circles, where the
  // whole circle is a single click target, not a set of hoverable images.
  interactive?: boolean
  // Clockwise reveal: when true (and expanded) the images appear one-by-one
  // in clockwise order (index 0 at 12 o'clock first) with a fade + scale-up,
  // instead of all at once. `revealStagger` = per-image delay (ms). Changing
  // `revealKey` replays the cascade (e.g. each time a new circle is centred).
  reveal?: boolean
  revealStagger?: number
  revealDelay?: number
  revealKey?: string | number
  // Drift variant of the reveal: instead of fading/scaling in place, each
  // image starts stacked at the centre and eases OUT to its oval position
  // when its (clockwise) turn comes — same staggered order, no fade. Used
  // by the centred overview circle.
  revealDrift?: boolean
  // Multiplies the ellipse radius (NOT the per-image size) so a circle can
  // spread wider across the screen without enlarging the images. Default 1;
  // the centred overview circle passes a larger value, the corner replay
  // circles keep 1.
  radiusScale?: number
  // Extra multiplier on the RY (vertical) axis only, on top of radiusScale —
  // lets a circle be flattened (shorter than wide) without touching RX.
  radiusScaleY?: number
}>(), {
  activeIndex: -1,
  expanded: false,
  source: 'atlas',
  interactive: true,
  reveal: false,
  revealStagger: 180,
  revealDelay: 0,
  revealKey: 0,
  revealDrift: false,
  radiusScale: 1,
  radiusScaleY: 1,
})

const emit = defineEmits<{
  'update:hovered': [boolean]
  // Emitted in expanded (circle) mode on per-image hover: the hovered
  // image id, or null on leave. The parent forwards it to the project
  // canvases via store.setHighlight(id) — pure perception, no path/focus
  // mutation.
  hover: [ImageId | null]
}>()

const { naturalDimsVmin } = useCentralImageDims()

// Ellipse semi-axes for the expanded ring — wider than tall, so the deck
// reads as an oval rather than a perfect circle. RADIUS_X > RADIUS_Y.
const RADIUS_X_VMIN = 27
const RADIUS_Y_VMIN = 20
// Per-image size on the ring (multiplies each image's natural vmin dims).
// Set to 1.0 so a ring image renders at the SAME size as the collapsed
// central-image deck (which draws at natural dims, scale 1) — the circle is
// the same images as the centre, just in the ring configuration. Overlap on
// the ring is accepted (the images are full-size). SCALE_HOVER lifts the
// hovered one slightly for feedback.
const SCALE_OTHER = 0.85
const SCALE_ACTIVE = 0.85
const SCALE_HOVER = 0.95

// Which layer the cursor is over, in expanded (circle) mode. Drives the
// `is-highlighted` emphasis and the `hover` emit. Stays null in collapsed
// mode (per-image hover is only meaningful once the deck is a circle).
const hoveredIdx = ref<number | null>(null)

function onLayerEnter(i: number) {
  if (!props.expanded || !props.interactive) return
  hoveredIdx.value = i
  emit('hover', props.ids[i] ?? null)
}
function onLayerLeave(i: number) {
  if (!props.expanded || !props.interactive) return
  if (hoveredIdx.value !== i) return
  hoveredIdx.value = null
  emit('hover', null)
}

// ── Clockwise reveal ──
// Each layer's entrance (fade + scale-up) is gated by `isRevealed(i)`.
// Visibility is derived SYNCHRONOUSLY from `revealActive` (a computed of
// the props) plus the `shown` set — so the instant the circle becomes
// active the layers read hidden, with no one-frame "whole circle flashes"
// gap before the scheduler runs. When the reveal (re)plays, `shown` is
// cleared and each index is added back on a per-index timer (index order =
// clockwise from 12 o'clock), after an optional `revealDelay` beat.
// `revealing` suppresses the layout morph during the cascade so images
// appear in place. When reveal is off, every layer is simply visible.
const REVEAL_DURATION_MS = 600
const shown = ref<Set<number>>(new Set())
const revealing = ref(false)
let revealTimers: ReturnType<typeof setTimeout>[] = []

const revealActive = computed(
  () => props.reveal && props.expanded && props.ids.length > 0,
)
function isRevealed(i: number) {
  return !revealActive.value || shown.value.has(i)
}

function clearRevealTimers() {
  revealTimers.forEach(clearTimeout)
  revealTimers = []
}

function playReveal() {
  clearRevealTimers()
  shown.value = new Set()
  if (!revealActive.value) {
    revealing.value = false
    return
  }
  revealing.value = true
  const n = props.ids.length
  const { revealStagger: stagger, revealDelay: delay } = props
  for (let i = 0; i < n; i++) {
    revealTimers.push(setTimeout(() => {
      const next = new Set(shown.value)
      next.add(i)
      shown.value = next
    }, delay + i * stagger))
  }
  revealTimers.push(setTimeout(() => {
    revealing.value = false
  }, delay + (n - 1) * stagger + REVEAL_DURATION_MS))
}

onMounted(() => {
  if (revealActive.value) playReveal()
})
watch(() => props.expanded, () => playReveal())
watch(() => props.revealKey, () => playReveal())
watch(() => props.ids, () => playReveal())
onBeforeUnmount(clearRevealTimers)

// Index of the topmost layer — parents target it via the `is-active`
// class (e.g. VIEW_4's center-anchor hover glow applies to only the top
// silhouette, not the union of all stacked layer alphas).
const activeIdx = computed(() => {
  const n = props.ids.length
  return props.activeIndex < 0 ? n - 1 : props.activeIndex
})

function layerStyle(i: number) {
  const n = props.ids.length
  const activeI = props.activeIndex < 0 ? n - 1 : props.activeIndex
  const isActive = i === activeI
  const center = 'translate(-50%, -50%)'
  // Central-image family is scaled down a touch relative to the quadrant/ribbon
  // surfaces (CENTER_IMAGE_SCALE); the circle's per-image SCALE_* multiplies on
  // top of this for the ring.
  const raw = naturalDimsVmin(props.ids[i]!)
  const dims = { width: raw.width * CENTER_IMAGE_SCALE, height: raw.height * CENTER_IMAGE_SCALE }

  if (!props.expanded || n === 0) {
    // Collapsed stack: every layer piles at the exact geometric center,
    // each at its own natural size derived from the atlas pixel dims.
    // A new active that's larger than the previous will cover them; a
    // smaller active will let the older edges show. That asymmetry is
    // intended — it IS the natural variation.
    const z = isActive ? n + 1 : i + 1
    return {
      zIndex: z,
      width: `${dims.width}vmin`,
      height: `${dims.height}vmin`,
      transform: `${center} scale(1)`,
    }
  }
  // Circle mode. The hovered layer is lifted to the very top and scaled up
  // so it reads as the highlighted selection; the active (last) keeps its
  // existing larger scale; the rest sit at the base scale.
  const isHovered = i === hoveredIdx.value
  const angle = -Math.PI / 2 + (i / n) * Math.PI * 2
  const x = Math.cos(angle) * RADIUS_X_VMIN * props.radiusScale
  const y = Math.sin(angle) * RADIUS_Y_VMIN * props.radiusScale * props.radiusScaleY
  const scale = isHovered ? SCALE_HOVER : isActive ? SCALE_ACTIVE : SCALE_OTHER
  // Overlap order on the ring: FIRST image on top, LAST below (z = n - i, so
  // i=0 → highest). No active-on-top lift here (that would put the last
  // selected on top, breaking the order); only the hovered layer lifts above
  // all for feedback. (The collapsed deck above keeps its own active-on-top.)
  const z = isHovered ? n + 1 : n - i
  // Drift reveal: a layer that hasn't had its turn yet sits stacked at the
  // centre (0,0); when `shown` flips it, layerStyle returns the oval offset
  // and the `.layer` transform transition eases it out. Clockwise order via
  // the staggered `shown` timing.
  const atCenter = props.revealDrift && revealActive.value && !shown.value.has(i)
  const tx = atCenter ? 0 : x
  const ty = atCenter ? 0 : y
  // At the stacked centre keep the collapsed size (scale 1) so the hand-off
  // from the central image deck is seamless — no shrink/jump. The shrink to
  // the oval scale happens smoothly DURING the drift (eased by `.layer`).
  const drawScale = atCenter ? 1 : scale
  return {
    zIndex: z,
    width: `${dims.width}vmin`,
    height: `${dims.height}vmin`,
    transform: `${center} translate(${tx}vmin, ${ty}vmin) scale(${drawScale})`,
  }
}
</script>

<template>
  <TransitionGroup
    name="layer-fade"
    tag="div"
    class="central-image"
    aria-hidden="true"
    @mouseenter="emit('update:hovered', true)"
    @mouseleave="emit('update:hovered', false)"
  >
    <div
      v-for="(id, i) in ids"
      :key="`${i}:${id}`"
      class="layer"
      :class="{ 'is-active': i === activeIdx, 'is-highlighted': i === hoveredIdx, 'no-morph': revealing && !revealDrift }"
      :style="layerStyle(i)"
      @mouseenter="onLayerEnter(i)"
      @mouseleave="onLayerLeave(i)"
    >
      <div
        class="layer-reveal"
        :style="{ opacity: (revealDrift || isRevealed(i)) ? 1 : 0, transform: `scale(${(revealDrift || isRevealed(i)) ? 1 : 0.6})` }"
      >
        <AtlasThumb :id="id" :alt="id" fit="contain" :source="source" />
      </div>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.central-image {
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: auto;
}
.layer {
  position: absolute;
  top: 50%;
  left: 50%;
  /* width/height set per-layer inline from the atlas pixel dimensions
     (see layerStyle). Each image renders at its own natural footprint. */
  transform-origin: center center;
  /* Drift / reshuffle motion — ease-in-out for a smooth glide out from the
     centre (hover amplification overrides this with its own snappier curve
     via `.is-highlighted`). */
  transition:
    transform 900ms cubic-bezier(0.45, 0, 0.55, 1),
    width 900ms cubic-bezier(0.45, 0, 0.55, 1),
    height 900ms cubic-bezier(0.45, 0, 0.55, 1);
}
/* Reveal wrapper — owns the per-image fade + scale-up entrance (clockwise
   cascade), composing on top of `.layer`'s position/scale. opacity + scale
   are bound inline from `revealed[i]`; this transition animates them in. */
.layer-reveal {
  width: 100%;
  height: 100%;
  transform-origin: center center;
  transition:
    opacity 600ms ease-out,
    transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
/* While the clockwise reveal is playing, suppress the layout morph so the
   images appear in place at their circle spots instead of sliding out from
   the stacked centre. Transition restored once the cascade completes. */
.layer.no-morph {
  transition: none;
}
.layer :deep(.atlas-thumb) {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
}
/* Hovered image in the circle — warm beige glow matching the system
   palette (history-strip .current, contribute bloom, center-anchor hover).
   The glow snaps in/out (filter isn't in .layer's transition list); the
   scale-up rides .layer's 700ms transform transition, but a shorter
   transform transition here makes the lift feel responsive on hover. */
.layer.is-highlighted {
  transition:
    transform 250ms cubic-bezier(0.22, 0.61, 0.36, 1),
    width 700ms cubic-bezier(0.22, 0.61, 0.36, 1),
    height 700ms cubic-bezier(0.22, 0.61, 0.36, 1);
  filter:
    drop-shadow(0 0 8px rgba(249, 236, 208, 0.75))
    drop-shadow(0 0 18px rgba(249, 236, 208, 0.45))
    drop-shadow(0 0 32px rgba(249, 236, 208, 0.22));
}
/* TransitionGroup hooks. New layers appear instantly (no fade-in — the
   caller may pin them, and a fade-in would feel laggy on hover). Layers
   leaving the v-for fade out instead of cutting. The existing transition
   on transform/width/height keeps stagger reshuffles smooth — opacity is
   an additive concern on top.

   Fade-out duration tuned to feel like "the image disappears and
   reappears" on every new central activation: snappy enough to read as a
   replacement, slow enough to be perceived rather than cut. */
.layer-fade-leave-active {
  transition: opacity 220ms ease-out;
}
.layer-fade-leave-to {
  opacity: 0;
}
/* Leaving layers retain the .layer class (position: absolute) so they
   fade in place rather than reflowing. */
</style>
