// Tiny interaction-sound helper. Interface-only feedback (never on the wire,
// never touches project) — same layer as the other interaction composables.
//
// Web Audio based so the same clip can fire rapidly and overlap without
// waiting for the previous play to finish (a hover can re-trigger many times
// a second). Buffers are decoded once and shared across all callers; the
// AudioContext is created lazily and resumed on first play so it satisfies the
// browser autoplay gate (the experience always has earlier clicks, so the
// context is unlockable by the time any hover fires).
//
// General-purpose: pass any URL under /sounds/. Today only the relation-view
// image hover uses it, but any view can `load()` + `play()` its own clip.

let ctx: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
const loading = new Map<string, Promise<void>>()

function ensureCtx(): AudioContext | null {
  if (import.meta.server) return null
  if (!ctx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    ctx = new Ctx()
  }
  return ctx
}

export function useSound() {
  // Decode a clip once and cache it. Safe to call repeatedly / from many
  // components — concurrent loads of the same url share one promise.
  function load(url: string): Promise<void> {
    if (import.meta.server) return Promise.resolve()
    if (buffers.has(url)) return Promise.resolve()
    if (loading.has(url)) return loading.get(url)!
    const ac = ensureCtx()
    if (!ac) return Promise.resolve()
    const p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ac.decodeAudioData(b))
      .then((buf) => { buffers.set(url, buf) })
      .catch(() => { /* missing/undecodable clip → silently no-op */ })
      .finally(() => { loading.delete(url) })
    loading.set(url, p)
    return p
  }

  // Fire-and-forget playback. No-op until the clip is loaded. `volume` 0..1.
  function play(url: string, volume = 0.5): void {
    const ac = ensureCtx()
    const buf = buffers.get(url)
    if (!ac || !buf) return
    if (ac.state === 'suspended') ac.resume()
    const src = ac.createBufferSource()
    const gain = ac.createGain()
    gain.gain.value = volume
    src.buffer = buf
    src.connect(gain).connect(ac.destination)
    src.start()
  }

  return { load, play }
}
