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
     action lines use Neue Kabel Medium and a reduced size. Everything else
     (position, stroke, fade, colour) is identical to the narration captions. */
  font-family: 'Neue Kabel', sans-serif;
  font-weight: 500;
  font-size: 1.05rem;
  line-height: 1.4;
  color: #595b54;
  z-index: 13;
  pointer-events: none;
}

/* No dense glyph stroke (that read as an opaque blue backing). Instead an
   actual GLOW sits BEHIND the text — a soft radial blue light (a blurred
   pseudo-element, not a text-shadow, which was washing out to grey fog on the
   light gradient). It breathes in/out + scales continuously like a loading
   indicator. Saturated enough to read as light on the day backdrop; its edges
   fade to transparent so it's a glow, not a filled box. */
.action-prompt::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 118%;
  height: 340%;
  transform: translate(-50%, -50%);
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    rgba(150, 178, 248, 0.85) 0%,
    rgba(146, 174, 240, 0.5) 32%,
    rgba(140, 168, 228, 0.18) 58%,
    rgba(140, 168, 228, 0) 78%
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
