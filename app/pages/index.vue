<script setup lang="ts">
import { useViewStateStore } from '~/stores/viewState'

const viewState = useViewStateStore()
</script>

<template>
  <main class="bg-gradient">
    <Transition name="view">
      <component
        :is="viewState.activeComponent"
        :key="viewState.current"
      />
    </Transition>
  </main>
</template>

<style scoped>
main {
  min-height: 100vh;
}
</style>

<style>
.view-enter-active,
.view-leave-active {
  transition: opacity 350ms ease;
}
.view-enter-from,
.view-leave-to {
  opacity: 0;
}
/* During cross-fade, both views are mounted. The new one stacks on top
   in DOM order; disable clicks on the leaving one so stale handlers
   (e.g. the disperse iframe's pick) can't fire during the swap. */
.view-leave-active {
  pointer-events: none;
}
</style>
