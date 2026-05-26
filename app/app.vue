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

