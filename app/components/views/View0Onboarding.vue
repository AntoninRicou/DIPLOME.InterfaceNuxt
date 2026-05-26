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
    <p class="hint">No image belong to one place</p>
  </section>
</template>

<style scoped>
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
