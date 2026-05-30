<script setup lang="ts">
import { computed } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import RelationComponent from '~/components/relations/RelationComponent.vue'
import CentralImage from '~/components/CentralImage.vue'

const store = useInteractionStore()
const { naturalDimsVmin } = useCentralImageDims()

const MAX_BRANCH_DEPTH = 10

// Track the visible silhouette of the active central image so .center-
// anchor (the hover-zoom sensor) matches it pixel-for-pixel. With the
// previous fixed 22vmin square, landscape/portrait images extended past
// the hit area (cursor on image → no hover) and small images left blank
// in-box space (cursor in box → hover with nothing under it). Disabled
// in expanded mode (overview-confirmed) — the deck spreads into a circle
// then and there's no single "active layer at the centre" to match.
const centerAnchorStyle = computed(() => {
  if (store.overviewConfirmed) return {}
  const id = store.activeCentralImageId
  if (!id) return {}
  const dims = naturalDimsVmin(id)
  return {
    width: `${dims.width}vmin`,
    height: `${dims.height}vmin`,
  }
})

function dotStateAt(i: number): 'current' | 'past' | 'future' | 'empty' {
  if (i >= store.navigationHistory.length) return 'empty'
  if (i === store.historyIndex) return 'current'
  if (i < store.historyIndex) return 'past'
  return 'future'
}

function onDotClick(i: number) {
  if (i < store.navigationHistory.length) store.jumpToHistory(i)
}

// Finale options shown after `See your path` is clicked. Behaviour
// stubs only — refine when the post-experience routing is defined.
function onTryAgain() {
  window.location.reload()
}
function onLeave() {
  // TBD: hook to whatever "end of experience" routing we want.
}
</script>

<template>
  <section
    class="view view-3"
    :class="[`bg-${store.canvasBackground}`, { minimal: store.overviewConfirmed }]"
  >
    <div
      v-if="store.view2ExitReason === 'auto'"
      class="reveal-overlay"
      aria-hidden="true"
    />

    <div v-if="!store.overviewConfirmed" class="grid">
      <RelationComponent component-id="component_1" label="Mirror" position="tl" />
      <RelationComponent component-id="component_2" label="Trace" position="tr" />
      <RelationComponent component-id="component_3" label="Shift" position="bl" />
      <RelationComponent component-id="component_4" label="Replay" position="br" />
    </div>

    <div v-if="!store.overviewConfirmed" class="top-controls">
      <button
        class="bg-toggle"
        :class="{ active: store.canvasBackground === 'black' }"
        :aria-pressed="store.canvasBackground === 'black'"
        aria-label="night background"
        @click="store.setCanvasBackground('black')"
      >
        <span class="dot dot-black" aria-hidden="true" />
      </button>
      <button
        class="interpret-control"
        :class="{ active: store.view3InterpretationMode }"
        :aria-pressed="store.view3InterpretationMode"
        aria-label="toggle interpretation mode"
        @click="store.toggleView3Interpretation()"
      >
        +
      </button>
      <button
        class="bg-toggle"
        :class="{ active: store.canvasBackground === 'gradient' }"
        :aria-pressed="store.canvasBackground === 'gradient'"
        aria-label="day background"
        @click="store.setCanvasBackground('gradient')"
      >
        <span class="dot dot-white" aria-hidden="true" />
      </button>
    </div>

    <div
      class="center-anchor"
      :class="{ suppressed: store.view3InterpretationMode }"
      :style="centerAnchorStyle"
      aria-hidden="true"
      @mouseenter="store.setQuadrantHover(null)"
    >
      <CentralImage
        :ids="store.centralStack"
        :active-index="store.centralStackActiveIndex"
        :expanded="store.overviewConfirmed"
        source="original"
        @update:hovered="store.setCentralHovered"
      />
    </div>

    <p
      v-if="!store.overviewConfirmed"
      class="interpret-message"
      :class="{ visible: store.view3InterpretationMode }"
      aria-live="polite"
    >
      No image belong to one place
    </p>

    <div v-if="store.overviewEligible" class="overview-control">
      <button class="contribute" @click="store.confirmOverview()">
        Contribute to proxima
      </button>
    </div>
    <div
      v-else-if="store.overviewConfirmed && !store.singlePathViewActive"
      class="overview-control"
    >
      <button class="contribute" @click="store.enterSinglePathView()">
        See your path
      </button>
    </div>
    <div
      v-else-if="store.singlePathViewActive"
      class="overview-control finale"
    >
      <button class="contribute" @click="onTryAgain">
        try a new proxima
      </button>
      <button class="contribute" @click="onLeave">
        leave the experience
      </button>
    </div>

    <nav
      v-if="!store.overviewConfirmed"
      class="history-strip"
      aria-label="navigation history"
    >
      <ol class="strip-steps">
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
          <span class="step" />
        </li>
      </ol>
    </nav>
  </section>
