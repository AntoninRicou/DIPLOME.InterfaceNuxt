<script setup lang="ts">
import { useInteractionStore } from '~/stores/interaction'

const store = useInteractionStore()

const { data, pending, error } = await useFetch<{ total: number; ids: string[] }>(
  '/api/mapping',
  { query: { limit: 60 } },
)

function onSelect(id: string) {
  store.selectImage(id)
}
</script>

<template>
  <section class="view view-1">
    <header class="view-header">
      <span class="tag">VIEW-1</span>
      <h1>disperse</h1>
      <p class="hint">select an image to continue</p>
    </header>

    <div v-if="pending" class="status">loading…</div>
    <div v-else-if="error" class="status error">failed to load mapping</div>

    <ul v-else class="grid" role="listbox">
      <li
        v-for="id in data?.ids"
        :key="id"
        class="cell"
        role="option"
        tabindex="0"
        @click="onSelect(id)"
        @keydown.enter="onSelect(id)"
        @keydown.space.prevent="onSelect(id)"
      >
        <span class="cell-id">{{ id }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.view-1 {
  padding: 2rem;
  min-height: 100vh;
  color: #e8e8e8;
  background: #0d0d10;
}
.view-header {
  margin-bottom: 1.5rem;
}
.tag {
  display: inline-block;
  font-family: monospace;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  padding: 2px 8px;
  border: 1px solid #444;
  border-radius: 2px;
  color: #aaa;
}
h1 {
  font-weight: 300;
  margin: 0.5rem 0 0.25rem;
}
.hint {
  font-size: 0.85rem;
  color: #888;
  margin: 0;
}
.grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.5rem;
}
.cell {
  border: 1px solid #2a2a2e;
  background: #16161a;
  padding: 0.75rem;
  font-family: monospace;
  font-size: 0.75rem;
  color: #c0c0c0;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.cell:hover,
.cell:focus {
  background: #1e1e24;
  border-color: #5a5a66;
  outline: none;
}
.cell-id {
  word-break: break-all;
}
.status {
  padding: 1rem;
  color: #888;
}
.status.error {
  color: #c66;
}
</style>
