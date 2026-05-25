<script setup lang="ts">
import { useInteractionStore } from '~/stores/interaction'
import RelationComponent from '~/components/relations/RelationComponent.vue'
import CentralImage from '~/components/CentralImage.vue'

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
  <section class="view view-3" :class="`bg-${store.canvasBackground}`">
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

    <div class="top-controls">
      <button
        class="bg-toggle"
        :class="{ active: store.canvasBackground === 'black' }"
        :aria-pressed="store.canvasBackground === 'black'"
        @click="store.setCanvasBackground('black')"
      >
        night
      </button>
      <button
        class="interpret-control"
        :class="{ active: store.view3InterpretationMode }"
        :aria-pressed="store.view3InterpretationMode"
        @click="store.toggleView3Interpretation()"
      >
        interpret
      </button>
      <button
        class="bg-toggle"
        :class="{ active: store.canvasBackground === 'gradient' }"
        :aria-pressed="store.canvasBackground === 'gradient'"
        @click="store.setCanvasBackground('gradient')"
      >
        gradient
      </button>
    </div>

    <div
      class="center-anchor"
      :class="{ suppressed: store.view3InterpretationMode }"
      aria-hidden="true"
    >
      <CentralImage
        :ids="store.centralStack"
        :active-index="store.centralStackActiveIndex"
        :expanded="store.overviewConfirmed"
      />
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
  background-attachment: fixed;
  background-size: 100vw 100vh;
  background-position: 0 0;
  color: #e8e8e8;
  overflow: hidden;
  font-family: monospace;
}
/* Grid cross — mirrors project's body::before (project/src/style.css L67-86)
   so the 2×2 split reads as the same structural surface in both apps.
   Project shows it whenever data-state is "split" or "overview"; in
   interface_nuxt, VIEW-3 mounts iff project is in split or overview, so
   the cross is unconditionally visible here. */
.view-3::before {
  content: "";
  position: absolute;
  inset: 1.5%;
  pointer-events: none;
  z-index: 5;
  background:
    linear-gradient(to bottom,
      transparent calc(50% - 0.5px),
      rgba(166, 154, 128, 0.85) calc(50% - 0.5px),
      rgba(166, 154, 128, 0.85) calc(50% + 0.5px),
      transparent calc(50% + 0.5px)),
    linear-gradient(to right,
      transparent calc(50% - 0.5px),
      rgba(166, 154, 128, 0.85) calc(50% - 0.5px),
      rgba(166, 154, 128, 0.85) calc(50% + 0.5px),
      transparent calc(50% + 0.5px));
}
/* canvas-background modes mirror project's setting (project/src/style.css).
   The 10-layer radial stacks are copied verbatim so both surfaces read as
   one continuous atmosphere. RelationComponent panels have no background of
   their own — the gradient shows through them directly. */
.view-3.bg-black {
  background:
    radial-gradient(ellipse 22% 20% at 25% 25%, rgba(65, 60, 60, 0.45) 0%, rgba(65, 60, 60, 0) 100%),
    radial-gradient(ellipse 18% 16% at 30% 18%, rgba(58, 55, 55, 0.4) 0%, rgba(58, 55, 55, 0) 100%),
    radial-gradient(ellipse 24% 22% at 75% 25%, rgba(45, 50, 65, 0.55) 0%, rgba(45, 50, 65, 0) 100%),
    radial-gradient(ellipse 18% 16% at 72% 32%, rgba(58, 58, 60, 0.4) 0%, rgba(58, 58, 60, 0) 100%),
    radial-gradient(ellipse 22% 20% at 25% 75%, rgba(62, 58, 58, 0.45) 0%, rgba(62, 58, 58, 0) 100%),
    radial-gradient(ellipse 18% 16% at 22% 68%, rgba(40, 45, 55, 0.5) 0%, rgba(40, 45, 55, 0) 100%),
    radial-gradient(ellipse 22% 20% at 75% 75%, rgba(35, 42, 60, 0.6) 0%, rgba(35, 42, 60, 0) 100%),
    radial-gradient(ellipse 18% 16% at 78% 80%, rgba(55, 53, 55, 0.4) 0%, rgba(55, 53, 55, 0) 100%),
    radial-gradient(ellipse 28% 24% at 50% 50%, rgba(25, 30, 45, 0.45) 0%, rgba(25, 30, 45, 0) 100%),
    linear-gradient(170deg, #1f2538 0%, #252a3a 35%, #363438 60%, #1c2030 85%, #14182a 100%);
  background-attachment: fixed;
  background-size: 100vw 100vh;
  background-position: 0 0;
}
.view-3.bg-gradient {
  background:
    radial-gradient(ellipse 22% 20% at 25% 25%, rgba(238, 224, 196, 0.7) 0%, rgba(238, 224, 196, 0) 100%),
    radial-gradient(ellipse 18% 16% at 30% 18%, rgba(220, 205, 175, 0.55) 0%, rgba(220, 205, 175, 0) 100%),
    radial-gradient(ellipse 24% 22% at 75% 25%, rgba(185, 188, 192, 0.65) 0%, rgba(185, 188, 192, 0) 100%),
    radial-gradient(ellipse 18% 16% at 72% 32%, rgba(200, 196, 188, 0.5) 0%, rgba(200, 196, 188, 0) 100%),
    radial-gradient(ellipse 22% 20% at 25% 75%, rgba(215, 208, 192, 0.6) 0%, rgba(215, 208, 192, 0) 100%),
    radial-gradient(ellipse 18% 16% at 22% 68%, rgba(175, 178, 180, 0.55) 0%, rgba(175, 178, 180, 0) 100%),
    radial-gradient(ellipse 22% 20% at 75% 75%, rgba(165, 172, 182, 0.65) 0%, rgba(165, 172, 182, 0) 100%),
    radial-gradient(ellipse 18% 16% at 78% 80%, rgba(195, 188, 175, 0.5) 0%, rgba(195, 188, 175, 0) 100%),
    radial-gradient(ellipse 28% 24% at 50% 50%, rgba(170, 170, 168, 0.4) 0%, rgba(170, 170, 168, 0) 100%),
    linear-gradient(170deg, #9aa6b0 0%, #a8a8a4 35%, #b0a896 60%, #8e96a0 85%, #6f7884 100%);
  background-attachment: fixed;
  background-size: 100vw 100vh;
  background-position: 0 0;
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
  /* No background — the gradient from .view-3 must pass through unfiltered.
     The 1px gap reveals the gradient itself as the seam between quadrants. */
}

.center-anchor {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  pointer-events: none;
  width: 22vmin;
  height: 22vmin;
  transition: opacity 240ms ease-out, filter 240ms ease-out;
}
/* unified field suppression during interpretation mode — same rule as
   .constellation.suppressed in RelationComponent so the central reference
   recedes with the relational field as a single perceptual background. */
.center-anchor.suppressed {
  opacity: 0.4;
  filter: blur(1px);
}

.overview-control {
  position: absolute;
  bottom: 4.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
}

.top-controls {
  position: absolute;
  top: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.interpret-control,
.bg-toggle {
  padding: 0.45rem 0.95rem;
  background: rgba(13, 13, 16, 0.7);
  color: #888;
  border: 1px solid #2a2a2e;
  font-family: monospace;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: lowercase;
  cursor: pointer;
  transition: background 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out;
}
.interpret-control:hover,
.bg-toggle:hover {
  color: #ddd;
  border-color: #5a5a66;
}
.interpret-control.active,
.bg-toggle.active {
  background: rgba(232, 232, 232, 0.92);
  color: #0d0d10;
  border-color: #e8e8e8;
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
