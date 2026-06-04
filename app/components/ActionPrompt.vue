<script setup lang="ts">
// Persistent action prompt — a single call-to-action line pinned to the
// BOTTOM of the viewport, styled like the rotating narration captions
// (shared --rotate-size + the organic blue-grey glyph stroke) and fading
// in/out on the shared --rotate-* timing, so it stays in the same visual
// "rotate-text" family. Unlike the narration captions it does NOT rotate and
// is NOT mirrored to project — it is an interface-side affordance that appears
// once the narration has cleared and stays until its action is performed.
//
// Used by VIEW_2 ("Select an image…") and VIEW_3 ("Zoom in the four modes…"
// then "Click on the top cross…"). The parent owns the `visible` timing (sets
// it true the moment the action becomes possible); this component owns only
// the look + the fade. Keeping it a single component means a change to the
// rotate styling/timing propagates to every action prompt at once. See the
// [[rotate-text-sync]] / [[label-size-sync]] memories.
defineProps<{ visible: boolean; text: string }>()
</script>

<template>
  <Transition name="action">
    <p v-if="visible" class="action-prompt">
      <span class="caption-text">{{ text }}</span>
    </p>
  </Transition>
</template>

<style scoped>
.action-prompt {
  position: fixed;
  /* Top of the screen (rotate narration sits in the middle). Offset below
     VIEW_3's advance `+` (the "top cross", at top: 0.22rem) so they don't
     overlap — the prompt reads as sitting just under it. */
  top: 2.5rem;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0 1rem;
  max-width: min(60em, 90vw);
  text-align: center;
  /* Differs from the rotating NARRATION (which is ABC Otto at --rotate-size):
     action lines use Neue Kabel Medium and a reduced size — kept tied to the
     rotate scale (just × 0.65) so it still tracks the rotate family if
     --rotate-size changes. Everything else (position, stroke, fade, colour)
     is identical to the narration captions. */
  font-family: 'Neue Kabel', sans-serif;
  font-weight: 500;
  font-size: calc(var(--rotate-size) * 0.7);
  line-height: 1.4;
  color: #595b54;
  z-index: 13;
  pointer-events: none;
}

/* Same organic blue-grey glyph stroke as the rotating captions
   (.caption-text in View1/2/3) so the action line reads in the same family.
   PLUS a one-shot blue glow swell that plays once each time the prompt appears
   (the <p> remounts on every `visible` flip), so the eye is drawn to it. The
   keyframe starts and ends on the static stroke, swelling the blue mid-way. */
.action-prompt .caption-text {
  text-shadow:
    0 0 4px var(--rotate-panel-bg),
    0 0 6px var(--rotate-panel-bg),
    0 0 6px var(--rotate-panel-bg),
    0 0 9px var(--rotate-panel-bg),
    0 0 9px var(--rotate-panel-bg),
    0 0 12px var(--rotate-panel-bg),
    0 0 12px var(--rotate-panel-bg),
    0 0 15px var(--rotate-panel-bg),
    0 0 18px var(--rotate-panel-bg);
  animation: action-prompt-glow 3s ease-out 1 both;
}
@keyframes action-prompt-glow {
  0%, 100% {
    text-shadow:
      0 0 4px var(--rotate-panel-bg),
      0 0 6px var(--rotate-panel-bg),
      0 0 6px var(--rotate-panel-bg),
      0 0 9px var(--rotate-panel-bg),
      0 0 9px var(--rotate-panel-bg),
      0 0 12px var(--rotate-panel-bg),
      0 0 12px var(--rotate-panel-bg),
      0 0 15px var(--rotate-panel-bg),
      0 0 18px var(--rotate-panel-bg);
  }
  30% {
    text-shadow:
      0 0 6px var(--rotate-panel-bg),
      0 0 14px var(--rotate-panel-bg),
      0 0 26px var(--rotate-panel-bg),
      0 0 44px var(--rotate-panel-bg),
      0 0 70px var(--rotate-panel-bg),
      0 0 110px var(--rotate-panel-bg);
  }
}

/* Fade in/out on the shared rotate fade timing. No appear/empty-beat delay:
   the parent flips `visible` true only once the narration has already
   cleared, so the prompt should fade straight in. */
.action-enter-active,
.action-leave-active {
  transition: opacity var(--rotate-fade-ms) var(--rotate-fade-easing);
}
.action-enter-from,
.action-leave-to {
  opacity: 0;
}
</style>
