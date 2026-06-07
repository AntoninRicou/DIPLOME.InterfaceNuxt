import { io, type Socket } from 'socket.io-client'

const ROLE = 'interface'

let socket: Socket | null = null
let onRegisterCallbacks: Array<() => void> = []

function ensureSocket(url: string): Socket {
  if (socket) return socket

  socket = io(url, {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 500,
  })

  socket.on('connect', () => {
    socket!.emit('register', ROLE, (res: unknown) => {
      console.log('[socket] registered', res)
      for (const cb of onRegisterCallbacks) {
        try {
          cb()
        } catch (err) {
          console.warn('[socket] onRegister callback failed', err)
        }
      }
    })
  })

  socket.on('connect_error', (err: Error) => {
    console.warn('[socket] connect_error', err.message)
  })

  socket.on('disconnect', (reason: string) => {
    console.log('[socket] disconnected', reason)
  })

  return socket
}

export function useProjectSocket() {
  const config = useRuntimeConfig()
  const url = config.public.socketUrl as string

  function init(): void {
    if (import.meta.server) return
    ensureSocket(url)
  }

  function onRegister(cb: () => void): void {
    if (import.meta.server) return
    onRegisterCallbacks.push(cb)
  }

  function focus(id: string): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping focus', id)
      return false
    }
    socket.emit('message', { type: 'focus', payload: { id } })
    return true
  }

  function setState(name: string, duration?: number): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-state', name)
      return false
    }
    const payload: { name: string; duration?: number } = { name }
    if (typeof duration === 'number') payload.duration = duration
    socket.emit('message', { type: 'set-state', payload })
    return true
  }

  // `quadrant` (0=tl,1=tr,2=bl,3=br) is the quadrant of the clicked image —
  // project uses it to colour the segment (see project/src/pathColors.js).
  // Interface stays colour-blind: it sends WHICH quadrant, not a colour.
  // Omitted for the explore-others foreign-path redraw (project falls back to
  // its default/override colour).
  function pathSegment(fromId: string, toId: string, quadrant?: number): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping path-segment', fromId, toId)
      return false
    }
    const payload: { fromId: string; toId: string; quadrant?: number } = { fromId, toId }
    if (typeof quadrant === 'number') payload.quadrant = quadrant
    socket.emit('message', { type: 'path-segment', payload })
    return true
  }

  function pathTruncate(keepCount: number): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping path-truncate', keepCount)
      return false
    }
    socket.emit('message', { type: 'path-truncate', payload: { keepCount } })
    return true
  }

  function pathClear(): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping path-clear')
      return false
    }
    socket.emit('message', { type: 'path-clear', payload: {} })
    return true
  }

  function setMask(opacity: number, duration = 0): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-mask', opacity, duration)
      return false
    }
    socket.emit('message', { type: 'set-mask', payload: { opacity, duration } })
    return true
  }

  function setCanvasBg(mode: 'black' | 'gradient'): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-canvas-bg', mode)
      return false
    }
    socket.emit('message', { type: 'set-canvas-bg', payload: { mode } })
    return true
  }

  function setCanvasVeil(active: boolean): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-canvas-veil', active)
      return false
    }
    socket.emit('message', { type: 'set-canvas-veil', payload: { active } })
    return true
  }

  function setHighlight(id: string | null): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-highlight', id)
      return false
    }
    socket.emit('message', { type: 'set-highlight', payload: { id } })
    return true
  }

  function setMarks(ids: string[]): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-marks', ids)
      return false
    }
    socket.emit('message', { type: 'set-marks', payload: { ids } })
    return true
  }

  function setGhostPath(fromId: string | null, toId: string | null): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-ghost-path', fromId, toId)
      return false
    }
    socket.emit('message', { type: 'set-ghost-path', payload: { fromId, toId } })
    return true
  }

  function setCanvasZoom(canvasIndex: number, imageId: string, durationSec?: number): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-canvas-zoom', canvasIndex, imageId)
      return false
    }
    const payload: { canvasIndex: number; imageId: string; durationSec?: number } = { canvasIndex, imageId }
    if (typeof durationSec === 'number') payload.durationSec = durationSec
    socket.emit('message', { type: 'set-canvas-zoom', payload })
    return true
  }

  function setCanvasOverview(canvasIndex: number, durationSec?: number): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-canvas-overview', canvasIndex)
      return false
    }
    const payload: { canvasIndex: number; durationSec?: number } = { canvasIndex }
    if (typeof durationSec === 'number') payload.durationSec = durationSec
    socket.emit('message', { type: 'set-canvas-overview', payload })
    return true
  }

  function setCornerLabels(visible: boolean): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-corner-labels', visible)
      return false
    }
    socket.emit('message', { type: 'set-corner-labels', payload: { visible } })
    return true
  }

  // Per-quadrant corner-label reveal — the granular sibling of the
  // all-or-nothing `set-corner-labels`. VIEW_3 emits one of these per
  // quadrant cross click so each project corner label pops in lockstep
  // with the matching interface label, instead of all four at once.
  function setCornerLabel(canvasIndex: number, visible: boolean): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-corner-label', canvasIndex)
      return false
    }
    socket.emit('message', { type: 'set-corner-label', payload: { canvasIndex, visible } })
    return true
  }

  function setCanvasText(canvasIndex: number, title: string, body: string): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-canvas-text', canvasIndex)
      return false
    }
    socket.emit('message', { type: 'set-canvas-text', payload: { canvasIndex, title, body } })
    return true
  }

  // `variant` lets project style the mirrored rotating-intro captions
  // (VIEW_2/VIEW_3) like the interface (bigger + blue-grey stroke) while the
  // default modes-caption / image-credit keep project's plain center style.
  function setCenterCaption(
    text: string,
    variant: 'default' | 'rotate' = 'default',
    allowSingle = false,
  ): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-center-caption')
      return false
    }
    socket.emit('message', { type: 'set-center-caption', payload: { text, variant, allowSingle } })
    return true
  }

  // Arms/disarms the project-side single-explore map label (the top-left
  // name of the auto-cycling map). Enabled on entering the single explore
  // view; cleared on Start over (fade) and on every (re)connect (hygiene).
  function setMapLabel(active: boolean): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-map-label', active)
      return false
    }
    socket.emit('message', { type: 'set-map-label', payload: { active } })
    return true
  }

  // Map-words overlay data — per-zone "characteristic word" labels for the
  // explore-single Form/Source maps. `{ form: [{id,text}], source: [{id,text}] }`;
  // empty arrays disarm it (boot hygiene).
  function pathFadeOut(): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) return false
    socket.emit('message', { type: 'path-fade-out', payload: {} })
    return true
  }

  function setMapWords(words: { form: { id: string; text: string }[]; source: { id: string; text: string }[]; semantic: { id: string; text: string }[]; time: { id: string; text: string }[] }): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping set-map-words')
      return false
    }
    socket.emit('message', { type: 'set-map-words', payload: words })
    return true
  }

  function isConnected(): boolean {
    return Boolean(socket && socket.connected)
  }

  return { init, onRegister, focus, setState, pathSegment, pathTruncate, pathClear, pathFadeOut, setMask, setCanvasBg, setCanvasVeil, setHighlight, setMarks, setGhostPath, setCanvasZoom, setCanvasOverview, setCornerLabels, setCornerLabel, setCanvasText, setCenterCaption, setMapLabel, setMapWords, isConnected }
}
