<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
/* Global reset — unscoped so the rules apply to the real <html>/<body>.
   Without this the browser's default 8px body margin pushes the viewport-
   sized pages (100vw × 100vh) past the viewport, producing a small scroll
   in both axes. overflow: hidden on body prevents any inner element from
   reintroducing scroll at the document level. */
html,
body,
#__nuxt {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
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
  background-attachment: fixed;
  background-size: 100vw 100vh;
  background-position: 0 0;
}
/* ── Corner labels ──
   Shared "MIRROR / TRACE / SHIFT / REPLAY" tags placed in the four
   outer corners. Used by VIEW_3 (the post-disperse transition) and
   VIEW_4 (the relational grid, via `RelationComponent.quarter-tag`'s
   replacement). Pixel-positioned identically in both views so the
   labels stay put across the VIEW_3 → VIEW_4 swap. Defined globally
   (unscoped) so the styling lives in one place; opacity / visibility
   gating is component-specific (VIEW_3 fades them in alongside the
   caption; VIEW_4 shows them from mount). */
.corner-label {
  position: absolute;
  font-family: monospace;
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  color: #595b54;
  padding: 0.75rem 0.95rem;
  pointer-events: none;
  text-transform: uppercase;
  text-shadow:
    0 0 8px rgba(255, 252, 230, 1),
    0 0 20px rgba(255, 248, 220, 0.9),
    0 0 42px rgba(255, 244, 210, 0.6),
    0 0 75px rgba(255, 240, 200, 0.3);
}
.corner-label[data-position="tl"] { top: 0; left: 0; }
.corner-label[data-position="tr"] { top: 0; right: 0; }
.corner-label[data-position="bl"] { bottom: 0; left: 0; }
.corner-label[data-position="br"] { bottom: 0; right: 0; }

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
     value if a longer body spills to three lines. */
  width: 30em;
  padding: 0 1rem;
  text-align: center;
  color: #595b54;
  pointer-events: none;
  box-sizing: border-box;
  /* Explicitly serif so both VIEW_3 and VIEW_4 render identically.
     VIEW_4's root sets `font-family: monospace`, which the panel would
     otherwise inherit; declaring it here breaks that inheritance and
     locks both views to the same serif type — same look across the
     VIEW_3 → VIEW_4 swap when interpretation mode toggles. */
  font-family: serif;
}
.proximity-panel-title {
  margin: 0 0 0.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.3;
}
.proximity-panel-body {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
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
  background-attachment: fixed;
  background-size: 100vw 100vh;
  background-position: 0 0;
}
</style>

