<script setup lang="ts">
import { useViewStateStore } from '~/stores/viewState'

const viewState = useViewStateStore()
</script>

<template>
  <main>
    <component
      :is="viewState.activeComponent"
      :key="viewState.current"
    />
  </main>
</template>

<style scoped>
main {
  min-height: 100vh;
  background: #0d0d10;
}
</style>
