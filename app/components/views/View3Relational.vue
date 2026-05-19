<script setup lang="ts">
import { useInteractionStore } from '~/stores/interaction'
import RelationComponent from '~/components/relations/RelationComponent.vue'

const store = useInteractionStore()

const MAX_BRANCH_DEPTH = 10

function dotStateAt(i: number): 'current' | 'past' | 'future' | 'empty' {
  if (i >= store.navigationHistory.length) return 'empty'
  if (i === store.historyIndex) return 'current'
  if (i < store.historyIndex) return 'past'
  return 'future'
}

function onDotClick(i: number) {
  if (i < store.navigationHistory.length) store.jumpToHistory(i)
}
</script>

<template>
  <section class="view view-3">
    <div
      v-if="store.view2ExitReason === 'auto'"
      class="reveal-overlay"
      aria-hidden="true"
    />

    <div class="grid">
      <RelationComponent component-id="component_1" label="component-1" position="tl" />
      <RelationComponent component-id="component_2" label="component-2" position="tr" />
      <RelationComponent component-id="component_3" label="component-3" position="bl" />
      <RelationComponent component-id="component_4" label="component-4" position="br" />
    </div>

    <div class="center-anchor" aria-hidden="true">
      <p class="anchor-label">central</p>
      <p class="anchor-id">{{ store.activeCentralImageId ?? '—' }}</p>
    </div>

    <div v-if="store.overviewEligible" class="overview-control">
      <button class="confirm" @click="store.confirmOverview()">
        confirm overview ({{ store.historyIndex + 1 }}/{{ MAX_BRANCH_DEPTH }})
      </button>
    </div>
    <div v-else-if="store.overviewConfirmed" class="overview-control confirmed">
      overview active
    </div>

    <nav class="history-strip" aria-label="navigation history">
      <button
        class="strip-nav"
        :disabled="!store.historyHasPrevious"
        aria-label="step back"
        @click="store.stepBackInHistory()"
      >◄</button>
      <ol class="strip-dots">
        <li
          v-for="i in MAX_BRANCH_DEPTH"
          :key="i"
          :class="dotStateAt(i - 1)"
          :tabindex="i - 1 < store.navigationHistory.length ? 0 : -1"
          :title="store.navigationHistory[i - 1] ?? ''"
          @click="onDotClick(i - 1)"
          @keydown.enter="onDotClick(i - 1)"
          @keydown.space.prevent="onDotClick(i - 1)"
        >
          <span class="dot" />
        </li>
      </ol>
      <button
        class="strip-nav"
        :disabled="!store.historyHasForward"
        aria-label="step forward"
        @click="store.stepForwardInHistory()"
      >►</button>
    </nav>
  </section>
</template>

<style scoped>
.view-3 {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #0d0d10;
  color: #e8e8e8;
  overflow: hidden;
  font-family: monospace;
}

@keyframes reveal-fade {
  from { opacity: 1; }
  to { opacity: 0; }
}
.reveal-overlay {
  position: fixed;
  inset: 0;
  background: #1a1a1a;
  z-index: 100;
  pointer-events: none;
  animation: reveal-fade 400ms ease-out forwards;
}

.grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  background: #1a1a1e;
}

.center-anchor {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  pointer-events: none;
  text-align: center;
  padding: 0.55rem 0.95rem;
  background: rgba(13, 13, 16, 0.85);
  border: 1px solid #3a3a44;
  min-width: 9rem;
}
.anchor-label {
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  color: #6a6a72;
  margin: 0 0 0.25rem;
  text-transform: uppercase;
}
.anchor-id {
  font-size: 0.82rem;
  color: #e8e8e8;
  margin: 0;
  word-break: break-all;
}

.overview-control {
  position: absolute;
  bottom: 4.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
}
.confirm {
  padding: 0.5rem 0.95rem;
  background: rgba(155, 110, 207, 0.12);
  color: #cda6f0;
  border: 1px solid #9b6ecf;
  font-family: monospace;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background 150ms ease-out;
}
.confirm:hover {
  background: rgba(155, 110, 207, 0.28);
}
.confirmed {
  font-size: 0.62rem;
  color: #888;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 0.4rem 0.8rem;
  border: 1px solid #5a5a66;
  background: rgba(13, 13, 16, 0.7);
}

.history-strip {
  position: absolute;
  bottom: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 11;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.8rem;
  background: rgba(13, 13, 16, 0.72);
  border: 1px solid #2a2a2e;
}
.strip-nav {
  background: transparent;
  border: none;
  color: #888;
  font-family: monospace;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
}
.strip-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.strip-nav:not(:disabled):hover {
  color: #ddd;
}
.strip-dots {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.strip-dots li {
  padding: 0.25rem;
  outline: none;
  cursor: pointer;
}
.strip-dots li.empty {
  cursor: default;
}
.strip-dots li .dot {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4a4a52;
  transition: background 150ms ease-out, transform 150ms ease-out, border-color 150ms ease-out;
  box-sizing: border-box;
}
.strip-dots li.past .dot { background: #8a8a92; }
.strip-dots li.current .dot {
  background: #e8e8e8;
  transform: scale(1.45);
}
.strip-dots li.future .dot { background: #3a3a42; }
.strip-dots li.empty .dot {
  background: transparent;
  border: 1px solid #2a2a2e;
  width: 5px;
  height: 5px;
}
.strip-dots li:not(.empty):hover .dot,
.strip-dots li:not(.empty):focus .dot {
  background: #c0c0c8;
}
</style>
