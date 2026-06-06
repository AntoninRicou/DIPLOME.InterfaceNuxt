// Per-image dimensions in vmin, EQUAL-AREA normalized. Shared by
// CentralImage.vue (VIEW-3 / VIEW-4 deck + circle), RelationComponent.vue
// (quadrant cells), View4Relational.vue (explore ribbons) and View2Disperse.vue
// (hover previews) so every surface sizes images the same way.
//
// The goal is SURFACE balance: a very tall picture and a very wide picture
// should cover the SAME amount of ink, just in different shapes — not normalize
// by longest edge (which leaves squares looking far bigger than thin images).
//
// Every image targets the same area BASE_EDGE² vmin² regardless of aspect:
//   width  = BASE_EDGE · √aspect
//   height = BASE_EDGE / √aspect
//   ⇒ width · height = BASE_EDGE²   (constant area, ratio preserved)
// A square renders ~BASE_EDGE × BASE_EDGE; landscapes get wider + shorter,
// portraits narrower + taller, all at equal surface. A subtle per-image hash
// varies the AREA a little (linear factor = √hash) so it stays organic rather
// than a rigid grid. Per-surface scale (×1.0 central, ×0.85 circle, ×0.6
// quadrant/ribbon) is applied by each caller on top of these dims.

// Edge of the equal-area square (vmin). Raise/lower to scale every surface at
// once; per-surface multipliers then set the relative sizes.
const BASE_EDGE_VMIN = 26

// Extra scale applied to the central-image family ONLY (the collapsed deck +
// the circle of 10, both rendered by CentralImage, and VIEW_4's hover hit-box
// which must match the deck). Lets the central/circle shrink without touching
// the quadrant cells or ribbons. Lower = smaller central + circle.
export const CENTER_IMAGE_SCALE = 0.8
// Per-image surface variation: hash scales AREA within this range (the linear
// dims scale by its square root, so the visible variation stays gentle).
const SIZE_VARIATION_MIN = 0.85
const SIZE_VARIATION_MAX = 1.25

function hashScale(id: string): number {
  // FNV-1a 32-bit → uniform [SIZE_VARIATION_MIN, SIZE_VARIATION_MAX].
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const u = (h >>> 0) / 0xffffffff
  return SIZE_VARIATION_MIN + u * (SIZE_VARIATION_MAX - SIZE_VARIATION_MIN)
}

export function useCentralImageDims() {
  const { getNaturalSize } = useAtlas()

  function naturalDimsVmin(id: string): { width: number; height: number } {
    const size = getNaturalSize(id)
    // Hash varies the AREA; the linear edge factor is its square root so the
    // surface jitter stays subtle (±~10% on each edge).
    const edgeVar = Math.sqrt(hashScale(id))
    if (!size || !(size.width > 0) || !(size.height > 0)) {
      return { width: BASE_EDGE_VMIN * edgeVar, height: BASE_EDGE_VMIN * edgeVar }
    }
    const sr = Math.sqrt(size.width / size.height) // √aspect
    return {
      width: BASE_EDGE_VMIN * sr * edgeVar,
      height: (BASE_EDGE_VMIN / sr) * edgeVar,
    }
  }

  return { naturalDimsVmin }
}
