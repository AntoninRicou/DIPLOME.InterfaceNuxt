import { io, type Socket } from 'socket.io-client'

const ROLE = 'interface'

let socket: Socket | null = null

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

  function focus(id: string): boolean {
    if (import.meta.server) return false
    if (!socket || !socket.connected) {
      console.warn('[socket] not connected; dropping focus', id)
      return false
    }
    socket.emit('message', { type: 'focus', payload: { id } })
    return true
  }

  function isConnected(): boolean {
    return Boolean(socket && socket.connected)
  }

  return { init, focus, isConnected }
}
