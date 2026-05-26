<script setup lang="ts">
import { useViewStateStore } from '~/stores/viewState'

const viewState = useViewStateStore()
</script>

<template>
  <section
    class="view-0 bg-gradient"
    @click="viewState.advance()"
  >
    <p class="caption">PROXIMA</p>
    <p class="hint">click anywhere to continue</p>
  </section>
</template>

<style scoped>
@keyframes view0-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.view-0 {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  color: #e8e8e8;
  cursor: pointer;
  z-index: 100;
  animation: view0-fade-in 200ms ease-out forwards;
}

.caption {
  font-size: 2rem;
  letter-spacing: 0.2em;
  margin: 0;
}

.hint {
  font-size: 0.85rem;
  opacity: 0.6;
  margin: 0;
}
</style>
