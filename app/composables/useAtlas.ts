import type { CSSProperties } from 'vue'

export interface AtlasImageMeta {
  col: number
  row: number
  u: number
  v: number
  uSize: number
  vSize: number
  imgU: number
  imgV: number
  imgUSize: number
  imgVSize: number
  width: number
  height: number
  aspect: number
  fitWidth: number
  fitHeight: number
}

export interface AtlasMeta {
  cols: number
  rows: number
  tile: number
  width: number
  height: number
  format: string
  images: Record<string, AtlasImageMeta>
}

const ATLAS_IMAGE_URL = '/atlas/atlas.jpg'
const ATLAS_JSON_URL = '/atlas/atlas.json'

export function useAtlas() {
  const atlas = useState<AtlasMeta | null>('atlas-meta', () => null)

  if (import.meta.client && !atlas.value) {
    $fetch<AtlasMeta>(ATLAS_JSON_URL)
      .then((m) => { atlas.value = m })
      .catch((err) => { console.warn('[useAtlas] load failed', err) })
  }

  function getThumbStyle(id: string): CSSProperties {
    const meta = atlas.value?.images[id]
    if (!meta) {
      return {
        backgroundColor: '#16161a',
        opacity: 0.4,
        filter: 'grayscale(1)',
      }
    }
    return {
      backgroundImage: `url(${ATLAS_IMAGE_URL})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${100 / meta.imgUSize}% ${100 / meta.imgVSize}%`,
      backgroundPosition: `${(meta.imgU / (1 - meta.imgUSize)) * 100}% ${(meta.imgV / (1 - meta.imgVSize)) * 100}%`,
    }
  }

  function getAspect(id: string): number {
    return atlas.value?.images[id]?.aspect ?? 1
  }

  return { atlas, getThumbStyle, getAspect }
}
