import { io, Socket } from 'socket.io-client'

const rawSocketUrl =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8080'
const SOCKET_URL = rawSocketUrl.endsWith('/')
  ? rawSocketUrl.slice(0, -1)
  : rawSocketUrl

let socket: Socket | null = null

export function getSocket(token?: string): Socket {
  const currentToken =
    token || (typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '')

  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token: currentToken },
      autoConnect: true,
      transports: ['websocket', 'polling'],
    })
  } else if (token && socket.auth && (socket.auth as { token: string }).token !== token) {
    socket.disconnect()
    socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: true,
      transports: ['websocket', 'polling'],
    })
  }

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
