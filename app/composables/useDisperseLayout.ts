import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue'

const DISPERSE_MOVE_SPEED = 15
const DISPERSE_MOVE_DISTANCE = 0.8
const SPAWN_RADIUS = 1.18
const SPAWN_DELAY_MAX_MS = 140
const SPAWN_DURATION_MIN_MS = 420
const SPAWN_DURATION_MAX_MS = 640

const FREQ_PRIMARY_MIN = 0.05
const FREQ_PRIMARY_MAX = 0.21
const FREQ_SECONDARY_MIN = 0.02
const FREQ_SECONDARY_MAX = 0.12

const WORLD_TO_VIEWPORT_SCALE = 0.42

export interface DispersePosition {
  x: number
  y: number
}

interface DriftParams {
  f1x: number
  f1y: number
  f2x: number
  f2y: number
  p1x: number
  p1y: number
  p2x: number
  p2y: number
  baseX: number
  baseY: number
}

interface CellMotion {
  spawnDelayMs: number
  spawnDurationMs: number
  targetX: number
  targetY: number
  drift: DriftParams
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function easeOutCubic(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

function buildCellMotion(): CellMotion {
  const angle = Math.random() * Math.PI * 2
  const radius = Math.sqrt(Math.random()) * SPAWN_RADIUS

  const p1x = Math.random() * Math.PI * 2
  const p1y = Math.random() * Math.PI * 2
  const p2x = Math.random() * Math.PI * 2
  const p2y = Math.random() * Math.PI * 2

  return {
    spawnDelayMs: Math.random() * SPAWN_DELAY_MAX_MS,
    spawnDurationMs: randRange(SPAWN_DURATION_MIN_MS, SPAWN_DURATION_MAX_MS),
    targetX: Math.cos(angle) * radius,
    targetY: Math.sin(angle) * radius,
    drift: {
      f1x: randRange(FREQ_PRIMARY_MIN, FREQ_PRIMARY_MAX),
      f1y: randRange(FREQ_PRIMARY_MIN, FREQ_PRIMARY_MAX),
      f2x: randRange(FREQ_SECONDARY_MIN, FREQ_SECONDARY_MAX),
      f2y: randRange(FREQ_SECONDARY_MIN, FREQ_SECONDARY_MAX),
      p1x,
      p1y,
      p2x,
      p2y,
      baseX: Math.sin(p1x) * 0.6 + Math.cos(p2x) * 0.4,
      baseY: Math.cos(p1y) * 0.6 + Math.sin(p2y) * 0.4,
    },
  }
}

export function useDisperseLayout(
  ids: Ref<readonly string[] | undefined>,
  container: Ref<HTMLElement | null>,
) {
  const positions = shallowRef<Map<string, DispersePosition>>(new Map())
  let motions = new Map<string, CellMotion>()
  let startTime = 0
  let rafId = 0

  function tick(now: number) {
    const el = container.value
    if (!el) {
      rafId = requestAnimationFrame(tick)
      return
    }

    const w = el.clientWidth
    const h = el.clientHeight
    const cx = w / 2
    const cy = h / 2
    const halfSize = Math.min(w, h) * WORLD_TO_VIEWPORT_SCALE

    const elapsedSec = (now - startTime) / 1000
    const next = new Map<string, DispersePosition>()

    motions.forEach((m, id) => {
      const burstT = (now - startTime - m.spawnDelayMs) / m.spawnDurationMs

      let wx: number
      let wy: number

      if (burstT < 1) {
        const eased = easeOutCubic(Math.max(0, Math.min(1, burstT)))
        wx = m.targetX * eased
        wy = m.targetY * eased
      } else {
        const d = m.drift
        const t = elapsedSec / DISPERSE_MOVE_SPEED
        const waveX =
          (Math.sin(t * d.f1x + d.p1x) * 0.6 + Math.cos(t * d.f2x + d.p2x) * 0.4) -
          d.baseX
        const waveY =
          (Math.cos(t * d.f1y + d.p1y) * 0.6 + Math.sin(t * d.f2y + d.p2y) * 0.4) -
          d.baseY
        wx = m.targetX + waveX * DISPERSE_MOVE_DISTANCE
        wy = m.targetY + waveY * DISPERSE_MOVE_DISTANCE
      }

      next.set(id, { x: cx + wx * halfSize, y: cy + wy * halfSize })
    })

    positions.value = next
    rafId = requestAnimationFrame(tick)
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  function start(idList: readonly string[]) {
    stop()
    motions = new Map()
    const initial = new Map<string, DispersePosition>()
    for (const id of idList) {
      motions.set(id, buildCellMotion())
      initial.set(id, { x: 0, y: 0 })
    }
    positions.value = initial
    startTime = performance.now()
    rafId = requestAnimationFrame(tick)
  }

  onMounted(() => {
    if (ids.value && ids.value.length) start(ids.value)
  })

  watch(ids, (next) => {
    if (next && next.length) start(next)
    else stop()
  })

  onBeforeUnmount(stop)

  return { positions }
}
