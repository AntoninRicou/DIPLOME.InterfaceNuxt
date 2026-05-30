<script setup lang="ts">
import { ref } from 'vue'
import { useViewStateStore } from '~/stores/viewState'

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
    @click="handleClick"
  >
    <p class="caption">Proxima</p>
    <p class="hint">No image belong to one place</p>
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
  cursor: pointer;
  z-index: 100;
  /* TEMP DEBUG (commented): uncomment to swap the gradient for solid
     black — useful when tuning the subtitle halo against a known
     dark backdrop. `.bg-gradient` is still on the section element,
     so re-enabling/disabling this line snaps between gradient and
     black without touching the template. */
  /* background: #000 !important; */
}

/* InDesign-style typographic treatment — printed editorial feel.
   Cream glyph body sits inside two halos: a tight dark warm-gray stack
   right at the glyph perimeter (simulates an inset/recessed feel via
   stacked tight text-shadows) and a wider cool blue-gray atmospheric
   halo beyond it. Order matters: tight inner layers listed first so
   they paint on top of the outer cool layers. */
.caption {
  font-size: 7rem;
  font-weight: 500;
  font-style: italic;
  letter-spacing: -0.02em;
  line-height: 1;
  margin: 0;
  color: #f9ecd0;
  /* TEMP DISABLED — Proxima inset shadow stack (4 tight dark inner
     layers + 2 blue-gray outer halo layers). Uncomment to re-enable. */
  /*
  text-shadow:
    0 0 1px  rgba(89, 91, 85, 1),
    0 0 3px  rgba(89, 91, 85, 0.95),
    0 0 7px  rgba(89, 91, 85, 0.8),
    0 0 14px rgba(89, 91, 85, 0.55),
    0 0 30px rgba(140, 165, 210, 1),
    0 0 64px rgba(140, 165, 210, 0.85);
  */
}

.hint {
  font-family: 'Neue Kabel', sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.015em;
  margin: 0;
  color: #6a6566;
  /* TEMP DISABLED — heavy 11-layer subtitle halo (8 solid core + 3
     feathered rim, max 380px radius). This was the single biggest
     paint cost in the project; commented out so transitions can be
     observed cleanly. Uncomment to re-enable.

     Blue-gray atmospheric halo, pushed strong and wide so it's clearly
     visible at 0.85rem. Same palette as the title's outer halo
     (`rgba(140, 165, 210, ...)`) so both lines read as the same light
     source. Four stacked layers from tight inner to wide outer wash;
     opacity was removed from the element so the halo is not attenuated. */
  /*
  text-shadow:
    0 0 4px   rgba(150, 170, 200, 1),
    0 0 12px  rgba(150, 170, 200, 1),
    0 0 22px  rgba(150, 170, 200, 1),
    0 0 35px  rgba(150, 170, 200, 1),
    0 0 50px  rgba(150, 170, 200, 1),
    0 0 70px  rgba(150, 170, 200, 1),
    0 0 95px  rgba(150, 170, 200, 1),
    0 0 130px rgba(150, 170, 200, 1),
    0 0 180px rgba(180, 210, 250, 0.6),
    0 0 270px rgba(180, 210, 250, 0.3),
    0 0 380px rgba(180, 210, 250, 0.15);
  */
}

/* Smooth exit toward VIEW_1: when the click handler sets fadingOut
   true, both lines fade out simultaneously over 500ms cubic-bezier —
   same timing as the View1/View3 caption transitions. The script then
   waits FADE_OUT_MS before calling viewState.advance() so the
   view-level cross-fade only kicks in once the title + subtitle are
   fully invisible. The 4px upward drift mirrors the caption leaves in
   View1/View3 for visual continuity across the view chain. */
.view-0.fading-out .caption,
.view-0.fading-out .hint {
  animation: view0-fade-out 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}

@keyframes view0-fade-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-4px); }
}
</style>
