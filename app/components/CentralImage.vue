<script setup lang="ts">
import type { ImageId } from '~/types/interaction'
import AtlasThumb from '~/components/AtlasThumb.vue'

const props = withDefaults(defineProps<{
  ids: ImageId[]
  activeIndex?: number
  expanded?: boolean
}>(), { activeIndex: -1, expanded: false })

const { getNaturalSize } = useAtlas()

const RADIUS_VMIN = 22
const SCALE_OTHER = 0.35
const SCALE_ACTIVE = 0.5

// vmin per source pixel. Picks the visual range each image renders in —
// small atlas images stay small, large ones grow. Tune by feel.
const VMIN_PER_PIXEL = 0.055
// Fallback dimensions when atlas metadata isn't loaded yet (first frame).
const FALLBACK_VMIN = 26
// Per-image size variation. Source atlas has ~two-thirds of images pinned to
// max-edge = 500px (Flickr normalization), so natural pixel dims collapse to
// the same width or height across many images. A deterministic hash-derived
// scale multiplier per image breaks this collision: identical aspect images
// still render at noticeably different footprints. The same id always maps
// to the same scale, so the variation is stable, not random per render.
const SIZE_VARIATION_MIN = 0.85
const SIZE_VARIATION_MAX = 1.25

// Aspect-balance penalty. Square-ish images render full size; extreme
// aspects render smaller overall so they don't visually dominate. Aspect
// ratio is preserved (no distortion) — only the overall scale is reduced.
// 0 = no penalty (extreme aspects still huge); higher = more aggressive.
const ASPECT_PENALTY_STRENGTH = 0.15
const ASPECT_PENALTY_FLOOR = 0.55

function hashScale(id: string): number {
  // FNV-1a 32-bit hash → uniform in [SIZE_VARIATION_MIN, SIZE_VARIATION_MAX].
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const u = (h >>> 0) / 0xffffffff
  return SIZE_VARIATION_MIN + u * (SIZE_VARIATION_MAX - SIZE_VARIATION_MIN)
}

function aspectBalance(aspectRatio: number): number {
  // Log-distance from a 1:1 square. 0 for square, ~1 for 2:1, ~2 for 4:1, ~3 for 8:1.
  const logDist = Math.abs(Math.log2(aspectRatio))
  return Math.max(ASPECT_PENALTY_FLOOR, 1 - logDist * ASPECT_PENALTY_STRENGTH)
}

function naturalDimsVmin(id: string) {
  const size = getNaturalSize(id)
  const scale = hashScale(id)
  if (!size) return { width: FALLBACK_VMIN * scale, height: FALLBACK_VMIN * scale }
  const balance = aspectBalance(size.width / size.height)
  const k = VMIN_PER_PIXEL * scale * balance
  return {
    width: size.width * k,
    height: size.height * k,
  }
}

function layerStyle(i: number) {
  const n = props.ids.length
  const activeIdx = props.activeIndex < 0 ? n - 1 : props.activeIndex
  const isActive = i === activeIdx
  // Active layer always on top of the z-stack; non-active layers keep their
  // nav-history order beneath it.
  const z = isActive ? n + 1 : i + 1
  const center = 'translate(-50%, -50%)'
  const dims = naturalDimsVmin(props.ids[i]!)

  if (!props.expanded || n === 0) {
    // Collapsed stack: every layer piles at the exact geometric center,
    // each at its own natural size derived from the atlas pixel dims.
    // A new active that's larger than the previous will cover them; a
    // smaller active will let the older edges show. That asymmetry is
    // intended — it IS the natural variation.
    return {
      zIndex: z,
      width: `${dims.width}vmin`,
      height: `${dims.height}vmin`,
      transform: `${center} scale(1)`,
    }
  }
  const angle = -Math.PI / 2 + (i / n) * Math.PI * 2
  const x = Math.cos(angle) * RADIUS_VMIN
  const y = Math.sin(angle) * RADIUS_VMIN
  const scale = isActive ? SCALE_ACTIVE : SCALE_OTHER
  return {
    zIndex: z,
    width: `${dims.width}vmin`,
    height: `${dims.height}vmin`,
    transform: `${center} translate(${x}vmin, ${y}vmin) scale(${scale})`,
  }
}
</script>

<template>
  <TransitionGroup
    name="layer-fade"
    tag="div"
    class="central-image"
    aria-hidden="true"
  >
    <div
      v-for="(id, i) in ids"
      :key="`${i}:${id}`"
      class="layer"
      :style="layerStyle(i)"
    >
      <AtlasThumb :id="id" :alt="id" fit="contain" />
    </div>
  </TransitionGroup>
</template>

<style scoped>
.central-image {
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.layer {
  position: absolute;
  top: 50%;
  left: 50%;
  /* width/height set per-layer inline from the atlas pixel dimensions
     (see layerStyle). Each image renders at its own natural footprint. */
  transform-origin: center center;
  transition:
    transform 700ms cubic-bezier(0.22, 0.61, 0.36, 1),
    width 700ms cubic-bezier(0.22, 0.61, 0.36, 1),
    height 700ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.layer :deep(.atlas-thumb) {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
}
/* TransitionGroup hooks. New layers appear instantly (no fade-in — the
   caller may pin them, and a fade-in would feel laggy on hover). Layers
   leaving the v-for fade out instead of cutting. The existing transition
   on transform/width/height keeps stagger reshuffles smooth — opacity is
   an additive concern on top. */
.layer-fade-leave-active {
  transition: opacity 1400ms ease-out;
}
.layer-fade-leave-to {
  opacity: 0;
}
/* Leaving layers retain the .layer class (position: absolute) so they
   fade in place rather than reflowing. */
</style>
