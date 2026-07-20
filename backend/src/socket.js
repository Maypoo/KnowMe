import { Server } from 'socket.io'
import { supabase } from '../lib/supabase.js'

let io
const inCall = new Set()
const callPairs = new Map()

export function setupSocket(server) {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        const allowed = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim())
        if (!origin || allowed.includes(origin)) return callback(null, true)
        try {
          const hostname = new URL(origin).hostname
          const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
            hostname.startsWith('172.')
          callback(null, isLocal)
        } catch (err) {
          console.error(err)
          callback(null, false)
        }
      },
      credentials: true,
    },
  })

  io.use(async (socket, next) => {
    let token = socket.handshake.auth?.token

    if (!token) {
      const cookieHeader = socket.handshake.headers.cookie || ''
      const cookies = {}
      cookieHeader.split(';').forEach(c => {
        const idx = c.indexOf('=')
        if (idx > 0) {
          cookies[c.substring(0, idx).trim()] = c.substring(idx + 1).trim()
        }
      })
      token = cookies['sb-access-token']
    }

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

    socket.on('signal:offer', async (data) => {
      try {
        const { targetUserId, sdp } = data
        if (!targetUserId || !sdp) {
          io.to(socket.user.id).emit('call:debug', { error: 'missing_params', targetUserId })
          return
        }

        if (inCall.has(targetUserId) || inCall.has(socket.user.id)) {
          io.to(socket.user.id).emit('call:busy', { targetUserId })
          return
        }

        io.to(socket.user.id).emit('call:ack', { targetUserId })

        const { data: profile } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', socket.user.id)
          .maybeSingle()

        inCall.add(socket.user.id)
        callPairs.set(socket.user.id, targetUserId)
        callPairs.set(targetUserId, socket.user.id)
        io.to(targetUserId).emit('signal:offer', {
          caller: {
            id: socket.user.id,
            username: profile?.display_name || profile?.username || 'Desconocido',
            avatar_url: profile?.avatar_url || null,
          },
          sdp,
        })
      } catch (err) {
        console.error(err)
        inCall.delete(socket.user.id)
        io.to(socket.user.id).emit('call:busy', { targetUserId: data?.targetUserId })
      }
    })

    socket.on('signal:answer', (data) => {
      try {
        const { targetUserId, sdp } = data
        if (!targetUserId || !sdp) return

        inCall.add(socket.user.id)
        io.to(targetUserId).emit('signal:answer', {
          sdp,
        })
      } catch (err) { console.error(err) }
    })

    socket.on('signal:ice-candidate', (data) => {
      try {
        const { targetUserId, candidate } = data
        if (!targetUserId || !candidate) return

        io.to(targetUserId).emit('signal:ice-candidate', {
          candidate,
        })
      } catch (err) { console.error(err) }
    })

    socket.on('call:mute', (data) => {
      try {
        const { targetUserId, muted } = data
        if (!targetUserId) return
        io.to(targetUserId).emit('call:mute', { userId: socket.user.id, muted })
      } catch (err) { console.error(err) }
    })

    socket.on('call:end', (data) => {
      try {
        const { targetUserId } = data
        inCall.delete(socket.user.id)
        inCall.delete(targetUserId)
        callPairs.delete(socket.user.id)
        callPairs.delete(targetUserId)
        if (targetUserId) {
          io.to(targetUserId).emit('call:end', {})
        }
      } catch (err) { console.error(err) }
    })

    socket.on('disconnect', () => {
      inCall.delete(socket.user.id)
      const partnerId = callPairs.get(socket.user.id)
      if (partnerId) {
        inCall.delete(partnerId)
        callPairs.delete(partnerId)
        io.to(partnerId).emit('call:end', {})
      }
      callPairs.delete(socket.user.id)
    })
  })

  return io
}

export function getIO() {
  return io
}

export function isInCall(userId) {
  return inCall.has(userId)
}

export function addToCall(userId) {
  inCall.add(userId)
}

export function removeFromCall(userId) {
  inCall.delete(userId)
}
