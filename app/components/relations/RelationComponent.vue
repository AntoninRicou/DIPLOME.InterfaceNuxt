<script setup lang="ts">
import { computed, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'

const props = defineProps<{ componentId: string; label: string }>()
const store = useInteractionStore()

const centralImageId = computed(() => store.activeCentralImageId)

const { data, pending, error, refresh } = await useFetch<{
  componentId: string
  centralImageId: string
  related: string[]
}>(() => `/api/relations/${props.componentId}`, {
  query: computed(() => ({ centralImageId: centralImageId.value ?? '' })),
  watch: [centralImageId],
  immediate: !!centralImageId.value,
})

watch(centralImageId, (v) => {
  if (v) refresh()
})

function onRelatedClick(id: string) {
  store.activateCentral(id)
}
</script>

<template>
  <article class="rel">
    <header>
      <span class="tag">{{ label }}</span>
      <span class="cid">{{ componentId }}</span>
    </header>

    <div v-if="!centralImageId" class="status">no central image</div>
    <div v-else-if="pending" class="status">querying…</div>
    <div v-else-if="error" class="status error">error</div>

    <ul v-else class="list">
      <li
        v-for="id in data?.related"
        :key="id"
        class="item"
        tabindex="0"
        @click="onRelatedClick(id)"
        @keydown.enter="onRelatedClick(id)"
        @keydown.space.prevent="onRelatedClick(id)"
      >
        {{ id }}
      </li>
    </ul>
  </article>
</template>

<style scoped>
.rel {
  border: 1px solid #2a2a2e;
  background: #131316;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #2a2a2e;
  margin-bottom: 0.5rem;
}
.tag {
  font-family: monospace;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  color: #aaa;
}
.cid {
  font-family: monospace;
  font-size: 0.65rem;
  color: #666;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.item {
  font-family: monospace;
  font-size: 0.7rem;
  color: #c0c0c0;
  padding: 4px 6px;
  border: 1px solid transparent;
  cursor: pointer;
  word-break: break-all;
}
.item:hover,
.item:focus {
  background: #1c1c22;
  border-color: #444;
  outline: none;
}
.status {
  font-family: monospace;
  font-size: 0.75rem;
  color: #777;
  padding: 0.5rem 0;
}
.status.error {
  color: #c66;
}
</style>