</template>

<style scoped>
.view-3 {
  position: relative;
  width: 100vw;
  height: 100vh;
  /* Background comes from the global .bg-black / .bg-gradient class in
     app.vue, applied via :class="bg-${store.canvasBackground}". Setting
     `background` here would win against the global class due to scoped
     style specificity. */
  color: #595b54;
  overflow: hidden;
}
/* Grid cross — mirrors project's body::before (project/src/style.css L67-86)
   so the 2×2 split reads as the same structural surface in both apps.
   Project shows it whenever data-state is "split" or "overview"; in
   interface_nuxt, VIEW-3 mounts iff project is in split or overview, so
   the cross is unconditionally visible here. */
.view-3::before {
  content: "";
  position: absolute;
  inset: 5%;
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
/* `.minimal` mode (post-Contribute) — only the central image deck, the
   gradient backdrop, and the `See your path` button remain. The grid
   cross is part of "everything else" and gets suppressed too. */
.view-3.minimal::before {
  display: none;
}
/* Canvas-background modes live globally in app.vue (`.bg-black` /
   `.bg-gradient`) — shared across all views. .view-3 just applies the
   right class via `:class="bg-${store.canvasBackground}"`. */

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
  /* Above `.rel:hover` (z: 50). Once the cursor was inside a quadrant,
     .rel:hover stayed true as the cursor moved toward the centre and the
     lifted .rel occluded the central image — quadrant hover kept firing
     even while the cursor was visually on the central image. With the
     centre on top, the moment the cursor enters its box .rel:hover drops
     false (cursor no longer designates .rel) and the centre's mouseenter
     fires, so setQuadrantHover(null) lands at the right beat. Cells don't
     overlap the centre geometrically (they sit at the outer corners of
     each quadrant), so this doesn't hide any cell hover feedback. */
  z-index: 60;
  /* Acts as the hover sensor that returns all four canvases to the
     default zoom-on-image (VIEW_4 hover-zoom rule). Was `none` so
     hovers fell through to the quadrant below the central image; the
     hit box overlaps the inner corner of each quadrant but the
     relation cells sit at 10% from the outer corners, so swallowing
     pointer events here doesn't block any cell. */
  pointer-events: auto;
  /* Fallback size — overridden inline (`:style="centerAnchorStyle"`)
     with the active image's natural dimensions in vmin so the hover
     hit area tracks the visible image silhouette. Width/height are
     NOT transitioned — on activeCentralImageId change, the new active
     layer is a fresh-mounted DOM element (new TransitionGroup key) so
     it paints at its target dims instantly; the hit area must snap
     in lockstep, not animate. A transition here would leave the hit
     area lagging behind the visible image for ~700ms after each
     click — exactly the "cursor on image but no hover" symptom the
     dynamic sizing is supposed to remove. */
  width: 22vmin;
  height: 22vmin;
  transition:
    opacity 240ms ease-out,
    filter 240ms ease-out;
}
/* unified field suppression during interpretation mode — same rule as
   .constellation.suppressed in RelationComponent so the central reference
   recedes with the relational field as a single perceptual background. */
.center-anchor.suppressed {
  opacity: 0.4;
  filter: blur(1px);
  /* In interpretation mode the centred `.interpret-message` (z: 11)
     must sit above the suppressed central deck — drop the centre's
     z below it. Hover-zoom isn't a concern here: the rel quadrants
     are .is-inert (pointer-events: none) in interpretation mode, so
     no quadrant hover can fire either way. */
  z-index: 10;
}
/* Hover halo — warm beige glow matching the system palette
   (history-strip `.current` step, contribute button bloom). Targets
   ONLY the topmost layer (`.layer.is-active`) so the drop-shadow
   wraps just the active image's alpha contour, not the union of every
   stacked silhouette in the deck. No filter transition on the layer
   (its `transition` rule covers only transform/width/height), so the
   glow snaps in and out instantly — same feel as the quadrant cell
   hover. Suppressed in interpretation mode (`.center-anchor.suppressed`
   sits behind the `:not(.suppressed)` guard) — the central reference
   is intentionally receding then. */
