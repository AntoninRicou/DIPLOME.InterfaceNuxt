<script setup lang="ts">
import { useInteractionStore } from '~/stores/interaction'
import CentralImage from '~/components/CentralImage.vue'

const store = useInteractionStore()
</script>

<template>
  <section class="view-2 bg-gradient">
    <div class="central-slot">
      <CentralImage :ids="store.centralStack" :active-index="store.centralStackActiveIndex" />
    </div>

    <p class="caption">
      Four modes of proximity, each shaping relations differently:<br>
      Mirror (visual), Trace (source), Shift (semantic), Replay (collaborative).
    </p>
  </section>
</template>

<style scoped>
@keyframes view2-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Backdrop comes from the global `.bg-gradient` class (app.vue) — same
   day gradient as VIEW-3 in gradient mode and as project. Hardcoded
   rather than bound to store.canvasBackground because VIEW-2 only ever
   shows once per session, before any toggle is reachable. */
.view-2 {
  position: fixed;
  inset: 0;
  color: #e8e8e8;
  z-index: 100;
  animation: view2-fade-in 200ms ease-out forwards;
}

/* Image anchored at true viewport centre so it sits exactly where VIEW-3's
   .center-anchor will land — no positional jump on transition. */
.central-slot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 22vmin;
  height: 22vmin;
}

.caption {
  position: absolute;
  bottom: 3rem;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  max-width: 36rem;
  text-align: center;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #2a2e36;
}
</style>
