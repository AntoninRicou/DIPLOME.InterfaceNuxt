<script setup lang="ts">
import { ref } from 'vue'
import { useViewStateStore } from '~/stores/viewState'
import LiquidGlass from '~/components/LiquidGlass.vue'

const viewState = useViewStateStore()

// Smooth exit toward VIEW_1: clicking the section sets fadingOut=true,
// which triggers the matching 700ms cubic-bezier fade-out on both the
// title and the subtitle (see .view-0.fading-out rules in the
// stylesheet). After FADE_OUT_MS the view advance is called so the
// view-level cross-fade only begins once the text is fully gone —
// same uniform timing as View1's caption transitions.
const FADE_OUT_MS = 500
const fadingOut = ref(false)

function handleClick() {
  if (fadingOut.value) return
  fadingOut.value = true
  setTimeout(() => viewState.advance(), FADE_OUT_MS)
}
</script>

<template>
  <section
    class="view-0 bg-gradient"
    :class="{ 'fading-out': fadingOut }"
  >
    <!-- The centred title is the ONLY click target now (the full-window click +
         "Click to launch" prompt were removed). Clicking anywhere on this group
         advances to VIEW_1. -->
    <div class="title-group" role="button" tabindex="0" @click="handleClick" @keydown.enter="handleClick" @keydown.space.prevent="handleClick">
      <!-- #2 — 3D-extruded relief, WITHOUT the glass (capsule/blob removed) —
           pure text relief, above the current title for comparison. -->
      <p class="caption caption-3d title-glass">Proxima</p>

      <!-- Version A — current SVG-shape system: glass clipped to the font-derived
           blob mask (proxima_shadow_mask.svg). -->
      <LiquidGlass
        class="title-glass"
        shape="/image/proxima_shadow_mask.svg"
        :blur="7"
        :refraction="14"
        pad-x="1.3rem"
        pad-y="1rem"
      >
        <p class="caption caption-fill">Proxima</p>
      </LiquidGlass>

      <!-- #3 — high-quality CURVED capsule glass: pure-CSS capsule (border-radius)
           with rim lighting + specular sweep + depth. No SVG/mask, and refraction
           off (no experimental url() backdrop interaction) for cross-browser
           stability. Blur 10 / saturate 1.2. -->
      <LiquidGlass
        class="title-glass"
        radius="999px"
        :blur="7"
        :saturate="1.2"
        :refraction="0"
        pad-x="3.4rem"
        pad-y="1.8rem"
        tint="transparent"
      >
        <p class="caption caption-hollow">Proxima</p>
      </LiquidGlass>
    </div>

    <!-- Transparent "type curved in glass" (masked backdrop-filter on the
         letterforms). Disabled for now — remove `v-if="false"` to bring back. -->
    <div v-if="false" class="title-shape-glass" role="img" aria-label="Proxima">
      <svg class="lens-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <filter
            id="shape-refract"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            color-interpolation-filters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.01 0.016"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="16"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div class="title-shape-field" aria-hidden="true" />
      <div class="title-shape-sheen" aria-hidden="true" />
    </div>

    <p class="hint">No image belongs to one place</p>
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
  color: #595b54;
  z-index: 100;
  /* TEMP DEBUG (commented): uncomment to swap the gradient for solid
     black — useful when tuning the subtitle halo against a known
     dark backdrop. `.bg-gradient` is still on the section element,
     so re-enabling/disabling this line snaps between gradient and
     black without touching the template. */
  /* background: #000 !important; */
}

/* The centred title group — the only click target (advances to VIEW_1).
   Replicates the section's column layout + 1.5rem gap so the stacked title
   variants keep their spacing, and carries the pointer cursor (previously on
   the whole section). */
.title-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  cursor: pointer;
  z-index: 1;
}

/* Zero-footprint host for the shape's SVG refraction filter. */
.lens-defs {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
}
/* Capsule title sits above the test image. */
.title-glass {
  position: relative;
  z-index: 1;
}
/* The title text — passed into <LiquidGlass> as its slot, sharp above the
   glass. Light blueish glass type with a soft darker-blue relief for legibility. */
.caption {
  position: relative;
  z-index: 1;
  font-size: 11rem;
  font-weight: 500;
  font-style: italic;
  letter-spacing: -0.02em;
  line-height: 0.7;
  margin: 0;
  color: #aebfd4;
  /* Relief uses the warm beige (#f9ecd0) as the highlight and #595b55 as the
     dark, instead of white/black. */
  text-shadow:
    0 1px 0 rgba(249, 236, 208, 0.72),
    0 -1px 1px rgba(89, 91, 85, 0.55),
    0 -1px 2px rgba(89, 91, 85, 0.35),
    0 2px 12px rgba(89, 91, 85, 0.3);
}

/* Version A (shadow-svg blob title) — try a #595b55 solid fill. */
.caption-fill {
  color: #595b55;
}

/* Hollow type — transparent letters (glass shows through), with ONLY a subtle
   engraved relief. Overrides the .caption text-shadow whose solid beige layer
   was filling the glyphs beige; here it's a soft light/dark edge instead. */
