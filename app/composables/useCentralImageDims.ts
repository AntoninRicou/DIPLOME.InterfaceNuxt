// Per-image natural dimensions in vmin. Shared by CentralImage.vue
// (VIEW-3 / VIEW-4 deck) and View2Disperse.vue (VIEW-2 hover previews)
// so all three views render an image at the same intrinsic footprint —
// hash-derived size variation + aspect-balance penalty included.

const VMIN_PER_PIXEL = 0.055
const FALLBACK_VMIN = 26
const SIZE_VARIATION_MIN = 0.85
const SIZE_VARIATION_MAX = 1.25
const ASPECT_PENALTY_STRENGTH = 0.15
const ASPECT_PENALTY_FLOOR = 0.55

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

function aspectBalance(aspectRatio: number): number {
  // Log-distance from a 1:1 square. 0 for square, ~1 for 2:1, ~2 for 4:1.
  const logDist = Math.abs(Math.log2(aspectRatio))
  return Math.max(ASPECT_PENALTY_FLOOR, 1 - logDist * ASPECT_PENALTY_STRENGTH)
}

export function useCentralImageDims() {
  const { getNaturalSize } = useAtlas()

  function naturalDimsVmin(id: string): { width: number; height: number } {
    const size = getNaturalSize(id)
    const scale = hashScale(id)
    if (!size) {
      return { width: FALLBACK_VMIN * scale, height: FALLBACK_VMIN * scale }
    }
    const balance = aspectBalance(size.width / size.height)
    const k = VMIN_PER_PIXEL * scale * balance
    return {
      width: size.width * k,
      height: size.height * k,
    }
  }

  return { naturalDimsVmin }
}
