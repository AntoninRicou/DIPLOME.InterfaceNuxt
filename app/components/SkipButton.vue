<script setup lang="ts">
// Shared "Skip"/advance affordance — one consistent control used by VIEW_1
// (explanation), VIEW_2 (disperse) and VIEW_3 (quadrant) to skip forward, and
// by VIEW_4's "Start over" (top-placed). The label in Neue Kabel, the muted
// grey (#595b54) at 50% opacity, lifting to full on hover. Pinned centre and
// vertically aligned with the corner labels (same `0` edge anchor + `0.75rem`
// vertical padding, so it sits on their line). Font-size matches the
// ActionPrompt (1.05rem). The PARENT owns the click action (and whether the
// button is shown, via v-if); this component owns only the look, so every
// consumer stays consistent.
withDefaults(defineProps<{
  // Button text. Defaults to "Skip" so the three skip consumers need no prop.
  label?: string
  // Which corner-label line to align to. 'bottom' (default) = bl/br line;
  // 'top' = tl/tr line (VIEW_4 "Start over").
  placement?: 'top' | 'bottom'
}>(), {
  label: 'Skip',
  placement: 'bottom',
})
defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="skip-button"
    :class="placement"
    type="button"
    :aria-label="label"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.skip-button {
  position: fixed;
  /* Aligned with the corner labels: same edge anchor + vertical padding + size
     tier, so the label sits on the same line as the corner tags. */
  left: 50%;
  transform: translateX(-50%);
  background: transparent;
  border: none;
  padding: 0.75rem 0.95rem;
  font-family: 'Neue Kabel', sans-serif;
  font-weight: 500;
  font-size: 1.05rem;
  letter-spacing: 0.015em;
  line-height: 1;
  color: #595b54;
  opacity: 0.5;
  cursor: pointer;
  transition: opacity 150ms ease;
  z-index: 20;
  pointer-events: auto;
}
.skip-button.bottom { bottom: 0; }
.skip-button.top { top: 0; }
.skip-button:hover {
  opacity: 1;
}
</style>
