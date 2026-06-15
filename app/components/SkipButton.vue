<script setup lang="ts">
import { ref } from 'vue'
// Shared "Skip"/advance affordance — one consistent control used by VIEW_1
// (explanation), VIEW_2 (disperse) and VIEW_3 (quadrant) to skip forward, and
// by VIEW_4's "Start over" (top-placed). The label in Neue Kabel, the muted
// grey (#595b54) at 50% opacity, lifting to full on hover. Pinned centre and
// vertically aligned with the corner labels (same `0` edge anchor + `0.75rem`
// vertical padding, so it sits on their line). Font-size matches the
// ActionPrompt (1.05rem). The PARENT owns the click action (and whether the
// button is shown, via v-if); this component owns only the look, so every
// consumer stays consistent.
const props = withDefaults(defineProps<{
  // Button text. Defaults to "Skip" so the three skip consumers need no prop.
  label?: string
  // Which corner-label line to align to. 'bottom' (default) = bl/br line;
  // 'top' = tl/tr line (VIEW_4 "Start over").
  placement?: 'top' | 'bottom'
  // True when this click does NOT remove the button — it STAYS in the same view
  // (e.g. VIEW_3's two-stage skip, stage 1). Then the exit fade plays and the
  // button fades back IN afterwards instead of staying gone. Default false: the
  // click advances/removes the button, so it just fades out and stays gone.
  staysAfterClick?: boolean
  // Parent-driven fade-out. Set true to play the SAME `is-leaving` fade as a
  // self-click, for removals NOT triggered by clicking the button itself —
  // e.g. VIEW_0's title click (the main target) advancing, or VIEW_1's
  // last-panel auto-advance. Without it those paths would `v-if`-unmount the
  // teleported button at full opacity (it doesn't ride the view cross-fade),
  // hard-cutting instead of fading. Parents must keep the button mounted for
  // `LEAVE_MS` after flipping this so the fade can actually play.
  leaving?: boolean
}>(), {
  label: 'Skip',
  placement: 'bottom',
  staysAfterClick: false,
  leaving: false,
})
const emit = defineEmits<{ click: [] }>()

// On click the button fades itself OUT (the `.is-leaving` animation) so it
// visibly disappears, then forwards the click to the parent. If the button is
// expected to STAY (staysAfterClick), it resets after the fade so it re-appears
// (the entrance animation replays) — otherwise it stays gone until it unmounts.
const LEAVE_MS = 500
const clicked = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | null = null
function onClick() {
  if (resetTimer) { clearTimeout(resetTimer); resetTimer = null }
  // Capture BEFORE emit — the parent's handler may flip staysAfterClick during
  // this click (VIEW_3 stage 1 sets crossesReady, so it goes true → false).
  const stays = props.staysAfterClick
  clicked.value = true
  emit('click')
  if (stays) {
    resetTimer = setTimeout(() => { clicked.value = false }, LEAVE_MS)
  }
}
</script>

<template>
  <!-- Teleported to <body> so the fixed button isn't trapped in a parent
       stacking context (e.g. VIEW_2's `.view-0` is `position: fixed`, which
       creates one) — that would pin its z-index BELOW the app-root dim overlay
       (z 9999) and darken it during narration. At body level its z-index is in
       the root context, above the dim. -->
  <Teleport to="body">
    <button
      class="skip-button"
      :class="[placement, { 'is-leaving': clicked || leaving }]"
      type="button"
      :aria-label="label"
      @click="onClick"
    >
      {{ label }}
    </button>
  </Teleport>
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
  font-style: italic;
  font-size: 1.05rem;
  letter-spacing: 0.015em;
  line-height: 1;
  /* REVERSED from the rotate text: blueish FILL with a dark-grey GLOW (rotate
     text is the opposite — dark fill, blueish glow). Same two colours, swapped. */
  color: rgb(175, 180, 188);
  text-shadow:
    0 0 4px rgba(89, 91, 85, 0.95),
    0 0 6px rgba(89, 91, 85, 0.9),
    0 0 9px rgba(89, 91, 85, 0.75),
    0 0 13px rgba(89, 91, 85, 0.55);
  opacity: 0.65;
  cursor: var(--cursor-pointer);
  transition: opacity 150ms ease;
  /* Above the interface dim overlay (app.vue .dim-overlay z 9999) so Skip stays
     lit + clickable while the screen darkens for narration — but BELOW the About
     modal (.credits-panel z 10001) so that overlay still covers it when open. */
  z-index: 10000;
  pointer-events: auto;
  /* Entrance every time a view mounts its Skip button. Without it, skipping
     into the next view (which has its own button at the same fixed spot) makes
     the new button appear instantly under the cursor — at hover opacity — so it
     looks like the same button "stayed behind the mouse". The button is held
     HIDDEN for `delay` (so it clearly goes away during the view swap), then
     fades in over `duration` — a distinct disappear → reappear. `backwards`
     fill keeps it at opacity 0 through the delay; after the animation the
     normal base/:hover opacity resumes. The animation also overrides :hover
     for its run, so the cursor sitting on the spot can't reveal it early. */
  animation: skip-appear 800ms ease 350ms backwards;
}
@keyframes skip-appear {
  from { opacity: 0; }
  to { opacity: 0.65; }
}
/* Exit on click — fade out over 500ms (overrides the entrance + :hover for its
   run, and forwards-holds at 0 so it stays gone until the button unmounts). */
.skip-button.is-leaving {
  animation: skip-leave 500ms ease forwards;
  pointer-events: none;
}
@keyframes skip-leave {
  to { opacity: 0; }
}
.skip-button.bottom { bottom: 0; }
.skip-button.top { top: 0; }
.skip-button:hover {
  opacity: 1;
}
</style>
