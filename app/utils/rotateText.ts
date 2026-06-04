/**
 * Shared timing constants for the rotating-text components
 * (View1Explanation `.caption` + View3Transition `.intro-caption`).
 *
 * Pairs with the `--rotate-*` CSS custom properties in app.vue's `:root`:
 * the CSS vars own the visual fade timing (durations, easings, delays
 * inside the transition), this file owns the JS-side timer cadence
 * (how long each sentence displays at full opacity, and how long the
 * leave animation takes before the next view advance fires).
 *
 * Both views import these — changing a value here updates both views
 * in lockstep. Do NOT hardcode panel-cadence or fade-out durations
 * inside either view's `<script setup>`; reference these constants
 * instead. See feedback_rotate_text_sync.md for the contract.
 */

/** How long each sentence sits at full opacity before the timer advances
 *  to the next index (and the leave→empty→enter sequence begins). The HOLD
 *  is now per-view (the views wanted different paces); only the FADE
 *  (ROTATE_FADE_OUT_MS / --rotate-fade-ms) stays shared/locked.
 *    VIEW_1 explanation        → 4s
 *    VIEW_2 entry + project     → 6s  (interface narration AND the project-
 *                                      only centred narration)
 *    VIEW_3 intro + modes line  → 6s */
export const VIEW1_PANEL_MS = 4000
export const VIEW2_PANEL_MS = 6000
export const VIEW3_PANEL_MS = 6000

/** How long the leave animation takes before the script triggers the
 *  next view advance. MUST equal `--rotate-fade-ms` in app.vue's `:root`
 *  (currently 400ms) since this drives the setTimeout that delays
 *  `enterEntryView()` until the leave animation finishes. */
export const ROTATE_FADE_OUT_MS = 400