.caption-hollow {
  color: transparent;
  /* transparent letters with a soft (not fuzzy, not razor) engraved edge: a
     thin light stroke + 1px-blur relief edges. */
  -webkit-text-stroke: 0.5px rgba(58, 70, 94, 0.4);
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.5),
    0 -1px 0 rgba(45, 56, 78, 0.4);
}

/* #2 — 3D-extruded relief (comparison): a lit top-left bevel + a stepped
   extrusion falling to the bottom-right (the letters get real "thickness") +
   a soft cast shadow. Overrides only the .caption text-shadow. */
.caption-3d {
  text-shadow:
    -1px -1px 0 rgba(255, 255, 255, 0.5),
    1px 1px 0 rgba(74, 82, 98, 0.42),
    2px 2px 0 rgba(68, 76, 92, 0.32),
    3px 3px 1px rgba(62, 70, 88, 0.22),
    5px 6px 10px rgba(36, 42, 56, 0.18);
}

/* Proxima vector shape as glass-on-the-letters (under the title). The box keeps
   the SVG's aspect; the field inside frosts the backdrop, masked to the shape. */
.title-shape-glass {
  position: relative;
  z-index: 1;
  width: min(46vw, 34rem);
  aspect-ratio: 751.36 / 145;
}
/* The SAME glass material as LiquidGlass's .lg-surface (tint 0.08, blur 7,
   saturate 1.15, turbulence refraction), but masked to the Proxima letterforms
   instead of a capsule. The inset thickness rims become tight white drop-shadows
   (box-shadow can't follow a mask, drop-shadow follows the shape alpha), plus a
   soft outer contact shadow. */
.title-shape-field {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: rgba(255, 255, 255, 0.08);
  -webkit-backdrop-filter: blur(7px) saturate(1.15) url(#shape-refract);
  backdrop-filter: blur(7px) saturate(1.15) url(#shape-refract);
  -webkit-mask: url('/image/Proxima_shape.svg') center / contain no-repeat;
  mask: url('/image/Proxima_shape.svg') center / contain no-repeat;
  filter:
    /* lit top-left bevel edge */
    drop-shadow(-1px -1px 0 rgba(255, 255, 255, 0.65))
    /* blue-grey 3D extrusion — stacked, each step shifts the cumulative shape
       down-right to build the letters' "thickness" (drop-shadow follows the
       mask alpha, so it hugs the glyph outlines) */
    drop-shadow(1px 1px 0 rgba(72, 82, 100, 0.5))
    drop-shadow(1px 1px 0 rgba(68, 78, 96, 0.46))
    drop-shadow(1px 1px 0 rgba(64, 74, 92, 0.42))
    drop-shadow(1px 1px 0 rgba(60, 70, 88, 0.36))
    drop-shadow(1px 1px 0 rgba(56, 66, 84, 0.3))
    /* soft cast shadow grounding the object */
    drop-shadow(2px 9px 14px rgba(46, 56, 76, 0.32));
}
/* Specular sheen — the SAME diagonal gloss as .lg-surface::before, masked to
   the shape so the highlight rides across the letters. */
.title-shape-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    122deg,
    rgba(255, 255, 255, 0.45) 0%,
    rgba(255, 255, 255, 0.12) 16%,
    rgba(255, 255, 255, 0) 42%,
    rgba(255, 255, 255, 0) 78%,
    rgba(255, 255, 255, 0.14) 100%
  );
  -webkit-mask: url('/image/Proxima_shape.svg') center / contain no-repeat;
  mask: url('/image/Proxima_shape.svg') center / contain no-repeat;
}

/* Subtitle: ABC Otto italic Medium. Light blueish fill (matching the title),
   wearing the soft `--rotate-panel-bg` glyph halo backing. */
.hint {
  font-family: 'ABC Otto', serif;
  font-size: 1.4rem;
  font-weight: 500;
  font-style: italic;
  letter-spacing: 0.015em;
  margin: 0;
  /* Light-blue fill (matching the title) — but with NO glass behind it here, so
     a thin dark edge + soft relief give it contrast on the light gradient. */
  color: #aebfd4;
  -webkit-text-stroke: 0.4px rgba(58, 70, 94, 0.55);
  text-shadow:
    0 1px 2px rgba(48, 58, 80, 0.35),
    0 0 8px rgba(170, 180, 194, 0.2);
}

/* Smooth exit toward VIEW_1: when the click handler sets fadingOut
   true, both lines fade out simultaneously over 500ms cubic-bezier —
   same timing as the View1/View3 caption transitions. The script then
   waits FADE_OUT_MS before calling viewState.advance() so the
   view-level cross-fade only kicks in once the title + subtitle are
   fully invisible. The 4px upward drift mirrors the caption leaves in
   View1/View3 for visual continuity across the view chain. */
/* The whole glass title (slab + text) and the subtitle fade out together. */
.view-0.fading-out .title-glass,
.view-0.fading-out .title-shape-glass,
.view-0.fading-out .hint {
  animation: view0-fade-out 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}

@keyframes view0-fade-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-4px); }
}
</style>
