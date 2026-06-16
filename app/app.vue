<script setup lang="ts">
import { computed } from 'vue'
import { useInteractionStore } from '~/stores/interaction'
import { useViewStateStore } from '~/stores/viewState'
import { IMAGE_CREDIT_LINES } from '~/view3/view3Interpretations'
const store = useInteractionStore()
const viewState = useViewStateStore()
// The "Look at the second screen" caption visibility is owned by the store
// (interfaceDimCaptionVisible) — it's offset to appear AFTER the darkening
// starts (DIM_CAPTION_OFFSET_MS) and hides on brighten. See setInterfaceDim.

// ── Persistent "About" control (the single "i" + day/night dots) ──
// One control group lives here at the app root so it survives view transitions
// and stays for the whole experience. It first appears in VIEW_2 (ENTRY) and
// persists through VIEW_3 / VIEW_4 and the explore-others end phase. The "i"
// opens the global About/credits overlay (blurred field above the screen); the
// two dots toggle the project's day/night canvas background.
//
// It FADES OUT during the overview finale at the same beat as the corner labels
// (overviewFinalePhase 'rest' / 'transition' — the same condition that drives
// the views' `.finale-fadeout` corner-label fade), then fades back in once the
// finale settles (phase → 'idle', explore-others).
const aboutControlVisible = computed(() => {
  // Armed by VIEW_1's second sentence (store.aboutArmed) and latched on through
  // the rest of the experience — so the "i" appears at the same beat as VIEW_1's
  // first Skip button, not only from VIEW_2 onward.
  const inExperience =
    store.aboutArmed ||
    viewState.is('ENTRY') || viewState.is('TRANSITION') || viewState.is('RELATIONAL')
  const fadingForFinale =
    store.overviewFinalePhase === 'rest' || store.overviewFinalePhase === 'transition'
  return inExperience && !fadingForFinale
})

// About / credits overlay copy. IMAGE_CREDIT_LINES (view3Interpretations.ts)
// supplies the "Source of images" block so it stays the single source of truth.
const CREDITS_TITLE = 'Proxima'
const CREDITS_AUTHOR = 'by Antonin Ricou'
const CREDITS_CORPUS = 'This corpus gathers images from scientific and encyclopedic books published between the 18th and 20th centuries. Originally framed within a dominant Western system of knowledge, the images were later digitized, reorganized into a dataset, and published online via Flickr.'
const CREDITS_ABOUT: readonly string[] = [
  'Proxima is a dual-view system designed to explore large image corpus through alternative modes of exploration. It lets participants engage with images through new suggestions based on criteria, all driven by spatial proximity at once. Each journey produces a unique selection where meaning emerges from new relations rather than a fixed structure.',
  'By looking at how large visual databases are navigated, this interface suggests a different way of looking at images. Each image can have multiple neighbors at once and exist in different contexts simultaneously. Rather than being confined to a linear, origin-based structure, images can resonate, shift in meaning, and form new connections.',
  
]
const CREDITS_TYPOGRAPHY: readonly string[] = [
  'ABC Otto by ABC Dinamo',
  'Neue Kabel by Marc Schütz',
]
const CREDITS_ACKNOWLEDGMENT: readonly string[] = [
  '–HEAD Geneva', 'MA Media Design 2026',
  'Tutor : Nicolas Baldran',
]
const CREDITS_COPYRIGHT = '© 2026 Proxima. All rights reserved.'

