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

  function pathSegment(fromId: string, toId: string): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping path-segment', fromId, toId)
      return false
    }
    socket.emit('message', { type: 'path-segment', payload: { fromId, toId } })
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

  function isConnected(): boolean {
    return Boolean(socket && socket.connected)
  }

  return { init, onRegister, focus, setState, pathSegment, pathTruncate, pathClear, setMask, isConnected }
}
