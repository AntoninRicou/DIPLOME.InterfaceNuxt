<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

// ── LiquidGlassText — TEXT glass MATERIAL (sibling of LiquidGlass) ──
// Not "distorted text" — a material system applied to glyphs. One glyph shape
// (<text id="glyphs">) is reused via <use> across THREE stacked optical layers,
// all sharing the same refraction so they stay registered:
//   1. depth   — a blurred duplicate behind the glyphs (internal glow / depth)
//   2. body    — the glass fill: a vertical gradient (top-left highlight bias),
//                refracted by the shared feTurbulence+feDisplacementMap filter
//   3. specular— an offset white duplicate, screen-blended (light catching the
//                glass surface), refracted the same way so it tracks the body
//
// The feTurbulence + feDisplacementMap filter is COPIED VERBATIM from
// LiquidGlass.vue (not simplified). NO backdrop-filter. LiquidGlass.vue is
// untouched — container glass and text glass coexist.
//
// Font (size/family/style/weight/letter-spacing) is INHERITED from the host.

const props = withDefaults(
  defineProps<{
    text?: string
    /** Refraction strength (feDisplacementMap scale, px). Modest = readable. */
    refraction?: number
    /** Glass fill gradient — top (highlight) and bottom (body) colours. */
    fillTop?: string
    fillBottom?: string
    /** Specular highlight strength (white duplicate opacity). */
    specular?: number
    /** Internal depth/glow colour + opacity (blurred layer behind). */
    glow?: string
    glowOpacity?: number
  }>(),
  {
    text: 'Proxima',
    refraction: 6,
    fillTop: 'rgba(223, 232, 244, 0.96)',
    fillBottom: 'rgba(150, 168, 196, 0.92)',
    specular: 0.6,
    glow: 'rgba(70, 86, 116, 0.9)',
    glowOpacity: 0.45,
  },
)

const uid = `lgt-${nextGlassTextId()}`
const refractId = `${uid}-refract`
const glowId = `${uid}-glow`
const fillId = `${uid}-fill`
const glyphsId = `${uid}-glyphs`

// Auto-size the SVG to the rendered text (after the web font loads), with
// padding for the displacement + blur spill so nothing clips.
const bodyRef = ref<SVGUseElement | null>(null)
const w = ref(600)
const h = ref(160)
const ready = ref(false)

function measure() {
  const el = bodyRef.value
  if (!el) return
  const b = el.getBBox()
  if (b.width === 0) return
  const pad = Math.ceil(props.refraction) + 16
  w.value = Math.ceil(b.width + pad * 2)
  h.value = Math.ceil(b.height + pad * 2)
  ready.value = true
}

function onResize() {
  measure()
}
onMounted(async () => {
  try {
    await (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready
  } catch {
    /* fonts API unavailable — measure immediately */
  }
  measure()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

const viewBox = computed(() => `0 0 ${w.value} ${h.value}`)
</script>

<script lang="ts">
let glassTextCounter = 0
function nextGlassTextId(): number {
  return glassTextCounter++
}
</script>

<template>
  <span class="liquid-glass-text" :class="{ ready }" :aria-label="text" role="img">
    <svg
      class="lgt-svg"
      :width="w"
      :height="h"
      :viewBox="viewBox"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <!-- ▼▼ EXACT SAME filter pipeline as LiquidGlass.vue's .lg-defs ▼▼
             feTurbulence + feDisplacementMap, unchanged. Applied to the glyph
             <use>s below, so SourceGraphic = the glyphs (text refraction). -->
        <filter
          :id="refractId"
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          color-interpolation-filters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.014"
            numOctaves="2"
            seed="6"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            :scale="refraction"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <!-- ▲▲ end shared filter ▲▲ -->

        <!-- Layer 3 helper: soft gaussian blur for the depth/glow layer. -->
        <filter
          :id="glowId"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          color-interpolation-filters="sRGB"
        >
          <feGaussianBlur stdDeviation="3.5" />
        </filter>

        <!-- Layer 1 helper: glass fill — vertical gradient, lighter at the top
             (highlight bias) → body colour at the bottom. -->
        <linearGradient :id="fillId" x1="0.15" y1="0" x2="0.4" y2="1">
          <stop offset="0" :stop-color="fillTop" />
          <stop offset="0.55" :stop-color="fillBottom" />
          <stop offset="1" :stop-color="fillBottom" />
        </linearGradient>

        <!-- One glyph definition, reused by every layer so they're identical. -->
        <text
          :id="glyphsId"
          class="lgt-glyphs"
          x="50%"
          y="50%"
          text-anchor="middle"
          dominant-baseline="central"
        >{{ text }}</text>
      </defs>

      <!-- 3 — internal depth / glow (blurred duplicate behind the glyphs) -->
      <use
        :href="`#${glyphsId}`"
        :fill="glow"
        :opacity="glowOpacity"
        :filter="`url(#${glowId})`"
      />

      <!-- 1 — glass body: gradient fill, refracted -->
      <use
        ref="bodyRef"
        :href="`#${glyphsId}`"
        :fill="`url(#${fillId})`"
        :filter="`url(#${refractId})`"
      />

      <!-- 2 — specular highlight: offset white duplicate, screen-blended,
           refracted the SAME way so it rides the warped body -->
      <use
        :href="`#${glyphsId}`"
        fill="#ffffff"
        :opacity="specular"
        transform="translate(-1, -2)"
        :filter="`url(#${refractId})`"
        style="mix-blend-mode: screen"
      />
    </svg>
  </span>
</template>

<style scoped>
.liquid-glass-text {
  display: inline-block;
  /* hidden until measured so the first paint can't show a mis-sized svg */
  opacity: 0;
  transition: opacity 200ms ease;
}
.liquid-glass-text.ready {
  opacity: 1;
}
.lgt-svg {
  display: block;
  overflow: visible;
}
/* Inherits the host font (size/family/style/weight/letter-spacing). */
.lgt-glyphs {
  white-space: nowrap;
}
</style>
