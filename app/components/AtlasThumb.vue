<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  id: string
  alt?: string
  fit?: 'contain' | 'width'
  source?: 'atlas' | 'original'
}>(), { fit: 'contain', source: 'atlas' })

const { getThumbStyle, getAspect } = useAtlas()

const style = computed(() => {
  const aspect = getAspect(props.id)
  const sizing = {
    aspectRatio: String(aspect),
    width: props.fit === 'width' ? '100%' : 'auto',
    height: props.fit === 'contain' ? '100%' : 'auto',
  }

  if (props.source === 'original') {
    return {
      ...sizing,
      backgroundImage: `url(/images/${props.id}.jpg)`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'contain',
      backgroundPosition: 'center center',
    }
  }

  return { ...getThumbStyle(props.id), ...sizing }
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
