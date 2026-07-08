import { io } from 'socket.io-client'

function resolveUrl() {
  const raw = import.meta.env.VITE_API_URL || ''
  if (!raw) return ''
  const url = new URL(raw)
  url.hostname = window.location.hostname
  return url.toString().replace(/\/$/, '')
}

export const socket = io(resolveUrl(), {
  autoConnect: false,
  withCredentials: true,
})
