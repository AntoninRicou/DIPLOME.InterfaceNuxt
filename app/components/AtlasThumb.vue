<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  id: string
  alt?: string
  fit?: 'contain' | 'width'
}>(), { fit: 'contain' })

const { getThumbStyle, getAspect } = useAtlas()

const style = computed(() => {
  const aspect = getAspect(props.id)
  const base = getThumbStyle(props.id)

  return {
    ...base,
    aspectRatio: String(aspect),
    width: props.fit === 'width' ? '100%' : 'auto',
    height: props.fit === 'contain' ? '100%' : 'auto',
  }
})
</script>

<template>
  <div
    class="atlas-thumb"
    role="img"
    :aria-label="alt ?? id"
    :style="style"
  />
</template>

<style scoped>
.atlas-thumb {
  display: block;
  max-width: 100%;
  max-height: 100%;
}
</style>
