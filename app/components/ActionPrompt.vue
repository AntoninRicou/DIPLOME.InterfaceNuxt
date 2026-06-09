<script setup lang="ts">
// Persistent action prompt — a single call-to-action line pinned near the TOP
// of the viewport, styled like the rotating narration captions (shared
// --rotate-size) and fading in/out on the shared --rotate-* timing, so it stays
// in the same visual "rotate-text" family. Instead of the captions' dense glyph
// stroke it wears a soft blue glow that gently breathes in/out (loading-style)
// to draw the eye. Unlike the narration captions it does NOT rotate and is NOT
// mirrored to project — an interface-side affordance that appears once the
// narration has cleared and stays until its action is performed.
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
  /* Aligned to the TOP corner labels: same `top: 0` + 0.75rem vertical padding
     as the global `.corner-label`, so every prompt sits on the tl/tr label
     line (centred horizontally). */
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0.75rem 1rem;
  max-width: min(60em, 90vw);
  text-align: center;
  /* Differs from the rotating NARRATION (which is ABC Otto at --rotate-size):
     action lines use Neue Kabel Medium and a reduced size. Everything else
     (position, stroke, fade, colour) is identical to the narration captions. */
  font-family: 'Neue Kabel', sans-serif;
  font-weight: 500;
  font-size: 1.05rem;
  line-height: 1.4;
  color: rgba(89, 91, 84, 0.5); /* #595b54 at 50% opacity */
  z-index: 13;
  pointer-events: none;
}

/* No dense glyph stroke (that read as an opaque backing). Instead an actual
   GLOW sits BEHIND the text — a soft radial warm-beige light (f9ecd0, a
   blurred pseudo-element, not a text-shadow). It breathes in/out + scales
   continuously like a loading indicator; its edges fade to transparent so it's
   a glow, not a filled box. */
.action-prompt::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  /* Wider than tall: more length, less height than before (was 118% × 340%),
     so the glow reads as a flat horizontal wash hugging the line. */
  width: 120%;
  height: 120%;
  transform: translate(-50%, -50%);
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    rgba(238, 217, 175, 0.9) 0%,
    rgba(238, 217, 175, 0.55) 32%,
    rgba(238, 217, 175, 0.2) 58%,
    rgba(238, 217, 175, 0) 78%
  );
  filter: blur(6px);
  animation: action-prompt-pulse 2.4s ease-in-out infinite;
}
@keyframes action-prompt-pulse {
  0%, 100% {
    opacity: 0.4;
    transform: translate(-50%, -50%) scale(0.9);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.08);
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
