<script setup lang="ts">
import type { ImageId } from '~/types/interaction'
import AtlasThumb from '~/components/AtlasThumb.vue'

const props = withDefaults(defineProps<{
  ids: ImageId[]
  activeIndex?: number
  expanded?: boolean
  source?: 'atlas' | 'original'
}>(), { activeIndex: -1, expanded: false, source: 'atlas' })

const { naturalDimsVmin } = useCentralImageDims()

const RADIUS_VMIN = 22
const SCALE_OTHER = 0.35
const SCALE_ACTIVE = 0.5

// Index of the topmost layer — parents target it via the `is-active`
// class (e.g. VIEW_4's center-anchor hover glow applies to only the top
// silhouette, not the union of all stacked layer alphas).
const activeIdx = computed(() => {
  const n = props.ids.length
  return props.activeIndex < 0 ? n - 1 : props.activeIndex
})

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
      :class="{ 'is-active': i === activeIdx }"
      :style="layerStyle(i)"
    >
      <AtlasThumb :id="id" :alt="id" fit="contain" :source="source" />
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