// Names italicised wherever they appear in the credits body text. Ordered
// longest-first so the regex matches the full phrase before its prefix (e.g.
// "Internet Archive Book Images" before "Internet Archive"). Rendered via
// v-html — all inputs are static trusted constants.
const ITALIC_TERMS = ['Internet Archive Book Images', 'Internet Archives', 'Internet Archive', 'Flickr', 'Proxima']
const ITALIC_RE = new RegExp(
  `(${ITALIC_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'g',
)
function italicize(text: string): string {
  return text.replace(ITALIC_RE, '<i>$1</i>')
}

// Restart the whole experience — a clean reload re-boots at VIEW_0 (same effect
// as VIEW_4's "Start over"). Shown under the "i" while the About overlay is open.
function restartExperience() {
  window.location.reload()
}
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />

    <!-- Persistent "About" control — one group (day/night dot · "i" · day/night
         dot) that survives view transitions. Appears in VIEW_2 and stays the
         whole experience; fades out with the corner labels during the overview
         finale (aboutControlVisible). The "i" opens the blurred About overlay;
         the dots toggle the project's day/night canvas background. -->
    <div
      class="about-controls"
      :class="{ hidden: !aboutControlVisible }"
      :aria-hidden="!aboutControlVisible"
    >
      <button
        class="bg-toggle"
        :class="{ active: store.canvasBackground === 'gradient', revealed: store.creditsOpen }"
        :aria-pressed="store.canvasBackground === 'gradient'"
        aria-label="day background"
        @click="store.setCanvasBackground('gradient')"
      >
        <span class="dot dot-white" aria-hidden="true" />
      </button>
      <button
        class="interpret-control"
        :class="{ active: store.creditsOpen }"
        :aria-pressed="store.creditsOpen"
        aria-label="about this project"
        @click="store.toggleCredits()"
      >
        i
      </button>
      <button
        class="bg-toggle"
        :class="{ active: store.canvasBackground === 'black', revealed: store.creditsOpen }"
        :aria-pressed="store.canvasBackground === 'black'"
        aria-label="night background"
        @click="store.setCanvasBackground('black')"
      >
        <span class="dot dot-black" aria-hidden="true" />
      </button>
    </div>

    <!-- "Restart" — appears under the "i" while the About overlay is open;
         reloads the experience from VIEW_0 (same effect as VIEW_4's Start over). -->
    <button
      v-if="store.creditsOpen"
      class="restart-control"
      type="button"
      aria-label="restart the experience"
      @click="restartExperience"
    >Restart</button>

    <!-- About / credits overlay — a blurred field above the whole screen. Click
         anywhere closes it. Opened by the "i" above. -->
    <Transition name="credits-fade">
      <div v-if="store.creditsOpen" class="credits-panel" @click="store.toggleCredits()">
        <div class="credits-content">
          <header class="credits-head">
            <h1 class="credits-title">{{ CREDITS_TITLE }}</h1>
            <p class="credits-author">{{ CREDITS_AUTHOR }}</p>
          </header>

          <section class="credits-section">
            <p class="credits-label">About</p>
            <p v-for="(para, i) in CREDITS_ABOUT" :key="i" class="credits-para" v-html="italicize(para)" />
          </section>

          <section class="credits-section">
            <p class="credits-label">Corpus in use</p>
            <p class="credits-para credits-source" v-html="italicize(CREDITS_CORPUS)" />
          </section>

          <section class="credits-section">
            <p class="credits-label">Images source</p>
            <p
              v-for="(line, i) in IMAGE_CREDIT_LINES"
              :key="i"
              class="credits-para credits-source"
              :class="{ 'credits-url': i === IMAGE_CREDIT_LINES.length - 1 }"
              v-html="italicize(line)"
            />
          </section>

          <section class="credits-section">
            <p class="credits-label">Typography in use</p>
            <p v-for="(line, i) in CREDITS_TYPOGRAPHY" :key="i" class="credits-para credits-source">{{ line }}</p>
          </section>

          <section class="credits-section">
            <p class="credits-label">Acknowledgment</p>
            <p v-for="(line, i) in CREDITS_ACKNOWLEDGMENT" :key="i" class="credits-para credits-source">{{ line }}</p>
          </section>

          <p class="credits-copyright" v-html="italicize(CREDITS_COPYRIGHT)" />
        </div>
      </div>
    </Transition>

    <!-- Interface luminosity dimmer — a full-screen black overlay above the
         whole UI. opacity = store.interfaceDimLevel (0 = full brightness, 1 =
         fully dark); fade time = store.interfaceDimDuration (the store derives
         it from the opacity delta → constant fade SPEED). Driven by
         store.setInterfaceDim(level). pointer-events: none so it never blocks
         interaction. -->
    <div
      class="dim-overlay"
      :style="{
        opacity: store.interfaceDimLevel,
        transition: `opacity ${store.interfaceDimDuration}ms linear`,
      }"
      aria-hidden="true"
    />
    <!-- Centred "Look at the projection above" rotate caption — sits ABOVE the dim
         overlay and fades in/out with the darkening (every time the interface
         dims, e.g. VIEW_2 project narration + VIEW_3 mirror caption). Opacity
         tracks the dim with the same fade SPEED. -->
    <p
      class="dim-caption"
      :class="{ visible: store.interfaceDimCaptionVisible }"
      :style="{ transition: `opacity ${store.interfaceDimDuration}ms linear` }"
      aria-hidden="true"
    >Look at the projection above</p>
  </div>
</template>

<style>
/* Interface luminosity dimmer — full-screen black overlay above the whole UI.
   opacity + transition are bound inline from the store; this rule owns the
   static layout. z-index sits above every view-level surface (top-controls,
   credits-panel, ribbons … all < 100). */
.dim-overlay {
  position: fixed;
  inset: 0;
  background: #000;
  opacity: 0;
  pointer-events: none;
  z-index: 9999;
}

/* "Look at the other screen" — centred rotate caption above the dim overlay
   (z above 9999). Same rotate-caption look as the views' `.caption-text`:
   --rotate-fill glyphs + the layered --rotate-stroke glow, --rotate-size,
   italic. Opacity is toggled by `.visible` (bound to store.interfaceDimCaptionVisible,
   which appears DIM_CAPTION_OFFSET_MS after the darkening starts) and the inline
   transition matches the dim's fade speed. */
.dim-caption {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  z-index: 10000;
  font-family: 'ABC Otto', serif;
  font-style: italic;
  font-weight: 500;
  font-size: var(--rotate-size);
  line-height: var(--rotate-line-height);
  letter-spacing: 0.015em;
  text-align: center;
  white-space: nowrap;
  color: var(--rotate-fill);
  text-shadow:
    0 0 4px var(--rotate-stroke),
    0 0 6px var(--rotate-stroke),
    0 0 6px var(--rotate-stroke),
    0 0 9px var(--rotate-stroke),
    0 0 9px var(--rotate-stroke),
    0 0 12px var(--rotate-stroke),
    0 0 12px var(--rotate-stroke),
    0 0 15px var(--rotate-stroke),
    0 0 18px var(--rotate-stroke);
  opacity: 0;
  pointer-events: none;
}
.dim-caption.visible {
  opacity: 1;
}

/* ── Persistent "About" control (day/night dot · "i" · day/night dot) ──
   3-column grid spanning the viewport: the dots hug the centre in the 1fr
   columns, the "i" sits in the auto middle column (viewport centre). z ABOVE
   the dim overlay (9999) so the "i" stays lit + clickable while the interface
   darkens for narration; above every view surface and the credits overlay. */
.about-controls {
  position: fixed;
  top: 0.22rem;
  left: 0;
  right: 0;
  /* Above the dim overlay (9999) and the credits overlay (z 130) so the "i" and
     the day/night dots stay on top and clickable through the darkening. */
  z-index: 10001;
  pointer-events: none;   /* container ignores clicks; buttons opt back in */
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
  opacity: 1;
  /* Fades with the corner labels during the overview finale (700ms). */
  transition: opacity 700ms var(--rotate-fade-easing, ease);
}
.about-controls.hidden {
  opacity: 0;
  pointer-events: none;
}
.about-controls > .bg-toggle:first-of-type { justify-self: end; }
.about-controls > .bg-toggle:last-of-type  { justify-self: start; }

/* Day/night background toggles — oval-icon buttons (the coloured oval itself is
   the affordance). HIDDEN by default; revealed only while the "i" is open (the
   credits overlay), keeping their layout slot (opacity) so the "i" stays centred. */
.about-controls .bg-toggle {
  pointer-events: none;
  background: transparent;
  border: none;
  padding: 0;
  width: 1.8rem;
  height: 1.8rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: var(--cursor-pointer);
  opacity: 0;
  transition: opacity 240ms ease-out;
}
.about-controls .bg-toggle.revealed {
  opacity: 1;
  pointer-events: auto;
}
/* Oval (ellipse), not a square. Each oval is a little swatch of its canvas
   state's gradient (the base linear-gradient of .bg-gradient / .bg-black). The
   non-active oval is clearly dimmed; the active one is full opacity — that's the
   only selected-state change (no stroke, no fill recolour). */
.about-controls .bg-toggle .dot {
  width: 16px;
  height: 11px;
  border-radius: 50%;
  display: block;
  opacity: 0.4;
  transition: transform 150ms ease-out, opacity 150ms ease-out, box-shadow 200ms ease-out;
}
/* Night oval = the .bg-black base gradient; day oval = the .bg-gradient base. */
.about-controls .bg-toggle .dot-black {
  background: linear-gradient(170deg, #1f2538 0%, #252a3a 35%, #363438 60%, #1c2030 85%, #14182a 100%);
}
.about-controls .bg-toggle .dot-white {
  background: linear-gradient(170deg, #9aa6b0 0%, #a8a8a4 35%, #b0a896 60%, #8e96a0 85%, #6f7884 100%);
}
.about-controls .bg-toggle:hover .dot {
  transform: scale(1.15);
}
/* Active oval carries a layered blue glow halo (like the rotate text, but an
   explicit blue so it reads blueish rather than the greyish --rotate-stroke
   which stacks to near-white), as a box-shadow scaled to the oval size. */
.about-controls .bg-toggle.active .dot {
  opacity: 1;
  box-shadow:
    0 0 4px rgba(160, 175, 195, 0.9),
    0 0 6px rgba(160, 175, 195, 0.85),
    0 0 9px rgba(156, 170, 190, 0.78),
    0 0 12px rgba(156, 170, 190, 0.7),
    0 0 16px rgba(152, 166, 186, 0.62),
    0 0 20px rgba(152, 166, 186, 0.54),
    0 0 26px rgba(150, 164, 184, 0.45),
    0 0 34px rgba(150, 164, 184, 0.36);
}

/* "i" info control — an "i" enclosed in an oval ring (the ring lives on a
   pseudo-element nudged up 1px so it sits centred on the glyph). Neue Kabel,
   muted grey at 50% lifting to full on hover (matches the SkipButton look). */
.about-controls .interpret-control {
  pointer-events: auto;
  position: relative;
  top: 0;
  width: 1.6rem;
  height: 1.10rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  font-family: 'Neue Kabel', sans-serif;
  font-weight: 500;
  font-size: 1.05rem;
  line-height: 1;
  letter-spacing: 0;
  text-transform: none;
  /* REVERSED from the rotate text: blueish FILL + dark-grey GLOW (same two
     colours as the rotate stroke/fill, swapped). */
  color: rgb(175, 180, 188);
  text-shadow:
    0 0 4px rgba(89, 91, 85, 0.95),
    0 0 6px rgba(89, 91, 85, 0.9),
    0 0 9px rgba(89, 91, 85, 0.75),
    0 0 13px rgba(89, 91, 85, 0.55);
  opacity: 0.65;
  cursor: var(--cursor-pointer);
  transition: opacity 150ms ease;
}
.about-controls .interpret-control::before {
  content: '';
  position: absolute;
  inset: 0;
  top: -3px;
  /* Blueish ring with a dark-grey glow to match the reversed glyph. */
  border: 2px solid rgb(175, 180, 188);
  border-radius: 50%;
  box-shadow:
    0 0 5px rgba(89, 91, 85, 0.85),
    0 0 9px rgba(89, 91, 85, 0.6);
  pointer-events: none;
}
.about-controls .interpret-control:hover { opacity: 1; }
.about-controls .interpret-control.active { opacity: 1; }

/* "Restart" — centred just under the "i", above the About overlay (z 140 > the
   credits panel's 130) so it stays clickable. Same blue-grey fill + dark glow as
   the "i" / Skip controls. */
.restart-control {
  position: fixed;
  top: 2.6rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 140;
  background: transparent;
  border: none;
  padding: 0.3rem 0.6rem;
  font-family: 'Neue Kabel', sans-serif;
  font-weight: 500;
  font-size: 1.05rem;
  letter-spacing: 0.015em;
  line-height: 1;
  color: rgb(175, 180, 188);
  text-shadow:
    0 0 4px rgba(89, 91, 85, 0.95),
    0 0 6px rgba(89, 91, 85, 0.9),
    0 0 9px rgba(89, 91, 85, 0.75),
    0 0 13px rgba(89, 91, 85, 0.55);
  opacity: 0.65;
  cursor: var(--cursor-pointer);
  transition: opacity 150ms ease;
}
.restart-control:hover { opacity: 1; }

/* About / credits overlay — pure blurred field above the whole screen. Content
   top-anchored, sized to fit the window (no scroll). Click anywhere closes. */
.credits-panel {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: transparent;
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
}
.credits-content {
  max-width: min(50em, 92vw);
  max-height: 100vh;
  /* Pushed down a bit (more top padding) so the block sits lower in the view. */
  padding: 8vh 1rem 3vh;
  text-align: center;
  color: #595b54;
  /* Same blue-grey glyph backing as the rotate captions (the layered
     --rotate-stroke text-shadow). text-shadow is inherited, so declaring it on
     the content wrapper gives every line — title, labels, paragraphs — the same
     soft halo behind the text. */
  text-shadow:
    0 0 4px var(--rotate-stroke),
    0 0 6px var(--rotate-stroke),
    0 0 6px var(--rotate-stroke),
    0 0 9px var(--rotate-stroke),
    0 0 9px var(--rotate-stroke),
    0 0 12px var(--rotate-stroke),
    0 0 12px var(--rotate-stroke),
    0 0 15px var(--rotate-stroke),
    0 0 18px var(--rotate-stroke);
}
.credits-head { margin-bottom: 2vh; }
.credits-title {
  margin: 0;
  font-family: 'ABC Otto', serif;
  font-weight: 500;
  font-style: italic;
  font-size: 4.4rem;
  letter-spacing: 0.005em;
  line-height: 1.05;
}
/* Reversed scheme for the Neue Kabel credit texts (author, section labels,
   copyright): blueish FILL + dark-grey GLOW — the opposite of the ABC Otto
   body, which keeps the dark fill + blueish glow inherited from .credits-content.
   Same two colours as the rotate text, swapped (matches the Skip / "i" buttons). */
.credits-author,
.credits-label,
.credits-copyright {
  color: rgb(175, 180, 188);
  text-shadow:
    0 0 4px rgba(89, 91, 85, 0.95),
    0 0 6px rgba(89, 91, 85, 0.9),
    0 0 9px rgba(89, 91, 85, 0.75),
    0 0 13px rgba(89, 91, 85, 0.55);
}
.credits-author {
  margin: 0.1rem 0 0;
  font-family: 'Neue Kabel', sans-serif;
  font-size: 1.05rem;
  opacity: 0.85;
}
.credits-section { margin-bottom: 4vh; }
.credits-section:last-child { margin-bottom: 0; }
.credits-label {
  margin: 0 0 0.02rem;
  font-family: 'Neue Kabel', sans-serif;
  font-weight: 500;
  font-size: 1.05rem;
  letter-spacing: 0.04em;
  opacity: 0.7;
}
.credits-para {
  margin: 0 auto 1.4rem;
  max-width: 46em;
  font-size: 1.3rem;
  line-height: 1.05;
  text-wrap: pretty;
}
.credits-para:last-child { margin-bottom: 0; }
.credits-source {
  margin-bottom: 0.15rem;
  font-size: 1.3rem;
  line-height: 1.05;
  opacity: 0.9;
}
.credits-url { opacity: 0.7; word-break: break-all; }

/* Copyright pinned to the very bottom of the viewport — same anchor as the
   SkipButton (bottom: 0, centred, same vertical padding). */
.credits-copyright {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0.75rem 0.95rem;
  font-family: 'Neue Kabel', sans-serif;
  font-size: 1.05rem;
  letter-spacing: 0.015em;
  opacity: 0.55;
}

/* Fade the blurred About overlay in/out. */
.credits-fade-enter-active,
.credits-fade-leave-active { transition: opacity 240ms ease; }
.credits-fade-enter-from,
.credits-fade-leave-to { opacity: 0; }

@font-face {
  font-family: 'ABC Otto';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/ABC%20Otto/ABCOtto-Regular-Trial.woff2') format('woff2'),
       url('/fonts/ABC%20Otto/ABCOtto-Regular-Trial.woff') format('woff');
}
@font-face {
  font-family: 'ABC Otto';
  font-style: italic;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/ABC%20Otto/ABCOtto-MediumItalic-Trial.woff2') format('woff2'),
       url('/fonts/ABC%20Otto/ABCOtto-MediumItalic-Trial.woff') format('woff');
}
@font-face {
  font-family: 'ABC Otto';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/ABC%20Otto/ABCOtto-Medium-Trial.woff2') format('woff2'),
       url('/fonts/ABC%20Otto/ABCOtto-Medium-Trial.woff') format('woff');
}
@font-face {
  font-family: 'Neue Kabel';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/Neue%20Kabel/NeueKabel-Medium.otf') format('opentype');
}
@font-face {
  font-family: 'Neue Kabel';
  font-style: italic;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/Neue%20Kabel/NeueKabel-MediumItalic.otf') format('opentype');
}

/* Global reset — unscoped so the rules apply to the real <html>/<body>.
   Without this the browser's default 8px body margin pushes the viewport-
   sized pages (100vw × 100vh) past the viewport, producing a small scroll
   in both axes. overflow: hidden on body prevents any inner element from
   reintroducing scroll at the document level. */
:root {
  /* ── Custom interface cursors ──
     SAME glyph for both — the ↖ U+2196 arrow drawn as ABC Otto's ACTUAL glyph
     outline (the font's vector path embedded directly; a web font can't render
     inside a CSS data-URI cursor, so the outline is baked in). Dark blue-grey
     glyph throughout; only the GLOW colour changes: passive (default) = bluish,
     clickable (pointer) = warm beige (rgb(249,236,208), the system glow colour).
     The glow hugs the arrow's silhouette — built from layered expanding strokes
     of the same path (round joins, fading outward), NOT a radial circle and NOT
     an SVG filter (filters don't render inside data-URI cursors). The hotspot
     sits at the arrow TIP (top-left, 8 8). Used as `cursor: var(--cursor-default)` on the app root and
     `cursor: var(--cursor-pointer)` on every clickable selector. The VIEW_4
     quadrant keeps its own → arrow (it sets cursor:none over the quadrant, so
     these never show there). If a data-URI ever fails to parse, the trailing
     keyword (default / pointer) is the safe fallback.
     KEEP IN LOCKSTEP with DIPLOME.Feedback/src/style.css (the VIEW_2 embed). */
  --cursor-default: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='32'%20height='32'%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(160,180,214)'%20stroke-opacity='0.14'%20stroke-width='380'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(160,180,214)'%20stroke-opacity='0.2'%20stroke-width='300'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(160,180,214)'%20stroke-opacity='0.28'%20stroke-width='230'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(160,180,214)'%20stroke-opacity='0.4'%20stroke-width='165'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(160,180,214)'%20stroke-opacity='0.58'%20stroke-width='110'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(160,180,214)'%20stroke-opacity='0.8'%20stroke-width='60'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='rgb(89,91,85)'/%3E%3C/svg%3E") 8 8, default;
  --cursor-pointer: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='32'%20height='32'%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(249,236,208)'%20stroke-opacity='0.14'%20stroke-width='380'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(249,236,208)'%20stroke-opacity='0.2'%20stroke-width='300'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(249,236,208)'%20stroke-opacity='0.28'%20stroke-width='230'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(249,236,208)'%20stroke-opacity='0.4'%20stroke-width='165'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(249,236,208)'%20stroke-opacity='0.58'%20stroke-width='110'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='none'%20stroke='rgb(249,236,208)'%20stroke-opacity='0.8'%20stroke-width='60'%20stroke-linejoin='round'%20stroke-linecap='round'/%3E%3Cpath%20transform='translate(8%208)%20scale(0.0128%20-0.0128)%20translate(-140%20-964)'%20d='M845%20911C833%20923%20816%20931%20796%20933L200%20982C175%20983%20156%20979%20140%20964C123%20947%20119%20927%20123%20905L181%20312C183%20293%20189%20278%20201%20266C219%20249%20246%20248%20261%20263C272%20274%20279%20292%20290%20316L422%20601L876%2068C953%20-31%201036%20-24%201083%2022C1137%2076%201132%20148%201038%20229L504%20684L794%20822C817%20833%20835%20840%20847%20852C862%20867%20863%20893%20845%20911Z'%20fill='rgb(89,91,85)'/%3E%3C/svg%3E") 8 8, pointer;

  /* Single source of truth for the "label tier" font-size — corner labels
     and the per-quadrant title texts (.proximity-panel-title here,
     .canvas-text-title in project) must all share this size. Style (weight,
     italic, letter-spacing) is independent — only size is locked. Edit here
     AND in project/src/style.css's :root in lockstep.
     NOTE: the rotating intro captions (.caption / .entry-caption /
     .intro-caption) used to share this size, but were DECOUPLED — they now
     use --rotate-size (below) so they can be sized + panelled independently
     of the corner labels/titles.
     Raised 1.15rem → 1.3rem so the interface corner labels match the quadrant
     text size (.proximity-panel-title/-body, hardcoded 1.3rem). The only
     interface consumer of --label-size now is `.corner-label`. */
  --label-size: 1.3rem;

  /* Rotating intro caption presentation — single source of truth for the
     centred, panelled rotating text in VIEW_1 (.caption), VIEW_2
     (.entry-caption), and VIEW_3 (.intro-caption). Interface size is 1.7rem;
     the project-side mirror (#center-caption.rotate) is intentionally larger
     (2× --label-size) — the user preferred the bigger size on the feedback
     screen. Stays its OWN var so it can be retuned without touching the
     corner labels / titles.
     The backing is a light blue-grey at 90% opacity that traces the text
     glyphs themselves — a soft organic "stroke" hugging the letterforms via a
     layered `text-shadow` on the inner `.caption-text` span (NOT a rectangle
     behind the line). */
  --rotate-size: 1.77rem;
  /* Shared line-height for all rotating intro/finale captions (VIEW_1/2/3/4).
     Tightened from the old per-view 1.4–1.5 (then 1.2) so multi-line captions
     sit closer. */
  --rotate-line-height: 1.05;
  /* Warm beige stroke behind rotate text + quadrant text + centre caption
     (replaces the former blue-grey). Deepened from f9ecd0 — at glow/stroke
     sizes the pale cream washed out to near-white, so a more saturated tan is
     used to actually read as beige. Keep in lockstep with project/src/style.css. */
  /* The shared glyph "background effect" (layered text-shadow stroke) for EVERY
     text type — corner labels, rotate captions, quadrant panel text, bridge
     tags. Greyish with a small blue lean (was blue, before that beige).
     Mirrors project/src/style.css. */
  --rotate-panel-bg: rgba(175, 180, 188, 0.96);

  /* Text glyph fill + stroke. Fill = #595b55 (dark) on every text type;
     stroke = the shared --rotate-panel-bg above. (VIEW_4 corner-label hover
     colour overrides the fill per-quadrant via .rel:hover — kept.) */
  --rotate-fill: #595b55;                  /* dark fill */
  --rotate-stroke: var(--rotate-panel-bg); /* same greyish stroke as everything else */

  /* Project-wide blue-gray text halo. Two-tier composition: 3 tight
     overlapping layers at full alpha build a solid muted blue-gray core
     around each glyph; 2 wider feathered layers add the soft luminous
     rim. Applied via `body { text-shadow: var(--halo) }` below and
     inherited by every text node — selectors that need a different
     effect (.corner-label warm pulse, View0 .caption Proxima inset
     stack, View0 .hint elaborate halo) just declare their own
     text-shadow which overrides the inherited value. Edit here AND in
     project/src/style.css's :root in lockstep. */
  /* Rotating-text transition parameters — single source of truth for
     View1Explanation's `.caption` and View3Transition's `.intro-caption`.
     Both views reference these vars in their .caption-* and .intro-*
     transition classes; changing one value here propagates to both.
     Keep the JS-side FADE_OUT_MS constant in each view's <script setup>
     in sync with --rotate-fade-ms (currently 400ms), since that
     setTimeout drives when the next view advance fires. Used for BOTH the
     fade-in and fade-out of every rotating caption (all three views want
     400ms each), and mirrored in project/src/style.css's :root. */
  --rotate-fade-ms: 400ms;
  --rotate-fade-easing: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --rotate-appear-delay: 1400ms;
  --rotate-empty-beat: 200ms;

  --halo:
    0 0 2px  rgba(150, 170, 200, 1),
    0 0 5px  rgba(150, 170, 200, 1),
    0 0 9px  rgba(150, 170, 200, 1),
    0 0 18px rgba(180, 210, 250, 0.55);
}

html,
body,
#__nuxt {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* Body painted with the same day gradient as VIEW-1 / VIEW-2 / VIEW-3 so
   that during cross-fade transitions (where both views are at partial
   opacity and the body shows through ~25%) there is no other color
   leaking onto the screen. Without this, the browser's default white
   body background flashes between views as a "cut". */
body {
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

body {
  /* Project-wide halo, inherited by all text nodes. Selectors that need
     a custom shadow (`.corner-label` warm pulse, View0 `.caption` Proxima
     inset stack, View0 `.hint` elaborate halo) just declare their own
     text-shadow which overrides the inherited value. See :root --halo
     above. */
  /* TEMP DISABLED — uncomment to re-enable the project-wide blue-gray
     halo. Commented out so transition timing can be tested without the
     paint cost of N text elements each running a 4-layer shadow. */
  /* text-shadow: var(--halo); */
}

html {
  font-family: 'ABC Otto', serif;
  /* Never show the text (I-beam) cursor over text. `cursor` is inherited, so
     this gives every element the dot by default everywhere. */
  cursor: var(--cursor-default);
}

/* Consistency net — EVERY interactive element shows the custom CROSS cursor, so
   the dot (default, inherited above) / cross (interactive) pair reads identically
   across all views. Without this, a clickable that forgot to opt in would fall
   back to the inherited dot, and one using the native `pointer` would show the OS
   cursor — the per-view shape differences. Unscoped so it reaches every view +
   component. Higher-specificity rules can still override (e.g. the VIEW_4 arrow's
   `cursor: none` over the suggestion cells). */
a,
button,
[role='button'],
[tabindex='0'] {
  cursor: var(--cursor-pointer);
}

/* ── Atmospheric backdrop classes ──
   Shared canvas-background modes — same multi-radial gradient stacks as
   project's `body[data-canvas-bg="..."]` in project/src/style.css.
   Defined globally (unscoped) so VIEW-1, VIEW-2, and VIEW-3 can each apply
   the class to their root and share the same gradient — no per-view
   duplication. If project's gradient values change, update them here once. */
.bg-black {
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
  /* Same as .bg-gradient: no `fixed` so the View_4 black backdrop doesn't flash
     when the view cross-fades. */
  background-size: 100vw 100vh;
  background-position: 0 0;
}
/* ── Corner labels ──
   Shared "SOURCE / FORM / SEMANTIC / TIME" tags placed in the four
   outer corners. Used by VIEW_3 (the post-disperse transition) and
   VIEW_4 (the relational grid, via `RelationComponent.quarter-tag`'s
   replacement). Pixel-positioned identically in both views so the
   labels stay put across the VIEW_3 → VIEW_4 swap. Defined globally
   (unscoped) so the styling lives in one place; opacity / visibility
   gating is component-specific (VIEW_3 fades them in alongside the
   caption; VIEW_4 shows them from mount). */
.corner-label {
  position: absolute;
  font-weight: 500;
  font-style: italic;
  font-size: var(--label-size);
  letter-spacing: 0.015em;
  color: #595b54;
  padding: 0.75rem 0.95rem;
  pointer-events: none;
  /* The glyph stroke (text-shadow) transitions on quadrant hover — the halo
     takes the component colour while the word fill stays #595b55. See
     RelationComponent .rel:hover. */
  transition: text-shadow 220ms ease-out;
  /* Layered glyph glow — coloured per quadrant via `--corner-glow` (set on the
     `[data-position]` rules below: Source orange / Form blue / Semantic green /
     Time pink), falling back to the neutral blue-grey stroke. */
  text-shadow:
    0 0 4px var(--corner-glow, var(--rotate-panel-bg)),
    0 0 6px var(--corner-glow, var(--rotate-panel-bg)),
    0 0 6px var(--corner-glow, var(--rotate-panel-bg)),
    0 0 9px var(--corner-glow, var(--rotate-panel-bg)),
    0 0 9px var(--corner-glow, var(--rotate-panel-bg)),
    0 0 12px var(--corner-glow, var(--rotate-panel-bg)),
    0 0 12px var(--corner-glow, var(--rotate-panel-bg)),
    0 0 15px var(--corner-glow, var(--rotate-panel-bg)),
    0 0 18px var(--corner-glow, var(--rotate-panel-bg));
}
.corner-label[data-position="tl"] { top: 0; left: 0; }
.corner-label[data-position="tr"] { top: 0; right: 0; }
.corner-label[data-position="bl"] { bottom: 0; left: 0; }
.corner-label[data-position="br"] { bottom: 0; right: 0; }
/* Corner labels glow blue-grey by default (the --corner-glow fallback) and turn
   their quadrant colour only WHILE that quadrant is hovered — driven per
   RelationComponent by `.rel:hover .corner-label` (see RelationComponent.vue). */

/* ── Proximity panel ──
   Shared typography for the per-quadrant text block (VIEW_3's
   `.quadrant-text` once a cross is clicked, and VIEW_4's
   `.interpretation-panel` when interpretation mode is active). Same
   look in both places so the swap reads as continuous.
   Title + body live inside, both inheriting the dark unified type
   colour. Positioning + visibility gating stay component-specific
   (the wrapper just supplies typography). */
.proximity-panel {
  /* Definite width (not max-width) so the box renders at the same size in
     every consumer regardless of its anchor position. With max-width the box
     was shrink-to-fit, and because each panel is anchored with `left`/`top`
     and no `right`, the available width — and therefore the line wrapping —
     differed by quadrant (right-side / quadrant-clipped panels got squeezed
     onto more lines). A fixed width + the existing translate(-50%, -50%)
     centring makes VIEW_3's quadrant-text and VIEW_4's interpretation-panel
     pixel-identical and keeps the body on two lines. Single knob: nudge this
     value if a longer body spills to three lines. Widened from 30em when
     the body grew to --label-size (Otto Medium) so it still wraps to ~2
     lines. NOTE: interface narrowed to 26em so the body breaks onto two
     better-balanced lines — this now DIVERGES from project's `.canvas-text`
     width (kept wider on the canvas), no longer in lockstep. Scaled 26→29em
     in step with the 1.3rem text bump so the two-line balance is unchanged. */
  width: 29em;
  padding: 0 1rem;
  text-align: center;
  color: #595b54;
  pointer-events: none;
  box-sizing: border-box;
  /* Layered glyph stroke — coloured per quadrant via `--panel-glow` (set on the
     `[data-component]` rules below), else the neutral blue-grey. Inherited, so
     it covers BOTH the title and the body. Mirrored on project's `.canvas-text`. */
  text-shadow:
    0 0 4px var(--panel-glow, var(--rotate-panel-bg)),
    0 0 6px var(--panel-glow, var(--rotate-panel-bg)),
    0 0 6px var(--panel-glow, var(--rotate-panel-bg)),
    0 0 9px var(--panel-glow, var(--rotate-panel-bg)),
    0 0 9px var(--panel-glow, var(--rotate-panel-bg)),
    0 0 12px var(--panel-glow, var(--rotate-panel-bg)),
    0 0 12px var(--panel-glow, var(--rotate-panel-bg)),
    0 0 15px var(--panel-glow, var(--rotate-panel-bg)),
    0 0 18px var(--panel-glow, var(--rotate-panel-bg));
}
/* Per-quadrant glyph glow for the interpretation text — same palette as the
   corner labels (Source orange / Form blue / Semantic green / Time pink). */
.proximity-panel[data-component="component_1"] { --panel-glow: #f0a05c; }
.proximity-panel[data-component="component_2"] { --panel-glow: #6cb4e6; }
.proximity-panel[data-component="component_3"] { --panel-glow: #74cf92; }
.proximity-panel[data-component="component_4"] { --panel-glow: #ef82ac; }
/* Semantic (component_3) body is the longest — give it a slightly wider box
   so it still balances onto two lines. Interface-only (project canvas-text
   unaffected); attribute selector outranks the base `.proximity-panel` width. */
.proximity-panel[data-component="component_3"] {
  width: 33em;
}
.proximity-panel-title {
  margin: 0 0 0.4rem;
  /* Mirrors `.corner-label` typography (same family via inheritance, same
     weight 500, same italic, same size + tracking) so the panel title and
     the four corner labels read as the same typographic tier. See
     [[feedback-label-size-sync]] memory for the contract.
     NOTE: bumped to 1.3rem (interface quadrant text only) so the block reads
     slightly bigger — this DECOUPLES the quadrant title from the corner-label
     `--label-size` tier. Keep in sync with `.proximity-panel-body` below; the
     `em` box widths scale with it so the two-line balance is preserved. */
  font-size: 1.3rem;
  font-weight: 500;
  font-style: italic;
  letter-spacing: 0.015em;
  line-height: 1.2;
}
.proximity-panel-body {
  margin: 0;
  /* ABC Otto Regular (upright), sized to match the tier-2 title
     (--label-size). Mirrors `.canvas-text-body` in project/src/style.css —
     keep family/size/weight/line-height in lockstep. */
  font-family: 'ABC Otto', serif;
  /* 1.3rem — interface quadrant body only (project `.canvas-text-body` keeps
     --label-size). Kept in sync with `.proximity-panel-title`. */
  font-size: 1.3rem;
  font-weight: 400;
  font-style: normal;
  line-height: 1.0;
}

.bg-gradient {
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
  /* NOT `background-attachment: fixed`: views paint this and cross-fade via
     opacity, and a fixed background on an opacity (composited) layer
     re-rasterises against the layer box and repaints — the flash on each view
     advance (VIEW_1→2, VIEW_3→4). Sized 100vw×100vh at 0 0, it renders
     identically without `fixed`. The stable `body` backdrop keeps `fixed`. */
  background-size: 100vw 100vh;
  background-position: 0 0;
}
</style>

