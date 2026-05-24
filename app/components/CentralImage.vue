<script setup lang="ts">
import type { ImageId } from '~/types/interaction'
import AtlasThumb from '~/components/AtlasThumb.vue'

const props = withDefaults(defineProps<{
  ids: ImageId[]
  activeIndex?: number
  expanded?: boolean
}>(), { activeIndex: -1, expanded: false })

const RADIUS_VMIN = 22
const SCALE_OTHER = 0.35
const SCALE_ACTIVE = 0.5
const STACK_STAGGER_VMIN = 1.0

function layerStyle(i: number) {
  const n = props.ids.length
  const activeIdx = props.activeIndex < 0 ? n - 1 : props.activeIndex
  const isActive = i === activeIdx
  // Active layer always on top of the z-stack; non-active layers keep their
  // nav-history order beneath it.
  const z = isActive ? n + 1 : i + 1
  const center = 'translate(-50%, -50%)'
  if (!props.expanded || n === 0) {
    // Stagger offset by signed distance from active: older entries (below
    // activeIdx) lean one way, newer entries (above) lean the other —
    // so on stepBack the previous "top" image slides out of center while
    // the new active glides in.
    const distance = activeIdx - i
    const offset = distance * STACK_STAGGER_VMIN
    return {
      zIndex: z,
      transform: `${center} translate(${offset}vmin, ${offset}vmin) scale(1)`,
    }
  }
  const angle = -Math.PI / 2 + (i / n) * Math.PI * 2
  const x = Math.cos(angle) * RADIUS_VMIN
  const y = Math.sin(angle) * RADIUS_VMIN
  const scale = isActive ? SCALE_ACTIVE : SCALE_OTHER
  return {
    zIndex: z,
    transform: `${center} translate(${x}vmin, ${y}vmin) scale(${scale})`,
  }
}
</script>

<template>
  <div class="central-image" aria-hidden="true">
    <div
      v-for="(id, i) in ids"
      :key="`${i}:${id}`"
      class="layer"
      :style="layerStyle(i)"
    >
      <AtlasThumb :id="id" :alt="id" fit="contain" />
    </div>
  </div>
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
  height: 22vmin;
  transform-origin: center center;
  transition: transform 700ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.layer :deep(.atlas-thumb) {
  height: 100%;
  width: auto;
  max-width: none;
  max-height: none;
}
</style>