.center-anchor:not(.suppressed):hover :deep(.layer.is-active) {
  filter:
    drop-shadow(0 0 8px rgba(249, 236, 208, 0.75))
    drop-shadow(0 0 18px rgba(249, 236, 208, 0.45))
    drop-shadow(0 0 32px rgba(249, 236, 208, 0.22));
}

.interpret-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0 1.5rem;
  max-width: 36rem;
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.2;
  color: #595b54;
  opacity: 0;
  pointer-events: none;
  z-index: 11;
  transition: opacity 240ms ease-out;
}
.interpret-message.visible {
  opacity: 1;
}

.overview-control {
  position: absolute;
  bottom: 4.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
}
/* `finale` — two stacked options shown after `See your path` is clicked.
   Vertical stack keeps each call-to-action on its own line so the warm
   pulse glow of each button doesn't overlap the next. */
.overview-control.finale {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

/* 3-column grid spanning the full viewport width: side buttons live in
   1fr columns and hug the centre; the interpret-control sits in the
   auto-sized middle column, which is the viewport's geometric centre
   regardless of how wide `night` / `gradient` text are. */
.top-controls {
  position: absolute;
  /* Aligned to the top corner labels (Mirror / Trace): those sit at
     top:0 + 0.75rem padding, so their text centre is ~1.12rem down.
     The buttons are 1.8rem tall, so top = 1.12 - 0.9 ≈ 0.22rem puts
     the button centres on the same line as the component titles. */
  top: 0.22rem;
  left: 0;
  right: 0;
  z-index: 12;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
}
.top-controls > .bg-toggle:first-of-type { justify-self: end; }
.top-controls > .bg-toggle:last-of-type  { justify-self: start; }
.interpret-control,
.bg-toggle {
  padding: 0.45rem 0.95rem;
  background: rgba(13, 13, 16, 0.7);
  color: #595b54;
  border: 1px solid #2a2a2e;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  cursor: pointer;
  transition: background 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out;
}

/* Background toggles are now circle-icon buttons. The colored dot itself
   represents the mode (black = night, white = day); the button frame is
   stripped so only the dot is visible. */
.bg-toggle {
  background: transparent;
  border-color: transparent;
  padding: 0;
  width: 1.8rem;
  height: 1.8rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.bg-toggle .dot {
  /* Square (not circle), sized to match the timeline history squares.
     Only the aspect changes — the toggle behaviour, click target
     (1.8rem button), fills, active ring and hover are unchanged. */
  width: 5px;
  height: 5px;
  border-radius: 0;
  display: block;
  transition: transform 150ms ease-out, box-shadow 150ms ease-out;
}
.bg-toggle .dot-black {
  background: #0d0d10;
  /* Faint outline so the black dot stays visible against the black
     background mode without merging into it. */
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
}
.bg-toggle .dot-white {
  background: #ffffff;
  /* Same idea inverted — keeps the white dot legible on the bright day
     gradient. */
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
}
.bg-toggle:hover .dot {
  transform: scale(1.15);
}
.bg-toggle.active .dot {
  /* Active mode: outline ring around the dot to mark current selection. */
  box-shadow: 0 0 0 1px currentColor, 0 0 0 3px rgba(255, 255, 255, 0.55);
}
.bg-toggle.active .dot-black { color: #0d0d10; }
.bg-toggle.active .dot-white { color: #ffffff; }
/* Interpret control is a single-glyph icon — no background, no border.
   The glyph is centered in a square box via flex so its visual centre
   sits on the button's geometric centre (typography baseline alone
   would leave it slightly low). Color is deliberately dark enough to
   read against the bright day gradient. */
.interpret-control {
  background: transparent;
  border-color: transparent;
  width: 1.8rem;
  height: 1.8rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  line-height: 1;
  letter-spacing: 0;
  color: #595b54;
}
.interpret-control:hover {
  color: #2a2e36;
}
.interpret-control.active {
  color: #2a2e36;
}
/* "Contribute to proxima" — surfaces once the active branch reaches the
   overview cap. Uses the title typography (`.proximity-panel-title` in
   app.vue: serif / 0.95rem / 600 / 0.02em) and the same warm pulsing
   bloom palette as VIEW_3's `.cross-button`.

   Perf note: the bloom is rendered as a single radial-gradient on a
   ::before pseudo-element animating opacity only (GPU-compositable),
   instead of an animated `text-shadow`. text-shadow with multi-layer
   large-radius blurs is paint-per-character per-frame — fine for the
   single `+` glyph in VIEW_3, but ~21× the cost on this 21-char string,
   and was visibly slowing the interface. */
.contribute {
  position: relative;
  background: transparent;
  border: none;
  padding: 0.4rem 0.6rem;
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.2;
  color: #595b54;
  cursor: pointer;
  transition: color 150ms ease-out;
}
.contribute:hover {
  color: #2a2e36;
}
.contribute::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 280px;
  height: 140px;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    ellipse at center,
    rgba(255, 245, 215, 0.95) 0%,
    rgba(252, 230, 180, 0.85) 12%,
    rgba(245, 215, 155, 0.65) 28%,
    rgba(238, 200, 135, 0.4) 50%,
    rgba(230, 188, 120, 0.18) 72%,
    rgba(220, 175, 105, 0) 100%
  );
  pointer-events: none;
  z-index: -1;
  opacity: 0;
  animation: contribute-glow 1.8s ease-in-out infinite;
  will-change: opacity;
}

@keyframes contribute-glow {
  0%, 100% { opacity: 0; }
  50% { opacity: 0.45; }
}

/* Navigation history — a row of discrete square steps. No prev/next
   controls, no connecting line: navigation happens by clicking a square
   directly (same handler as the old dots). The wrapper is neutral (no
   pill, no border) so the squares read as a bare sequence over the
   gradient. Behaviour is unchanged — this is a visual-only restyle. */
/* `bottom: 0.75rem` matches the bottom corner labels' (`Shift` / `Replay`)
   padding so the square row sits on the same band — reads as one line
   with the component names. */
.history-strip {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 11;
  display: flex;
  align-items: center;
}
.strip-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 0.15rem;
  align-items: center;
}
.strip-steps li {
  padding: 0.1rem;
  outline: none;
  cursor: pointer;
}
.strip-steps li.empty {
  cursor: default;
}
/* Square step. No border-radius — discrete squares. Every square glows
   at all times.
     past    (behind current)  → beige 100%
     current (the actual image) → beige + pulsing glow
     future  (ahead, already selected after stepping back) → beige 50%
     empty   (not reached yet)  → component-name colour + warm title halo
   Classes recompute from historyIndex, so stepping forward/back
   reassigns past/future automatically. */
.strip-steps li .step {
  display: block;
  width: 5px;
  height: 5px;
  background: #595b54;
  transition: background 150ms ease-out, box-shadow 150ms ease-out, opacity 150ms ease-out;
  box-sizing: border-box;
}
/* behind current — full beige */
.strip-steps li.past .step {
  background: #f9ecd0;
  box-shadow:
    0 0 5px rgba(249, 236, 208, 0.9),
    0 0 12px rgba(249, 236, 208, 0.55),
    0 0 22px rgba(249, 236, 208, 0.3);
}
/* ahead of current but already selected — same beige, dimmed to 50% */
.strip-steps li.future .step {
  background: #f9ecd0;
  opacity: 0.5;
  box-shadow:
    0 0 5px rgba(249, 236, 208, 0.9),
    0 0 12px rgba(249, 236, 208, 0.55),
    0 0 22px rgba(249, 236, 208, 0.3);
}
/* the actual image: same beige, same size, pulsing glow */
.strip-steps li.current .step {
  background: #f9ecd0;
  animation: step-pulse 1.8s ease-in-out infinite;
}
/* waiting — not reached yet */
.strip-steps li.empty .step {
  background: #595b54;
  box-shadow:
    0 0 6px rgba(255, 252, 230, 0.9),
    0 0 16px rgba(255, 248, 220, 0.55),
    0 0 32px rgba(255, 244, 210, 0.3);
}
.strip-steps li:not(.empty):hover .step,
.strip-steps li:not(.empty):focus .step {
  background: #fff3da;
}

/* pulsing glow for the current image — a single small square, so the
   box-shadow animation is cheap (no per-char paint blow-up). */
@keyframes step-pulse {
  0%, 100% {
    box-shadow:
      0 0 5px rgba(249, 236, 208, 0.85),
      0 0 12px rgba(249, 236, 208, 0.5),
      0 0 22px rgba(249, 236, 208, 0.28);
  }
  50% {
    box-shadow:
      0 0 9px rgba(249, 236, 208, 1),
      0 0 22px rgba(249, 236, 208, 0.8),
      0 0 40px rgba(249, 236, 208, 0.5);
  }
}
</style>
