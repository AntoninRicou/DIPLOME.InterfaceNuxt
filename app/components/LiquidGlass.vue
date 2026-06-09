<script setup lang="ts">
import { computed } from 'vue'

// ── LiquidGlass — glass container (dual mode, for comparison) ──
// The glass material (backdrop-filter frost + saturate + optional
// feTurbulence/feDisplacementMap refraction + specular sheen) lives ONLY on a
// background layer; the slotted content sits sharp above it (never filtered).
//
// Two geometries:
//   • shape set  → masked blob: .lg-field + .lg-specular clipped to the SVG.
//   • shape empty→ capsule: .lg-surface with border-radius + box-shadow + sheen.
// `shape` takes precedence over `radius`.

const props = withDefaults(
  defineProps<{
    tag?: string
    /** Capsule border-radius (used only when `shape` is empty). */
    radius?: string
    /** SVG mask URL — when set, the glass is clipped to this contour (blob). */
    shape?: string
    blur?: number
    saturate?: number
    refraction?: number
    padX?: string
    padY?: string
    tint?: string
  }>(),
  {
    tag: 'div',
    radius: '999px',
    shape: '',
    blur: 7,
    saturate: 1.15,
    refraction: 14,
    padX: '1.3rem',
    padY: '1rem',
    tint: 'rgba(255, 255, 255, 0.08)',
  },
)

const filterId = `liquid-glass-${nextGlassId()}`
const useShape = computed(() => !!props.shape)

const backdrop = computed(() => {
  const parts = [`blur(${props.blur}px)`, `saturate(${props.saturate})`]
  if (props.refraction > 0) parts.push(`url(#${filterId})`)
  return parts.join(' ')
})

const rootStyle = computed(() => {
  const s: Record<string, string> = { padding: `${props.padY} ${props.padX}` }
  if (props.shape) s['--lg-mask'] = `url('${props.shape}') center / contain no-repeat`
  return s
})

// Capsule surface (shape empty).
const surfaceStyle = computed(() => ({
  borderRadius: props.radius,
  background: props.tint,
  backdropFilter: backdrop.value,
  WebkitBackdropFilter: backdrop.value,
}))

// Masked blob field (shape set).
const fieldStyle = computed(() => ({
  background: props.tint,
  backdropFilter: backdrop.value,
  WebkitBackdropFilter: backdrop.value,
}))
</script>

<script lang="ts">
let glassIdCounter = 0
function nextGlassId(): number {
  return glassIdCounter++
}
</script>

<template>
  <component :is="tag" class="liquid-glass" :style="rootStyle">
    <svg
      v-if="refraction > 0"
      class="lg-defs"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter
          :id="filterId"
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
      </defs>
    </svg>

    <!-- SHAPE mode: masked blob (field + specular share the SVG mask) -->
    <template v-if="useShape">
      <div class="lg-field" :style="fieldStyle" aria-hidden="true" />
      <div class="lg-specular" aria-hidden="true" />
    </template>
    <!-- CAPSULE mode: rounded surface -->
    <div v-else class="lg-surface" :style="surfaceStyle" aria-hidden="true" />

    <!-- content — sharp, above the glass, never filtered -->
    <div class="lg-content">
      <slot />
    </div>
  </component>
</template>

<style scoped>
.liquid-glass {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.lg-defs {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
}

/* ── SHAPE mode ── both layers clipped by the SAME SVG mask. */
.lg-field,
.lg-specular {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  -webkit-mask: var(--lg-mask);
  mask: var(--lg-mask);
}
.lg-field {
  filter:
    drop-shadow(0 1px 0.5px rgba(255, 255, 255, 0.55))
    drop-shadow(0 10px 26px rgba(70, 85, 110, 0.18));
}
.lg-specular {
  background: linear-gradient(
    122deg,
    rgba(255, 255, 255, 0.45) 0%,
    rgba(255, 255, 255, 0.12) 16%,
    rgba(255, 255, 255, 0) 42%,
    rgba(255, 255, 255, 0) 78%,
    rgba(255, 255, 255, 0.14) 100%
  );
}

/* ── CAPSULE mode ── high-quality "curved / inflated glass" illusion, pure CSS.
   The curvature comes from RIM LIGHTING (top-left highlight + bottom-right dark
   edge) reinforced by a soft inner glow; a diagonal specular sweep (::before)
   adds the wet gloss; a subtle outer shadow gives depth. */
.lg-surface {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  box-shadow:
    /* rim lighting — lit top-left, dark bottom-right = inflated/curved */
    inset 2px 2px 3px rgba(255, 255, 255, 0.62),
    inset -2px -2px 4px rgba(38, 48, 68, 0.3),
    /* soft inner glow toward the centre */
    inset 0 0 20px rgba(255, 255, 255, 0.09),
    /* depth — a subtle, not heavy, outer contact shadow */
    0 10px 28px rgba(45, 58, 82, 0.2);
}
/* Specular sweep — a diagonal gloss, clipped to the capsule via border-radius. */
.lg-surface::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    125deg,
    rgba(255, 255, 255, 0.6) 0%,
    rgba(255, 255, 255, 0.18) 12%,
    rgba(255, 255, 255, 0) 38%,
    rgba(255, 255, 255, 0) 70%,
    rgba(255, 255, 255, 0.22) 100%
  );
  pointer-events: none;
}

/* Content rides above the glass; nothing here is ever filtered. */
.lg-content {
  position: relative;
  z-index: 1;
}
</style>
