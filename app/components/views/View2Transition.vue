<script setup lang="ts">
import { computed } from 'vue'
import { useInteractionStore } from '~/stores/interaction'

const store = useInteractionStore()

const remainingSeconds = computed(() => Math.ceil(store.view2RemainingMs / 1000))
</script>

<template>
  <section class="view-2">
    <div class="content">
      <p class="label">selected image</p>
      <p class="id">{{ store.activeCentralImageId ?? '—' }}</p>

      <p class="placeholder">
        Entering a relational space.
        The system is repositioning around your selection.
        Hold a moment.
      </p>

      <p class="countdown">{{ remainingSeconds }}</p>

      <button class="skip" @click="store.enterRelationalView('skip')">
        skip
      </button>
    </div>
  </section>
</template>

<style scoped>
@keyframes view2-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.view-2 {
  position: fixed;
  inset: 0;
  background: #1a1a1a;
  color: #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: view2-fade-in 200ms ease-out forwards;
}
.content {
  text-align: center;
  max-width: 520px;
  padding: 2rem;
}
.label {
  font-family: monospace;
  font-size: 0.7rem;
  color: #777;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin: 0 0 0.5rem;
}
.id {
  font-family: monospace;
  font-size: 0.95rem;
  color: #d0d0d0;
  margin: 0 0 2.5rem;
  word-break: break-all;
}
.placeholder {
  font-size: 0.95rem;
  line-height: 1.6;
  color: #a0a0a0;
  margin: 0 0 3rem;
}
.countdown {
  font-family: monospace;
  font-size: 3rem;
  font-weight: 300;
  color: #fff;
  margin: 0 0 2rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.skip {
  background: transparent;
  color: #777;
  border: 1px solid #3a3a3e;
  font-family: monospace;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  padding: 0.45rem 1.2rem;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease;
}
.skip:hover {
  color: #ccc;
  border-color: #666;
}
</style>
