<script setup lang="ts">
import { computed } from 'vue'
import { view3Interpretations } from '~/view3/view3Interpretations'

// Single source for the proximity title + body block, shared by VIEW_3's
// per-quadrant text and VIEW_4's interpretation panel. Content comes from
// `view3Interpretations` (keyed by componentId); typography comes from the
// global `.proximity-panel*` classes in app.vue. The consuming view only
// supplies positioning via a fall-through class (`.quadrant-text` /
// `.interpretation-panel`) + any attrs (e.g. `data-align`), which Vue
// merges onto this component's root. Edit the markup here once and both
// spots change.
const props = defineProps<{ componentId: string }>()
const interpretation = computed(() => view3Interpretations[props.componentId])

// Interface-only line break: collapse the project's own `\n` (it breaks at a
// different per-quadrant point), then break before "related to the centered"
// for all four. The project body (emitted via set-canvas-text from the store)
// is untouched, so the feedback quadrant line keeps its own break.
const displayBody = computed(() =>
  (interpretation.value?.body ?? '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+related to the centered/, '\nrelated to the centered'),
)
</script>

<template>
  <div class="proximity-panel" :data-component="componentId">
    <p class="proximity-panel-title">{{ interpretation?.title }}</p>
    <p class="proximity-panel-body">{{ displayBody }}</p>
  </div>
</template>

<style scoped>
/* Honour the interface-only `\n` inserted in displayBody (the global
   .proximity-panel-body otherwise collapses it). Scoped → interface only. */
.proximity-panel-body {
  white-space: pre-line;
}
</style>
