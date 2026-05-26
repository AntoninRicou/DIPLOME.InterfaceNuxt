<script setup lang="ts">
import { useInteractionStore } from '~/stores/interaction'
import View0Disperse from '~/components/views/View0Disperse.vue'
import View2Transition from '~/components/views/View2Transition.vue'
import View3Relational from '~/components/views/View3Relational.vue'

const store = useInteractionStore()
</script>

<template>
  <main>
    <View0Disperse v-if="store.isInView0" />
    <View2Transition v-else-if="store.isInView2" />
    <View3Relational v-else-if="store.isInView3" />
  </main>
</template>

<style scoped>
main {
  min-height: 100vh;
  background: #0d0d10;
}
</style>
