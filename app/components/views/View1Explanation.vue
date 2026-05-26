<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useInteractionStore } from '~/stores/interaction'

const store = useInteractionStore()

const PANELS = [
  'Proxima is a tool for exploration of a visual corpus through modes of proximity.',
  'It allows you to engage with images for alternative perspectives.',
]
const PANEL_MS = 5000

const index = ref(0)
const crossDurationMs = computed(() => PANELS.length * PANEL_MS)
let timer: ReturnType<typeof setInterval> | null = null

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function skip() {
  clearTimer()
  store.enterEntryView()
}

onMounted(() => {
  timer = setInterval(() => {
    if (index.value >= PANELS.length - 1) {
      clearTimer()
      store.enterEntryView()
      return
    }
    index.value += 1
  }, PANEL_MS)
})

onBeforeUnmount(() => {
  clearTimer()
})
</script>

<template>
  <section
    class="view-1 bg-gradient"
    :style="{ '--cross-draw-duration': `${crossDurationMs}ms` }"
  >
    <p :key="index" class="caption">{{ PANELS[index] }}</p>
    <button class="skip" @click="skip" aria-label="skip">&gt;</button>
  </section>
</template>

<style scoped>
@keyframes panel-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.view-1 {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 12vh;
  gap: 1.25rem;
  color: #e8e8e8;
  z-index: 100;
}

/* Grid cross — same visual as VIEW-4's body::before-style cross
   (View4Relational.vue), but split into two pseudo-elements (horizontal
   in ::before, vertical in ::after) so each line can animate
   independently. Lines draw from center outward via scaleX/scaleY,
   with duration tracking the full panel-sequence runtime (set via the
   `--cross-draw-duration` CSS variable on the section). Linear easing
   so the cross reaches full extent exactly as the last panel finishes. */
.view-1::before,
.view-1::after {
  content: "";
  position: absolute;
  background: rgba(166, 154, 128, 0.85);
  pointer-events: none;
  z-index: 5;
  transform-origin: center;
}
.view-1::before {
  left: 1.5%;
  right: 1.5%;
  top: 50%;
  height: 1px;
  margin-top: -0.5px;
  animation: cross-draw-h var(--cross-draw-duration, 10000ms) linear forwards;
}
.view-1::after {
  top: 1.5%;
  bottom: 1.5%;
  left: 50%;
  width: 1px;
  margin-left: -0.5px;
  animation: cross-draw-v var(--cross-draw-duration, 10000ms) linear forwards;
}
@keyframes cross-draw-h {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes cross-draw-v {
  from { transform: scaleY(0); }
  to   { transform: scaleY(1); }
}

.caption,
.skip {
  position: relative;
  z-index: 10;
}

.caption {
  max-width: 36rem;
  margin: 0;
  padding: 0 1.5rem;
  font-size: 1.25rem;
  line-height: 1.5;
  text-align: center;
  animation: panel-fade-in 400ms ease-out forwards;
}

.skip {
  background: transparent;
  border: none;
  color: #e8e8e8;
  padding: 0.25rem 0.75rem;
  font-size: 1.5rem;
  line-height: 1;
  font-family: inherit;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 150ms ease;
}

.skip:hover {
  opacity: 1;
}
</style>
