<script setup lang="ts">
import { useInteractionStore } from '~/stores/interaction'
import RelationComponent from '~/components/relations/RelationComponent.vue'

const store = useInteractionStore()
</script>

<template>
  <section class="view view-3">
    <aside class="sidebar">
      <header>
        <span class="tag">VIEW-3</span>
        <h1>relational</h1>
      </header>

      <div class="block">
        <p class="label">central image</p>
        <p class="value">{{ store.activeCentralImageId ?? '—' }}</p>
      </div>

      <div class="block">
        <p class="label">
          history ({{ store.historyIndex + 1 }}/{{ store.navigationHistory.length }})
        </p>
        <ol class="history">
          <li
            v-for="(id, i) in store.navigationHistory"
            :key="id + ':' + i"
            :class="{
              current: i === store.historyIndex,
              future: i > store.historyIndex,
            }"
            tabindex="0"
            @click="store.jumpToHistory(i)"
            @keydown.enter="store.jumpToHistory(i)"
            @keydown.space.prevent="store.jumpToHistory(i)"
          >
            {{ id }}
          </li>
        </ol>
        <div class="nav-buttons">
          <button
            class="back"
            :disabled="!store.historyHasPrevious"
            @click="store.stepBackInHistory()"
          >
            ← back
          </button>
          <button
            class="back"
            :disabled="!store.historyHasForward"
            @click="store.stepForwardInHistory()"
          >
            forward →
          </button>
        </div>
      </div>

      <div class="block">
        <p class="label">selected ({{ store.selectedImages.length }})</p>
      </div>
    </aside>

    <div class="grid">
      <RelationComponent component-id="component_1" label="component-1" />
      <RelationComponent component-id="component_2" label="component-2" />
      <RelationComponent component-id="component_3" label="component-3" />
      <RelationComponent component-id="component_4" label="component-4" />
    </div>
  </section>
</template>

<style scoped>
.view-3 {
  min-height: 100vh;
  background: #0d0d10;
  color: #e8e8e8;
  display: grid;
  grid-template-columns: 260px 1fr;
}
.sidebar {
  border-right: 1px solid #2a2a2e;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  font-family: monospace;
  font-size: 0.8rem;
}
.tag {
  display: inline-block;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  padding: 2px 8px;
  border: 1px solid #444;
  border-radius: 2px;
  color: #aaa;
}
h1 {
  font-weight: 300;
  font-family: sans-serif;
  margin: 0.5rem 0 0;
}
.block .label {
  font-size: 0.7rem;
  color: #777;
  margin: 0 0 0.25rem;
}
.value {
  margin: 0;
  word-break: break-all;
  color: #d0d0d0;
}
.history {
  margin: 0 0 0.5rem;
  padding: 0;
  list-style: none;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.history li {
  color: #888;
  padding: 2px 4px;
  word-break: break-all;
  cursor: pointer;
  border: 1px solid transparent;
}
.history li:hover,
.history li:focus {
  border-color: #444;
  outline: none;
  background: #16161a;
}
.history li.current {
  color: #fff;
  background: #1c1c22;
  border-color: #555;
}
.history li.future {
  color: #555;
}
.nav-buttons {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.25rem;
}
.back {
  padding: 0.35rem 0.6rem;
  background: transparent;
  color: #ccc;
  border: 1px solid #5a5a66;
  font-family: monospace;
  font-size: 0.7rem;
  cursor: pointer;
}
.back:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.back:not(:disabled):hover {
  background: #1e1e24;
  border-color: #888;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  background: #2a2a2e;
  padding: 1px;
  height: 100vh;
  overflow: hidden;
}
</style>
