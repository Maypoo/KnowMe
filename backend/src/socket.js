import { Server } from 'socket.io'
import { supabase } from '../lib/supabase.js'

let io
const onlineUsers = new Set()
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('show_activity')
      .eq('id', user.id)
      .maybeSingle()

    socket.showActivity = profile?.show_activity !== false
    next()
  })

  io.on('connection', async (socket) => {
    socket.join(socket.user.id)
    onlineUsers.add(socket.user.id)

    if (socket.showActivity) {
      socket.broadcast.emit('user:online', { userId: socket.user.id })
    }

    const { data: onlineProfiles } = await supabase
      .from('profiles')
      .select('id')
      .in('id', [...onlineUsers])
      .eq('show_activity', true)

    const visibleIds = onlineProfiles ? onlineProfiles.map(p => p.id) : []
    socket.emit('users:online', { userIds: visibleIds })

    socket.on('chat:typing', (data) => {
      const { targetUserId, chatId } = data
      if (!targetUserId || !chatId) return
      io.to(targetUserId).emit('chat:typing', { userId: socket.user.id, chatId })
    })

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
      onlineUsers.delete(socket.user.id)
      supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', socket.user.id).then().catch(() => {})
      if (socket.showActivity) {
        socket.broadcast.emit('user:offline', { userId: socket.user.id })
      }
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

export function isUserOnline(userId) {
  return onlineUsers.has(userId)
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
