<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
@font-face {
  font-family: 'ABC Otto';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/ABC%20Otto/ABCOtto-Regular-Trial.woff2') format('woff2'),
       url('/fonts/ABC%20Otto/ABCOtto-Regular-Trial.woff') format('woff');
}
@font-face {
  font-family: 'ABC Otto';
  font-style: italic;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/ABC%20Otto/ABCOtto-MediumItalic-Trial.woff2') format('woff2'),
       url('/fonts/ABC%20Otto/ABCOtto-MediumItalic-Trial.woff') format('woff');
}
@font-face {
  font-family: 'ABC Otto';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/ABC%20Otto/ABCOtto-Medium-Trial.woff2') format('woff2'),
       url('/fonts/ABC%20Otto/ABCOtto-Medium-Trial.woff') format('woff');
}
@font-face {
  font-family: 'Neue Kabel';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/Neue%20Kabel/NeueKabel-Medium.otf') format('opentype');
}
@font-face {
  font-family: 'Neue Kabel';
  font-style: italic;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/Neue%20Kabel/NeueKabel-MediumItalic.otf') format('opentype');
}

/* Global reset — unscoped so the rules apply to the real <html>/<body>.
   Without this the browser's default 8px body margin pushes the viewport-
   sized pages (100vw × 100vh) past the viewport, producing a small scroll
   in both axes. overflow: hidden on body prevents any inner element from
   reintroducing scroll at the document level. */
:root {
  /* Single source of truth for the "label tier" font-size — corner labels
     and the per-quadrant title texts (.proximity-panel-title here,
     .canvas-text-title in project) must all share this size. Style (weight,
     italic, letter-spacing) is independent — only size is locked. Edit here
     AND in project/src/style.css's :root in lockstep.
     NOTE: the rotating intro captions (.caption / .entry-caption /
     .intro-caption) used to share this size, but were DECOUPLED — they now
     use --rotate-size (below) so they can be sized + panelled independently
     of the corner labels/titles. */
  --label-size: 1.15rem;

  /* Rotating intro caption presentation — single source of truth for the
     centred, panelled rotating text in VIEW_1 (.caption), VIEW_2
     (.entry-caption), and VIEW_3 (.intro-caption). Interface size is 1.7rem;
     the project-side mirror (#center-caption.rotate) is intentionally larger
     (2× --label-size) — the user preferred the bigger size on the feedback
     screen. Stays its OWN var so it can be retuned without touching the
     corner labels / titles.
     The backing is a light blue-grey at 90% opacity that traces the text
     glyphs themselves — a soft organic "stroke" hugging the letterforms via a
     layered `text-shadow` on the inner `.caption-text` span (NOT a rectangle
     behind the line). */
  --rotate-size: 1.7rem;
  --rotate-panel-bg: rgba(170, 180, 194, 0.9);

  /* Project-wide blue-gray text halo. Two-tier composition: 3 tight
     overlapping layers at full alpha build a solid muted blue-gray core
     around each glyph; 2 wider feathered layers add the soft luminous
     rim. Applied via `body { text-shadow: var(--halo) }` below and
     inherited by every text node — selectors that need a different
     effect (.corner-label warm pulse, View0 .caption Proxima inset
     stack, View0 .hint elaborate halo) just declare their own
     text-shadow which overrides the inherited value. Edit here AND in
     project/src/style.css's :root in lockstep. */
  /* Rotating-text transition parameters — single source of truth for
     View1Explanation's `.caption` and View3Transition's `.intro-caption`.
     Both views reference these vars in their .caption-* and .intro-*
     transition classes; changing one value here propagates to both.
     Keep the JS-side FADE_OUT_MS constant in each view's <script setup>
     in sync with --rotate-fade-ms (currently 400ms), since that
     setTimeout drives when the next view advance fires. Used for BOTH the
     fade-in and fade-out of every rotating caption (all three views want
     400ms each), and mirrored in project/src/style.css's :root. */
  --rotate-fade-ms: 400ms;
  --rotate-fade-easing: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --rotate-appear-delay: 1400ms;
  --rotate-empty-beat: 200ms;

  --halo:
    0 0 2px  rgba(150, 170, 200, 1),
    0 0 5px  rgba(150, 170, 200, 1),
    0 0 9px  rgba(150, 170, 200, 1),
    0 0 18px rgba(180, 210, 250, 0.55);
}

html,
body,
#__nuxt {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* Body painted with the same day gradient as VIEW-1 / VIEW-2 / VIEW-3 so
   that during cross-fade transitions (where both views are at partial
   opacity and the body shows through ~25%) there is no other color
   leaking onto the screen. Without this, the browser's default white
   body background flashes between views as a "cut". */
body {
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

body {
  /* Project-wide halo, inherited by all text nodes. Selectors that need
     a custom shadow (`.corner-label` warm pulse, View0 `.caption` Proxima
     inset stack, View0 `.hint` elaborate halo) just declare their own
     text-shadow which overrides the inherited value. See :root --halo
     above. */
  /* TEMP DISABLED — uncomment to re-enable the project-wide blue-gray
     halo. Commented out so transition timing can be tested without the
     paint cost of N text elements each running a 4-layer shadow. */
  /* text-shadow: var(--halo); */
}

html {
  font-family: 'ABC Otto', serif;
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
  font-weight: 500;
  font-style: italic;
  font-size: var(--label-size);
  letter-spacing: 0.015em;
  color: #595b54;
  padding: 0.75rem 0.95rem;
  pointer-events: none;
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
     value if a longer body spills to three lines. Widened from 30em when
     the body grew to --label-size (Otto Medium) so it still wraps to ~2
     lines; keep in lockstep with `.canvas-text` width in project. */
  width: 38em;
  padding: 0 1rem;
  text-align: center;
  color: #595b54;
  pointer-events: none;
  box-sizing: border-box;
  /* Organic blue-grey glyph stroke — same layered text-shadow the rotating
     captions (.caption-text) use, in --rotate-panel-bg. text-shadow is
     inherited, so declaring it here covers BOTH the title (subtitle) and the
     body. Traces the letterforms (not a box). Mirrored on project's
     `.canvas-text`. */
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
.proximity-panel-title {
  margin: 0 0 0.4rem;
  /* Mirrors `.corner-label` typography (same family via inheritance, same
     weight 500, same italic, same size + tracking) so the panel title and
     the four corner labels read as the same typographic tier. See
     [[feedback-label-size-sync]] memory for the contract. */
  font-size: var(--label-size);
  font-weight: 500;
  font-style: italic;
  letter-spacing: 0.015em;
  line-height: 1.2;
}
.proximity-panel-body {
  margin: 0;
  /* ABC Otto Medium (upright), sized to match the tier-2 title
     (--label-size). Mirrors `.canvas-text-body` in project/src/style.css —
     keep family/size/weight/line-height in lockstep. */
  font-family: 'ABC Otto', serif;
  font-size: var(--label-size);
  font-weight: 500;
  font-style: normal;
  line-height: 1.15;
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

