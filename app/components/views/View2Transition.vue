<script setup lang="ts">
import { computed } from 'vue'
import { useInteractionStore } from '~/stores/interaction'

const store = useInteractionStore()

const remainingSeconds = computed(() => Math.ceil(store.view2RemainingMs / 1000))
</script>

<template>
  <section class="view view-2">
    <header class="view-header">
      <span class="tag">VIEW-2</span>
      <h1>transition</h1>
    </header>

    <div class="timeline">
      <div class="line">
        <span class="dot done" /><span class="seg done" /><span class="dot active" /><span class="seg" /><span class="dot" />
      </div>
      <div class="labels">
        <span class="done">disperse</span>
        <span class="active">transition</span>
        <span>relation</span>
      </div>
    </div>

    <div class="state">
      <p class="line-label">selected image</p>
      <p class="line-value">{{ store.activeCentralImageId ?? '—' }}</p>
    </div>

    <button class="advance" @click="store.enterRelationalView()">
      enter relational view ({{ remainingSeconds }}s)
    </button>
  </section>
</template>

<style scoped>
.view-2 {
  padding: 2rem;
  min-height: 100vh;
  color: #e8e8e8;
  background: #0d0d10;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.view-header { margin: 0; }
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
  margin: 0.5rem 0 0;
}
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 480px;
}
.line {
  display: flex;
  align-items: center;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #333;
  border: 1px solid #555;
}
.dot.done { background: #6a6; border-color: #6a6; }
.dot.active { background: #fff; border-color: #fff; }
.seg {
  flex: 1;
  height: 1px;
  background: #333;
}
.seg.done { background: #6a6; }
.labels {
  display: flex;
  justify-content: space-between;
  font-family: monospace;
  font-size: 0.75rem;
  color: #777;
}
.labels .done { color: #6a6; }
.labels .active { color: #fff; }
.state {
  border-left: 2px solid #2a2a2e;
  padding: 0.5rem 1rem;
}
.line-label {
  font-family: monospace;
  font-size: 0.7rem;
  color: #777;
  margin: 0 0 0.25rem;
}
.line-value {
  font-family: monospace;
  color: #d0d0d0;
  margin: 0;
  word-break: break-all;
}
.advance {
  align-self: flex-start;
  padding: 0.6rem 1rem;
  background: transparent;
  color: #e8e8e8;
  border: 1px solid #5a5a66;
  font-family: monospace;
  font-size: 0.85rem;
  cursor: pointer;
}
.advance:hover {
  background: #1e1e24;
  border-color: #888;
}
</style>
