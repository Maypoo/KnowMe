import { Server } from 'socket.io'
import { supabase } from '../lib/supabase.js'

let io

export function setupSocket(server) {
  io = new Server(server, {
    cors: {
      origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()),
      credentials: true,
    },
  })

  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie || ''
    const cookies = {}
    cookieHeader.split(';').forEach(c => {
      const idx = c.indexOf('=')
      if (idx > 0) {
        cookies[c.substring(0, idx).trim()] = c.substring(idx + 1).trim()
      }
    })

    const token = cookies['sb-access-token']
    if (!token) {
      return next(new Error('No autenticado'))
    }

    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      return next(new Error('Token inválido'))
    }

    socket.user = user
    next()
  })

  io.on('connection', (socket) => {
    socket.join(socket.user.id)

    socket.on('disconnect', () => {})
  })

  return io
}

export function getIO() {
  return io
}
