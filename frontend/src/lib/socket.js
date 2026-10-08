import { io } from 'socket.io-client'
import { isDemoRoute } from './demo'

function resolveUrl() {
  const raw = import.meta.env.VITE_API_URL || ''
  if (!raw) return ''
  const url = new URL(raw)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.hostname = window.location.hostname
  }
  return url.toString().replace(/\/$/, '')
}

export const socket = io(resolveUrl(), {
  autoConnect: false,
  withCredentials: true,
  auth: (cb) => {
    cb({ token: localStorage.getItem('knowme_auth_token') })
  },
})

const demoOnlineIds = ['demo-luna', 'demo-mateo', 'demo-valen', 'demo-thiago', 'demo-cami']
const realOn = socket.on.bind(socket)
const realOff = socket.off.bind(socket)
const realEmit = socket.emit.bind(socket)
const realConnect = socket.connect.bind(socket)
const realDisconnect = socket.disconnect.bind(socket)

socket.connect = (...args) => {
  if (isDemoRoute()) return socket
  return realConnect(...args)
}

socket.disconnect = (...args) => {
  if (isDemoRoute()) return socket
  return realDisconnect(...args)
}

socket.on = (event, handler) => {
  if (!isDemoRoute()) return realOn(event, handler)
  if (event === 'users:online' && typeof handler === 'function') {
    queueMicrotask(() => handler({ userIds: demoOnlineIds }))
  }
  return socket
}

socket.off = (...args) => {
  if (isDemoRoute()) return socket
  return realOff(...args)
}

socket.emit = (...args) => {
  if (isDemoRoute()) return socket
  return realEmit(...args)
}
