import crypto from 'crypto'
import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import auth from './middleware/auth.js'
import { supabase } from './lib/supabase.js'
import sharp from 'sharp'
import { setupSocket, getIO, isInCall, addToCall, removeFromCall } from './src/socket.js'

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

const app = express()

app.use(helmet())
app.set('trust proxy', 1)

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim())

function isLocalOrigin(origin) {
  if (!origin) return false
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
      hostname.startsWith('172.')
  } catch (err) {
    console.error(err)
    return false
  }
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || isLocalOrigin(origin)) {
      callback(null, true)
    } else {
      callback(new Error('No autorizado por CORS'))
    }
  },
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(cookieParser())

const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()

  const origin = req.headers.origin
  const referer = req.headers.referer

  if (!origin && !referer) {
    return res.status(403).json({ error: 'Origen no válido' })
  }

  const source = (origin || referer || '').replace(/\/$/, '')
  const isAllowed = allowedOrigins.includes(source) || isLocalOrigin(source)

  if (!isAllowed) {
    return res.status(403).json({ error: 'Origen no permitido' })
  }

  next()
}

app.use(csrfProtection)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Demasiadas solicitudes. Esperá un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
})

app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return generalLimiter(req, res, next)
  }
  next()
})

const rotatedTokens = new Map()
setInterval(() => {
  const cutoff = Date.now() - 3600000
  for (const [key, val] of rotatedTokens) {
    if (val.timestamp < cutoff) rotatedTokens.delete(key)
  }
}, 300000)

const TOP_LEVEL_KEYS = ['ip', 'user_agent']
const META_KEYS = ['reason', 'method', 'username']

async function auditLog(event, userId, email, metadata = {}) {
  const topLevel = {}
  const meta = {}
  for (const [k, v] of Object.entries(metadata)) {
    if (TOP_LEVEL_KEYS.includes(k)) topLevel[k] = v
    else if (META_KEYS.includes(k)) meta[k] = v
  }
  const entry = { event, user_id: userId, email, ...topLevel, metadata: meta, timestamp: new Date().toISOString() }
  try {
    console.log(JSON.stringify({ type: 'audit', ...entry }))
    await supabase.from('audit_logs').insert(entry)
  } catch (err) { console.error(err) }
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
}

function sanitize(str) {
  return str.replace(/[<>"']/g, '').trim()
}

async function findChatId(userId1, userId2) {
  const [r1, r2] = await Promise.all([
    supabase.from('chat_participants').select('chat_id').eq('user_id', userId1),
    supabase.from('chat_participants').select('chat_id').eq('user_id', userId2),
  ])
  if (r1.data && r2.data) {
    const set1 = new Set(r1.data.map(c => c.chat_id))
    const common = r2.data.filter(c => set1.has(c.chat_id))
    if (common.length > 0) return common[0].chat_id
  }
  return null
}

async function findOrCreateChat(userId1, userId2) {
  const existing = await findChatId(userId1, userId2)
  if (existing) return existing
  const { data: chat } = await supabase.from('chats').insert({}).select().single()
  if (!chat) return null
  await Promise.all([
    supabase.from('chat_participants').insert({ chat_id: chat.id, user_id: userId1 }),
    supabase.from('chat_participants').insert({ chat_id: chat.id, user_id: userId2 }),
  ])
  return chat.id
}

async function insertMissedCall(callerId, targetId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', callerId)
    .maybeSingle()
  if (!profile) return

  const chatId = await findOrCreateChat(callerId, targetId)
  if (!chatId) return

  const content = `Llamada perdida de ${profile.display_name || profile.username}`

  const { data: message } = await supabase
    .from('chat_messages')
    .insert({ chat_id: chatId, sender_id: callerId, content })
    .select()
    .single()

  if (message) {
    const io = getIO()
    if (io) {
      for (const uid of [callerId, targetId]) {
        io.to(uid).emit('new_message', { chatId, message })
      }
    }
  }
}

function escapeILike(str) {
  return str.replace(/_/g, '\\_').replace(/%/g, '\\%')
}

function withDisplayName(profile) {
  if (!profile) return profile
  return { ...profile, username: profile.display_name || profile.username }
}

async function getUsernameChangeLimits(userId) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: changes, error } = await supabase
    .from('username_changes')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) return { remaining: 3, nextAvailable: null }

  const count = changes.length
  const remaining = Math.max(0, 3 - count)

  let nextAvailable = null
  if (count >= 3) {
    const oldest = changes[changes.length - 1]
    const nextDate = new Date(new Date(oldest.created_at).getTime() + 14 * 24 * 60 * 60 * 1000)
    nextAvailable = nextDate.toISOString()
  }

  return { remaining, nextAvailable }
}

async function uploadAvatar(userId, base64) {
  const matches = base64.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/)
  if (!matches) return null

  const { data: files } = await supabase.storage
    .from('avatars')
    .list(userId)

  if (files && files.length > 0) {
    const paths = files.map(f => `${userId}/${f.name}`)
    await supabase.storage.from('avatars').remove(paths)
  }

  const filePath = `${userId}/avatar_${Date.now()}.webp`

  let webpBuffer
  try {
    webpBuffer = await sharp(Buffer.from(matches[2], 'base64'))
      .resize(200, 200, { fit: 'cover' })
      .webp()
      .toBuffer()
  } catch (err) {
    console.error(err)
    return null
  }

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, webpBuffer, {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000',
      upsert: true,
    })

  if (uploadError) return null

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath)

  return publicUrl
}

function setSessionCookies(res, session) {
  res.cookie('sb-access-token', session.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: session.expires_in * 1000,
  })
  res.cookie('sb-refresh-token', session.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: session.expires_in * 1000,
  })
}

function clearSessionCookies(res) {
  res.clearCookie('sb-access-token', { path: '/' })
  res.clearCookie('sb-refresh-token', { path: '/' })
}

app.post('/api/auth/refresh', authLimiter, asyncHandler(async (req, res) => {
  const refreshToken = req.cookies['sb-refresh-token']

  if (!refreshToken) {
    return res.status(401).json({ error: 'No hay sesión para refrescar' })
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })

  if (error) {
    const rotated = rotatedTokens.get(tokenHash)
    if (rotated && Date.now() - rotated.timestamp < 3600000) {
      await supabase.auth.admin.signOut(rotated.userId)
      auditLog('refresh_token_reuse', rotated.userId, null, { ip: req.ip, user_agent: req.headers['user-agent'] })
      rotatedTokens.delete(tokenHash)
      clearSessionCookies(res)
      return res.status(401).json({ error: 'Sesión comprometida. Iniciá sesión nuevamente.' })
    }
    clearSessionCookies(res)
    auditLog('refresh_failed', null, null, { reason: error.message, ip: req.ip, user_agent: req.headers['user-agent'] })
    return res.status(401).json({ error: 'Sesión expirada' })
  }

  rotatedTokens.set(tokenHash, { userId: data.user.id, timestamp: Date.now() })
  setSessionCookies(res, data.session)
  auditLog('refresh_success', data.user.id, data.user.email, { ip: req.ip, user_agent: req.headers['user-agent'] })
  res.json({ user: data.user })
}))

app.post('/api/auth/logout', authLimiter, asyncHandler(async (req, res) => {
  const token = req.cookies['sb-access-token']
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) {
      await supabase.auth.admin.signOut(user.id)
      auditLog('logout', user.id, user.email, { ip: req.ip, user_agent: req.headers['user-agent'] })
    }
  }
  clearSessionCookies(res)
  res.json({ message: 'Sesión cerrada' })
}))

app.post('/api/auth/delete-account', authLimiter, asyncHandler(async (req, res) => {
  const { access_token, refresh_token } = req.body

  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: 'Token requerido' })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(access_token)

  if (userError || !user) {
    return res.status(401).json({ error: 'Token inválido' })
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)

  if (deleteError) {
    auditLog('delete_account_failed', user.id, user.email, { reason: deleteError.message, ip: req.ip, user_agent: req.headers['user-agent'] })
    return res.status(500).json({ error: 'Error al eliminar la cuenta' })
  }

  clearSessionCookies(res)
  auditLog('delete_account', user.id, user.email, { ip: req.ip, user_agent: req.headers['user-agent'] })
  res.json({ message: 'Cuenta eliminada' })
}))

app.post('/api/auth/google', authLimiter, asyncHandler(async (req, res) => {
  const { access_token, refresh_token } = req.body

  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: 'Token requerido' })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(access_token)

  if (userError || !user) {
    return res.status(401).json({ error: 'Token inválido' })
  }

  setSessionCookies(res, {
    access_token,
    refresh_token,
    expires_in: 3600,
  })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profile) {
    auditLog('login_success', user.id, user.email, { method: 'google', ip: req.ip, user_agent: req.headers['user-agent'] })
    return res.json({ user, profile, needsUsername: false })
  }

  auditLog('register_google_pending', user.id, user.email, { ip: req.ip, user_agent: req.headers['user-agent'] })
  return res.json({ user: { id: user.id, email: user.email }, needsUsername: true })
}))

app.post('/api/auth/setup-username', authLimiter, asyncHandler(async (req, res) => {
  const { username, avatar, access_token } = req.body

  let user
  const cookieToken = req.cookies['sb-access-token']

  if (cookieToken) {
    const { data, error } = await supabase.auth.getUser(cookieToken)
    if (!error && data?.user) user = data.user
  }

  if (!user && access_token) {
    const { data, error } = await supabase.auth.getUser(access_token)
    if (!error && data?.user) user = data.user
  }

  if (!user) {
    return res.status(401).json({ error: 'No autenticado' })
  }

  if (!username) {
    return res.status(400).json({ error: 'El nombre de usuario es obligatorio' })
  }

  if (!/^@(?=.*[a-zA-Z])[a-zA-Z0-9_.]+$/.test(username)) {
    return res.status(400).json({ error: 'El username debe tener al menos 1 letra, y solo puede contener letras, números, guión bajo y punto' })
  }

  if (username.length < 2 || username.length > 21) {
    return res.status(400).json({ error: 'El username debe tener de 1 a 20 caracteres (sin contar el @)' })
  }

  const sanitizedUsername = sanitize(username)
  const lowerUsername = sanitizedUsername.toLowerCase()

  const { data: existing } = await supabase
    .from('profiles')
    .select('username')
    .ilike('username', escapeILike(lowerUsername))
    .maybeSingle()

  if (existing) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso' })
  }

  let avatarUrl = avatar ? await uploadAvatar(user.id, avatar) : null

  const profileData = { id: user.id, username: lowerUsername, display_name: sanitizedUsername, email: user.email }
  if (avatarUrl) profileData.avatar_url = avatarUrl

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert(profileData)
    .select()
    .maybeSingle()

  if (profileError) {
    return res.status(400).json({ error: 'Error al crear el perfil' })
  }

  if (profile) {
    profile.username = profile.display_name || profile.username
  }

  auditLog('register_google_complete', user.id, user.email, { username, ip: req.ip, user_agent: req.headers['user-agent'] })
  res.json({ profile })
}))

app.get('/api/auth/me', auth, asyncHandler(async (req, res) => {
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .maybeSingle()

  if (profile) {
    profile = withDisplayName(profile)
  }

  let followerCount = 0
  let followingCount = 0
  let friendCount = 0

  if (profile) {
    const [{ count: f1 }, { count: f2 }] = await Promise.all([
      supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
      supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
    ])
    followerCount = f1 || 0
    followingCount = f2 || 0

    const { count: fc } = await supabase
      .from('friend_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
    friendCount = fc || 0
  }

  const limits = profile ? await getUsernameChangeLimits(profile.id) : { remaining: 3, nextAvailable: null }

  res.json({
    user: req.user,
    profile: profile
      ? { ...profile, follower_count: followerCount, following_count: followingCount, friend_count: friendCount }
      : { username: req.user.user_metadata?.username || null },
    limits,
  })
}))

app.get('/api/profile/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .ilike('username', escapeILike(sanitized.toLowerCase()))
    .maybeSingle()

  if (!profile) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  profile.username = profile.display_name || profile.username

  const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
    supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
    supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
  ])

  const { count: friendCount } = await supabase
    .from('friend_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)

  const friendCountVal = friendCount || 0

  let isFollowing = false
  let friendRequestStatus = null

  if (req.user.id !== profile.id) {
    const [{ count: followCount }, { data: friendReq }] = await Promise.all([
      supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', req.user.id).eq('following_id', profile.id),
      supabase.from('friend_requests').select('status').or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${req.user.id})`).maybeSingle(),
    ])
    isFollowing = (followCount || 0) > 0
    friendRequestStatus = friendReq?.status || null
  }

  res.json({
    profile: {
      ...profile,
      follower_count: followerCount || 0,
      following_count: followingCount || 0,
      friend_count: friendCountVal,
      is_following: isFollowing,
      friend_request_status: friendRequestStatus,
    },
  })
}))

app.get('/api/users/search', auth, asyncHandler(async (req, res) => {
  const q = req.query.q

  if (!q || q.length < 1) {
    return res.status(400).json({ error: 'Búsqueda muy corta' })
  }

  const sanitized = sanitize(q)

  const { data: users } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', `%${escapeILike(sanitized.toLowerCase())}%`)
    .limit(10)

  const mapped = (users || []).map(u => ({ ...u, username: u.display_name || u.username }))
  res.json({ users: mapped })
}))

app.post('/api/friends/request', auth, asyncHandler(async (req, res) => {
  const { username } = req.body

  if (!username || !/^@(?=.*[a-zA-Z])[a-zA-Z0-9_.]+$/.test(username)) {
    return res.status(400).json({ error: 'Nombre de usuario inválido' })
  }

  if (username.length < 2 || username.length > 21) {
    return res.status(400).json({ error: 'El username debe tener de 1 a 20 caracteres (sin contar el @)' })
  }

  const { data: target } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .ilike('username', escapeILike(sanitize(username).toLowerCase()))
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'No podés enviarte una solicitud a vos mismo' })
  }

  const { data: existing } = await supabase
    .from('friend_requests')
    .select('id, status')
    .or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${target.id}),and(sender_id.eq.${target.id},receiver_id.eq.${req.user.id})`)
    .maybeSingle()

  if (existing) {
    if (existing.status === 'accepted') {
      return res.status(409).json({ error: 'Ya son amigos' })
    }
    if (existing.status === 'pending') {
      return res.status(409).json({ error: 'Ya hay una solicitud pendiente' })
    }
    if (existing.status === 'rejected') {
      await supabase
        .from('friend_requests')
        .delete()
        .eq('id', existing.id)
    }
  }

  const { data: request, error: insertError } = await supabase
    .from('friend_requests')
    .insert({ sender_id: req.user.id, receiver_id: target.id })
    .select('id, sender_id, receiver_id, status, created_at')
    .single()

  if (insertError) {
    return res.status(400).json({ error: 'Error al enviar la solicitud' })
  }

  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', req.user.id)
    .maybeSingle()

  const io = getIO()
  if (io) {
    io.to(target.id).emit('friend_request_received', {
      id: request.id,
      sender: { id: req.user.id, username: sanitize(senderProfile?.display_name || senderProfile?.username || 'Desconocido'), avatar_url: senderProfile?.avatar_url || null },
      status: 'pending',
    })
  }

  res.json({ message: 'Solicitud enviada', requestId: request.id })
}))

app.get('/api/friends/requests', auth, asyncHandler(async (req, res) => {
  const { data: requests } = await supabase
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status, created_at')
    .eq('receiver_id', req.user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (!requests || requests.length === 0) {
    return res.json({ requests: [] })
  }

  const senderIds = requests.map(r => r.sender_id)
  const { data: senders } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', senderIds)

  const senderMap = {}
  if (senders) {
    for (const s of senders) {
      senderMap[s.id] = { username: sanitize(s.display_name || s.username), avatar_url: s.avatar_url }
    }
  }

  const enriched = requests.map(r => ({
    id: r.id,
    sender: { id: r.sender_id, username: senderMap[r.sender_id]?.username || 'Desconocido', avatar_url: senderMap[r.sender_id]?.avatar_url || null },
    status: r.status,
    createdAt: r.created_at,
  }))

  res.json({ requests: enriched })
}))

app.get('/api/friends/requests/count', auth, asyncHandler(async (req, res) => {
  const { count } = await supabase
    .from('friend_requests')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', req.user.id)
    .eq('status', 'pending')

  res.json({ count: count || 0 })
}))

app.post('/api/friends/respond', auth, asyncHandler(async (req, res) => {
  const { requestId, action } = req.body

  if (!requestId || !action || !['accepted', 'rejected'].includes(action)) {
    return res.status(400).json({ error: 'Solicitud inválida' })
  }

  const { data: request } = await supabase
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status')
    .eq('id', requestId)
    .single()

  if (!request) {
    return res.status(404).json({ error: 'Solicitud no encontrada' })
  }

  if (request.receiver_id !== req.user.id) {
    return res.status(403).json({ error: 'No podés responder esta solicitud' })
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Esta solicitud ya fue respondida' })
  }

  const io = getIO()

  const { data: responderProfile } = await supabase
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', req.user.id)
    .maybeSingle()

  if (action === 'rejected') {
    const { error: deleteError } = await supabase
      .from('friend_requests')
      .delete()
      .eq('id', requestId)

    if (deleteError) {
      return res.status(400).json({ error: 'Error al rechazar la solicitud' })
    }

    const { data: notif } = await supabase
      .from('notifications')
      .insert({ user_id: request.sender_id, from_user_id: req.user.id, type: 'friend_reject' })
      .select()
      .single()

    if (io) {
      io.to(request.sender_id).emit('friend_request_updated', {
        id: requestId,
        status: 'rejected',
        responderId: req.user.id,
      })

      if (notif) {
        io.to(request.sender_id).emit('notification', {
          notification: {
            id: notif.id,
            type: 'friend_reject',
            read: false,
            createdAt: notif.created_at,
            fromUser: {
              id: req.user.id,
              username: sanitize(responderProfile?.display_name || responderProfile?.username || 'Desconocido'),
              avatar_url: responderProfile?.avatar_url || null,
            },
          },
        })
      }
    }

    return res.json({ message: 'Solicitud rechazada' })
  }

  const { error: updateError } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', requestId)

  if (updateError) {
    return res.status(400).json({ error: 'Error al aceptar la solicitud' })
  }

  const { data: notif } = await supabase
    .from('notifications')
    .insert({ user_id: request.sender_id, from_user_id: req.user.id, type: 'friend_accept' })
    .select()
    .single()

  if (io) {
    io.to(request.sender_id).emit('friend_request_updated', {
      id: requestId,
      status: 'accepted',
      responderId: req.user.id,
    })

    if (notif) {
      io.to(request.sender_id).emit('notification', {
        notification: {
          id: notif.id,
          type: 'friend_accept',
          read: false,
          createdAt: notif.created_at,
          fromUser: {
            id: req.user.id,
            username: sanitize(responderProfile?.display_name || responderProfile?.username || 'Desconocido'),
            avatar_url: responderProfile?.avatar_url || null,
          },
        },
      })
    }
  }

  res.json({ message: 'Solicitud aceptada' })
}))

app.get('/api/friends', auth, asyncHandler(async (req, res) => {
  const { data: sent } = await supabase
    .from('friend_requests')
    .select('receiver_id')
    .eq('sender_id', req.user.id)
    .eq('status', 'accepted')

  const { data: received } = await supabase
    .from('friend_requests')
    .select('sender_id')
    .eq('receiver_id', req.user.id)
    .eq('status', 'accepted')

  const friendIds = []
  if (sent) friendIds.push(...sent.map(r => r.receiver_id))
  if (received) friendIds.push(...received.map(r => r.sender_id))

  if (friendIds.length === 0) {
    return res.json({ friends: [] })
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', friendIds)

  const friends = (profiles || []).map(p => ({
    id: p.id,
    username: sanitize(p.display_name || p.username),
    avatar_url: p.avatar_url,
  }))

  res.json({ friends })
}))

app.get('/api/friends/pending', auth, asyncHandler(async (req, res) => {
  const { data: requests } = await supabase
    .from('friend_requests')
    .select('id, receiver_id, created_at')
    .eq('sender_id', req.user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (!requests || requests.length === 0) {
    return res.json({ requests: [] })
  }

  const receiverIds = requests.map(r => r.receiver_id)
  const { data: receivers } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', receiverIds)

  const receiverMap = {}
  if (receivers) {
    for (const r of receivers) {
      receiverMap[r.id] = { username: sanitize(r.display_name || r.username), avatar_url: r.avatar_url }
    }
  }

  const enriched = requests.map(r => ({
    id: r.id,
    receiver: { id: r.receiver_id, username: receiverMap[r.receiver_id]?.username || 'Desconocido', avatar_url: receiverMap[r.receiver_id]?.avatar_url || null },
    createdAt: r.created_at,
  }))

  res.json({ requests: enriched })
}))

app.delete('/api/friends/:friendId', auth, asyncHandler(async (req, res) => {
  const { friendId } = req.params

  const { data: request } = await supabase
    .from('friend_requests')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${req.user.id})`)
    .maybeSingle()

  if (!request) {
    return res.status(404).json({ error: 'Amigo no encontrado' })
  }

  const { error: deleteError } = await supabase
    .from('friend_requests')
    .delete()
    .eq('id', request.id)

  if (deleteError) {
    return res.status(400).json({ error: 'Error al eliminar amigo' })
  }

  const { data: unfriendNotif } = await supabase
    .from('notifications')
    .insert({ user_id: friendId, from_user_id: req.user.id, type: 'unfriend' })
    .select()
    .single()

  const io = getIO()
  if (io && unfriendNotif) {
    const [{ data: myProfile }, { data: isFollowingBackRow }] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', req.user.id).maybeSingle(),
      supabase.from('followers').select('id').eq('follower_id', friendId).eq('following_id', req.user.id).maybeSingle(),
    ])

    if (myProfile) {
      io.to(friendId).emit('notification', {
        notification: {
          id: unfriendNotif.id,
          type: 'unfriend',
          read: false,
          createdAt: unfriendNotif.created_at,
          isFollowingBack: !!isFollowingBackRow,
          fromUser: {
            id: req.user.id,
            username: sanitize(myProfile?.display_name || myProfile?.username || 'Desconocido'),
            avatar_url: myProfile?.avatar_url || null,
          },
        },
      })
    }
  }

  res.json({ message: 'Amigo eliminado' })
}))

app.delete('/api/friends/request/:requestId', auth, asyncHandler(async (req, res) => {
  const { requestId } = req.params

  const { data: request } = await supabase
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status')
    .eq('id', requestId)
    .single()

  if (!request) {
    return res.status(404).json({ error: 'Solicitud no encontrada' })
  }

  if (request.sender_id !== req.user.id) {
    return res.status(403).json({ error: 'No podés cancelar esta solicitud' })
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Esta solicitud ya fue respondida' })
  }

  const { error: deleteError } = await supabase
    .from('friend_requests')
    .delete()
    .eq('id', requestId)

  if (deleteError) {
    return res.status(400).json({ error: 'Error al cancelar la solicitud' })
  }

  const io = getIO()
  if (io) {
    io.to(request.receiver_id).emit('friend_request_cancelled', { id: requestId })
  }

  res.json({ message: 'Solicitud cancelada' })
}))

app.patch('/api/profile', auth, asyncHandler(async (req, res) => {
  const { bio, display_name, username, birth_date, show_age, country, show_country } = req.body

  const updates = {}
  let oldUsername

  if (bio !== undefined) {
    if (typeof bio !== 'string' || bio.length > 100) {
      return res.status(400).json({ error: 'La biografía no puede superar los 100 caracteres' })
    }
    updates.bio = bio
  }

  if (birth_date !== undefined) {
    if (birth_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(birth_date)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' })
    }
    updates.birth_date = birth_date
  }

  if (show_age !== undefined) {
    updates.show_age = Boolean(show_age)
  }

  if (country !== undefined) {
    if (country !== null && (typeof country !== 'string' || country.length > 100)) {
      return res.status(400).json({ error: 'País inválido' })
    }
    updates.country = country
  }

  if (show_country !== undefined) {
    updates.show_country = Boolean(show_country)
  }

  if (username !== undefined) {
    if (!/^@(?=.*[a-zA-Z])[a-zA-Z0-9_.]+$/.test(username)) {
      return res.status(400).json({ error: 'El username debe tener al menos 1 letra, y solo puede contener letras, números, guión bajo y punto' })
    }

    if (username.length < 2 || username.length > 21) {
      return res.status(400).json({ error: 'El username debe tener de 1 a 20 caracteres (sin contar el @)' })
    }

    const limits = await getUsernameChangeLimits(req.user.id)

    if (limits.remaining === 0 && limits.nextAvailable) {
      const dateStr = new Date(limits.nextAvailable).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
      return res.status(429).json({
        error: `Alcanzaste el límite de cambios. Podrás cambiar tu nombre de usuario nuevamente a partir del ${dateStr}`,
        limits,
      })
    }

    const { data: current } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', req.user.id)
      .maybeSingle()

    if (!current) {
      return res.status(404).json({ error: 'Perfil no encontrado' })
    }

    oldUsername = current.username

    const sanitizedUsername = sanitize(username)
    const lowerUsername = sanitizedUsername.toLowerCase()

    const { data: existing } = await supabase
      .from('profiles')
      .select('username')
      .ilike('username', escapeILike(lowerUsername))
      .neq('id', req.user.id)
      .maybeSingle()

    if (existing) {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso' })
    }

    updates.username = lowerUsername
    updates.display_name = sanitizedUsername
  }

  if (display_name !== undefined) {
    if (!/^@(?=.*[a-zA-Z])[a-zA-Z0-9_.]+$/.test(display_name)) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 1 letra, y solo puede contener letras, números, guión bajo y punto' })
    }

    const { data: current } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', req.user.id)
      .maybeSingle()

    if (!current) {
      return res.status(404).json({ error: 'Perfil no encontrado' })
    }

    if (display_name.toLowerCase() !== current.username) {
      return res.status(400).json({ error: 'Solo podés cambiar las mayúsculas de tu nombre de usuario' })
    }

    updates.display_name = display_name
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', req.user.id)
    .select()
    .maybeSingle()

  if (error) {
    return res.status(400).json({ error: 'Error al actualizar el perfil' })
  }

  if (updates.username) {
    await supabase.from('username_changes').insert({
      user_id: req.user.id,
      old_username: oldUsername,
      new_username: updates.username,
    })
  }

  const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
    supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
    supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
  ])

  const { count: friendCount } = await supabase
    .from('friend_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)

  const finalLimits = await getUsernameChangeLimits(req.user.id)

  res.json({
    profile: withDisplayName({
      ...profile,
      follower_count: followerCount || 0,
      following_count: followingCount || 0,
      friend_count: friendCount || 0,
    }),
    limits: finalLimits,
  })
}))

app.get('/api/username/check', asyncHandler(async (req, res) => {
  const { q } = req.query

  if (!q || !/^@(?=.*[a-zA-Z])[a-zA-Z0-9_.]+$/.test(q)) {
    return res.json({ available: false, error: 'Formato inválido' })
  }

  if (q.length < 2 || q.length > 21) {
    return res.json({ available: false, error: 'Debe tener de 1 a 20 caracteres (sin contar el @)' })
  }

  const lower = q.toLowerCase()

  let query = supabase
    .from('profiles')
    .select('username')
    .ilike('username', escapeILike(lower))

  let token = req.cookies['sb-access-token']
  if (!token) {
    const authHeader = req.headers['authorization']
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    }
  }

  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) {
      query = query.neq('id', user.id)
    }
  }

  const { data: existing } = await query.maybeSingle()

  if (existing) {
    return res.json({ available: false, error: 'Ese nombre de usuario ya está en uso' })
  }

  res.json({ available: true })
}))

app.post('/api/avatar', auth, asyncHandler(async (req, res) => {
  const { avatar } = req.body

  if (!avatar) {
    return res.status(400).json({ error: 'No se recibió ninguna imagen' })
  }

  const avatarUrl = await uploadAvatar(req.user.id, avatar)

  if (!avatarUrl) {
    return res.status(400).json({ error: 'Formato de imagen inválido. Usá PNG, JPG, GIF o WebP.' })
  }

  const { data: profile, error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', req.user.id)
    .select()
    .maybeSingle()

  if (updateError) {
    return res.status(400).json({ error: 'Error al actualizar el perfil' })
  }

  const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
    supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
    supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
  ])

  const { count: friendCount } = await supabase
    .from('friend_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)

  res.json({
    profile: {
      ...profile,
      follower_count: followerCount || 0,
      following_count: followingCount || 0,
      friend_count: friendCount || 0,
    },
  })
}))

app.get('/api/notifications', auth, asyncHandler(async (req, res) => {
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!notifications || notifications.length === 0) {
    return res.json({ notifications: [] })
  }

  const fromIds = [...new Set(notifications.map(n => n.from_user_id))]

  const [{ data: fromProfiles }, { data: followingRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', fromIds),
    supabase
      .from('followers')
      .select('following_id')
      .eq('follower_id', req.user.id)
      .in('following_id', fromIds),
  ])

  const followingSet = new Set((followingRows || []).map(r => r.following_id))

  const profileMap = {}
  if (fromProfiles) {
    for (const p of fromProfiles) {
      profileMap[p.id] = { username: sanitize(p.display_name || p.username), avatar_url: p.avatar_url }
    }
  }

  const enriched = notifications.map(n => ({
    id: n.id,
    type: n.type,
    read: n.read,
    createdAt: n.created_at,
    fromUser: {
      id: n.from_user_id,
      username: profileMap[n.from_user_id]?.username || 'Desconocido',
      avatar_url: profileMap[n.from_user_id]?.avatar_url || null,
    },
    isFollowingBack: followingSet.has(n.from_user_id),
  }))

  res.json({ notifications: enriched })
}))

app.get('/api/notifications/unread/count', auth, asyncHandler(async (req, res) => {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .eq('read', false)

  res.json({ count: count || 0 })
}))

app.post('/api/notifications/read', auth, asyncHandler(async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', req.user.id)
    .eq('read', false)

  if (error) {
    return res.status(400).json({ error: 'Error al marcar notificaciones como leídas' })
  }

  res.json({ message: 'Notificaciones marcadas como leídas' })
}))

app.delete('/api/notifications', auth, asyncHandler(async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', req.user.id)

  if (error) {
    return res.status(400).json({ error: 'Error al eliminar notificaciones' })
  }

  const io = getIO()
  if (io) {
    io.to(req.user.id).emit('notifications_cleared')
  }

  res.json({ message: 'Notificaciones eliminadas' })
}))

const pendingFollowToggles = new Map()

app.post('/api/follow/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', escapeILike(sanitized.toLowerCase()))
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'No podés seguirte a vos mismo' })
  }

  const key = `follow:${req.user.id}:${target.id}`
  if (pendingFollowToggles.has(key)) {
    clearTimeout(pendingFollowToggles.get(key).timer)
  }

  const timer = setTimeout(async () => {
    pendingFollowToggles.delete(key)

    const { error: insertError } = await supabase
      .from('followers')
      .insert({ follower_id: req.user.id, following_id: target.id })

    if (insertError) {
      if (insertError.code !== '23505') {
        console.error('Error al seguir:', insertError)
      }
      return
    }

    const { data: existingUnfollow } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', target.id)
      .eq('from_user_id', req.user.id)
      .eq('type', 'unfollow')
      .maybeSingle()

    let notif

    if (existingUnfollow) {
      const { data: updated } = await supabase
        .from('notifications')
        .update({ type: 'follow', created_at: new Date().toISOString(), read: false })
        .eq('id', existingUnfollow.id)
        .select()
        .single()

      notif = updated
    } else {
      const { data: existingFollow } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', target.id)
        .eq('from_user_id', req.user.id)
        .eq('type', 'follow')
        .maybeSingle()

      if (!existingFollow) {
        const { data: inserted } = await supabase
          .from('notifications')
          .insert({ user_id: target.id, from_user_id: req.user.id, type: 'follow' })
          .select()
          .single()

        notif = inserted
      }
    }

    if (notif) {
      const [{ data: fromProfile }, { data: isFollowingBackRow }] = await Promise.all([
        supabase.from('profiles').select('username, display_name, avatar_url').eq('id', req.user.id).maybeSingle(),
        supabase.from('followers').select('id').eq('follower_id', target.id).eq('following_id', req.user.id).maybeSingle(),
      ])

      const io = getIO()
      if (io) {
        io.to(target.id).emit('notification', {
          notification: {
            id: notif.id,
            type: 'follow',
            read: false,
            createdAt: notif.created_at,
            isFollowingBack: !!isFollowingBackRow,
            fromUser: {
              id: req.user.id,
              username: sanitize(fromProfile?.display_name || fromProfile?.username || 'Desconocido'),
              avatar_url: fromProfile?.avatar_url || null,
            },
          },
        })
      }
    }
  }, 2000)

  pendingFollowToggles.set(key, { timer })
  res.json({ message: 'Usuario seguido' })
}))

app.delete('/api/follow/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', escapeILike(sanitized.toLowerCase()))
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const key = `follow:${req.user.id}:${target.id}`
  if (pendingFollowToggles.has(key)) {
    clearTimeout(pendingFollowToggles.get(key).timer)
  }

  const timer = setTimeout(async () => {
    pendingFollowToggles.delete(key)

    const { error: deleteError } = await supabase
      .from('followers')
      .delete()
      .eq('follower_id', req.user.id)
      .eq('following_id', target.id)

    if (deleteError) {
      console.error('Error al dejar de seguir:', deleteError)
      return
    }

    const { data: existingFollow } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', target.id)
      .eq('from_user_id', req.user.id)
      .eq('type', 'follow')
      .maybeSingle()

    let notif

    if (existingFollow) {
      const { data: updated } = await supabase
        .from('notifications')
        .update({ type: 'unfollow', created_at: new Date().toISOString(), read: false })
        .eq('id', existingFollow.id)
        .select()
        .single()

      notif = updated
    } else {
      const { data: existingUnfollow } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', target.id)
        .eq('from_user_id', req.user.id)
        .eq('type', 'unfollow')
        .maybeSingle()

      if (existingUnfollow) {
        const { data: updated } = await supabase
          .from('notifications')
          .update({ created_at: new Date().toISOString(), read: false })
          .eq('id', existingUnfollow.id)
          .select()
          .single()

        notif = updated
      } else {
        const { data: inserted } = await supabase
          .from('notifications')
          .insert({ user_id: target.id, from_user_id: req.user.id, type: 'unfollow' })
          .select()
          .single()

        notif = inserted
      }
    }

    if (notif) {
      const [{ data: fromProfile }, { data: isFollowingBackRow }] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', req.user.id).maybeSingle(),
        supabase.from('followers').select('id').eq('follower_id', target.id).eq('following_id', req.user.id).maybeSingle(),
      ])

      const io = getIO()
      if (io && fromProfile) {
        io.to(target.id).emit('notification', {
          notification: {
            id: notif.id,
            type: 'unfollow',
            read: false,
            createdAt: notif.created_at,
            isFollowingBack: !!isFollowingBackRow,
            fromUser: {
              id: req.user.id,
              username: sanitize(fromProfile?.display_name || fromProfile?.username || 'Desconocido'),
              avatar_url: fromProfile?.avatar_url || null,
            },
          },
        })
      }
    }
  }, 2000)

  pendingFollowToggles.set(key, { timer })
  res.json({ message: 'Dejaste de seguir al usuario' })
}))

app.get('/api/followers/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', escapeILike(sanitized.toLowerCase()))
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const { data: followerRows, error: followerError } = await supabase
    .from('followers')
    .select('follower_id')
    .eq('following_id', target.id)
    .order('created_at', { ascending: false })

  if (followerError) {
    return res.status(400).json({ error: 'Error al obtener seguidores' })
  }

  if (followerRows.length === 0) {
    return res.json({ followers: [] })
  }

  const followerIds = followerRows.map(f => f.follower_id)

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', followerIds)

  if (profileError) {
    return res.status(400).json({ error: 'Error al obtener perfiles' })
  }

  const idOrder = followerIds
  profiles.sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id))

  const mapped = (profiles || []).map(p => ({ ...p, username: p.display_name || p.username }))
  res.json({ followers: mapped })
}))

app.get('/api/friends/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', escapeILike(sanitized.toLowerCase()))
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const { data: sent } = await supabase
    .from('friend_requests')
    .select('receiver_id')
    .eq('sender_id', target.id)
    .eq('status', 'accepted')

  const { data: received } = await supabase
    .from('friend_requests')
    .select('sender_id')
    .eq('receiver_id', target.id)
    .eq('status', 'accepted')

  const friendIds = []
  if (sent) friendIds.push(...sent.map(r => r.receiver_id))
  if (received) friendIds.push(...received.map(r => r.sender_id))

  if (friendIds.length === 0) {
    return res.json({ friends: [] })
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', friendIds)

  const mapped = (profiles || []).map(p => ({ ...p, username: p.display_name || p.username }))
  res.json({ friends: mapped })
}))

app.get('/api/chats', auth, asyncHandler(async (req, res) => {
  const { data: participations } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('user_id', req.user.id)

  if (!participations || participations.length === 0) {
    return res.json({ chats: [] })
  }

  const chatIds = participations.map(p => p.chat_id)

  const { data: chats } = await supabase
    .from('chats')
    .select('*')
    .in('id', chatIds)
    .order('updated_at', { ascending: false })

  if (!chats || chats.length === 0) {
    return res.json({ chats: [] })
  }

  const { data: myParticipants } = await supabase
    .from('chat_participants')
    .select('chat_id, last_read_at')
    .eq('user_id', req.user.id)
    .in('chat_id', chatIds)

  const lastReadMap = {}
  if (myParticipants) {
    for (const p of myParticipants) {
      lastReadMap[p.chat_id] = p.last_read_at
    }
  }

  const { data: allParticipants } = await supabase
    .from('chat_participants')
    .select('chat_id, user_id')
    .in('chat_id', chatIds)
    .neq('user_id', req.user.id)

  const otherUserIds = allParticipants ? allParticipants.map(p => p.user_id) : []

  const { data: friendships } = await supabase
    .from('friend_requests')
    .select('sender_id, receiver_id')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${req.user.id},receiver_id.eq.${req.user.id}`)

  const friendIds = new Set()
  if (friendships) {
    for (const f of friendships) {
      if (f.sender_id === req.user.id) friendIds.add(f.receiver_id)
      if (f.receiver_id === req.user.id) friendIds.add(f.sender_id)
    }
  }

  const otherUserIdMap = {}
  if (allParticipants) {
    for (const p of allParticipants) {
      otherUserIdMap[p.chat_id] = p.user_id
    }
  }

  const { data: otherProfiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', otherUserIds)

  const profileMap = {}
  if (otherProfiles) {
    for (const p of otherProfiles) {
      profileMap[p.id] = { id: p.id, username: sanitize(p.display_name || p.username), avatar_url: p.avatar_url }
    }
  }

  const participantMap = {}
  if (allParticipants) {
    for (const p of allParticipants) {
      participantMap[p.chat_id] = profileMap[p.user_id] || null
    }
  }

  const enriched = await Promise.all(chats.map(async (chat) => {
    const [lastMsgResult, unreadResult] = await Promise.all([
      supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chat.id)
        .neq('sender_id', req.user.id)
        .gt('created_at', lastReadMap[chat.id] || chat.created_at),
    ])

    const lastMsg = lastMsgResult.data
    const unreadCount = unreadResult.count || 0

    return {
      id: chat.id,
      otherUser: participantMap[chat.id] || null,
      isFriend: otherUserIdMap[chat.id] ? friendIds.has(otherUserIdMap[chat.id]) : false,
      unreadCount,
      lastMessage: lastMsg ? {
        id: lastMsg.id,
        content: lastMsg.content,
        sender_id: lastMsg.sender_id,
        created_at: lastMsg.created_at,
      } : null,
      updatedAt: chat.updated_at,
      createdAt: chat.created_at,
    }
  }))

  res.json({ chats: enriched })
}))

app.post('/api/chats', auth, asyncHandler(async (req, res) => {
  const { userId: otherUserId } = req.body

  if (!otherUserId) {
    return res.status(400).json({ error: 'Usuario requerido' })
  }

  if (otherUserId === req.user.id) {
    return res.status(400).json({ error: 'No podés chatear con vos mismo' })
  }

  const { data: cp1 } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('user_id', req.user.id)

  const { data: cp2 } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('user_id', otherUserId)

  let existingChatId = null
  if (cp1 && cp2) {
    const set1 = new Set(cp1.map(c => c.chat_id))
    const common = cp2.filter(c => set1.has(c.chat_id))
    if (common.length > 0) {
      existingChatId = common[0].chat_id
    }
  }

  if (existingChatId) {
    const { data: otherProfile } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', otherUserId)
      .maybeSingle()

    return res.json({
      chat: {
        id: existingChatId,
        otherUser: {
          id: otherUserId,
          username: sanitize(otherProfile?.display_name || otherProfile?.username || 'Desconocido'),
          avatar_url: otherProfile?.avatar_url || null,
        },
      },
    })
  }

  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .insert({})
    .select()
    .single()

  if (chatError) {
    return res.status(400).json({ error: 'Error al crear el chat' })
  }

  const { error: p1Error } = await supabase
    .from('chat_participants')
    .insert({ chat_id: chat.id, user_id: req.user.id })

  const { error: p2Error } = await supabase
    .from('chat_participants')
    .insert({ chat_id: chat.id, user_id: otherUserId })

  if (p1Error || p2Error) {
    await supabase.from('chat_participants').delete().eq('chat_id', chat.id)
    await supabase.from('chats').delete().eq('id', chat.id)
    return res.status(400).json({ error: 'Error al crear el chat' })
  }

  const { data: otherProfile } = await supabase
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', otherUserId)
    .maybeSingle()

  const chatData = {
    id: chat.id,
    otherUser: {
      id: otherUserId,
      username: sanitize(otherProfile?.display_name || otherProfile?.username || 'Desconocido'),
      avatar_url: otherProfile?.avatar_url || null,
    },
  }

  const io = getIO()
  if (io) {
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', req.user.id)
      .maybeSingle()

    io.to(otherUserId).emit('chat_created', {
      chat: {
        id: chat.id,
        otherUser: {
          id: req.user.id,
          username: sanitize(myProfile?.display_name || myProfile?.username || 'Desconocido'),
          avatar_url: myProfile?.avatar_url || null,
        },
        lastMessage: null,
      },
    })
  }

  res.json({ chat: chatData })
}))

app.get('/api/chats/unread/total', auth, asyncHandler(async (req, res) => {
  const { data: participations } = await supabase
    .from('chat_participants')
    .select('chat_id, last_read_at')
    .eq('user_id', req.user.id)

  if (!participations || participations.length === 0) {
    return res.json({ total: 0 })
  }

  const chatIds = participations.map(p => p.chat_id)

  const { data: chats } = await supabase
    .from('chats')
    .select('id, created_at')
    .in('id', chatIds)

  const chatCreatedMap = {}
  if (chats) {
    for (const c of chats) {
      chatCreatedMap[c.id] = c.created_at
    }
  }

  let total = 0
  for (const p of participations) {
    const { count } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', p.chat_id)
      .neq('sender_id', req.user.id)
      .gt('created_at', p.last_read_at || chatCreatedMap[p.chat_id] || p.created_at)
    total += (count || 0)
  }

  res.json({ total })
}))

app.get('/api/chats/:chatId/messages', auth, asyncHandler(async (req, res) => {
  const { chatId } = req.params

  const { data: participants } = await supabase
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', chatId)

  if (!participants || participants.length === 0) {
    return res.status(404).json({ error: 'Chat no encontrado' })
  }

  const isParticipant = participants.some(p => p.user_id === req.user.id)
  if (!isParticipant) {
    return res.status(403).json({ error: 'No sos participante de este chat' })
  }

  const otherUserId = participants.find(p => p.user_id !== req.user.id)?.user_id

  let isFriend = false
  let pendingRequest = false
  if (otherUserId) {
    const [friendshipResult, pendingResult] = await Promise.all([
      supabase
        .from('friend_requests')
        .select('id')
        .eq('status', 'accepted')
        .or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${req.user.id})`)
        .maybeSingle(),
      supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', req.user.id)
        .eq('receiver_id', otherUserId)
        .eq('status', 'pending')
        .maybeSingle(),
    ])
    isFriend = !!friendshipResult.data
    pendingRequest = !!pendingResult.data
  }

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

  res.json({ messages: messages || [], isFriend, pendingRequest })
}))

app.post('/api/chats/:chatId/messages', auth, asyncHandler(async (req, res) => {
  const { chatId } = req.params
  const { content } = req.body

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' })
  }

  if (content.trim().length > 300) {
    return res.status(400).json({ error: 'El mensaje no puede superar los 300 caracteres' })
  }

  const { data: participants } = await supabase
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', chatId)

  if (!participants || participants.length === 0) {
    return res.status(404).json({ error: 'Chat no encontrado' })
  }

  const isParticipant = participants.some(p => p.user_id === req.user.id)
  if (!isParticipant) {
    return res.status(403).json({ error: 'No sos participante de este chat' })
  }

  const otherUserId = participants.find(p => p.user_id !== req.user.id)?.user_id
  if (otherUserId) {
    const { data: friendship } = await supabase
      .from('friend_requests')
      .select('id')
      .eq('status', 'accepted')
      .or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${req.user.id})`)
      .maybeSingle()
    if (!friendship) {
      return res.status(403).json({ error: 'No son amigos. No podés enviar mensajes.' })
    }
  }

  const { data: message, error: msgError } = await supabase
    .from('chat_messages')
    .insert({ chat_id: chatId, sender_id: req.user.id, content: content.trim() })
    .select()
    .single()

  if (msgError) {
    return res.status(400).json({ error: 'Error al enviar el mensaje' })
  }

  await supabase
    .from('chats')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chatId)

  const io = getIO()
  if (io) {
    const otherUserIds = participants.filter(p => p.user_id !== req.user.id).map(p => p.user_id)
    for (const uid of otherUserIds) {
      io.to(uid).emit('new_message', {
        chatId,
        message: {
          id: message.id,
          chat_id: chatId,
          sender_id: message.sender_id,
          content: message.content,
          created_at: message.created_at,
        },
      })
    }
  }

  res.json({ message })
}))

app.post('/api/chats/:chatId/read', auth, asyncHandler(async (req, res) => {
  const { chatId } = req.params

  const { error } = await supabase
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', req.user.id)

  if (error) {
    return res.status(400).json({ error: 'Error al marcar como leído' })
  }

  const io = getIO()
  if (io) {
    const { data: participants } = await supabase
      .from('chat_participants')
      .select('user_id')
      .eq('chat_id', chatId)
      .neq('user_id', req.user.id)

    if (participants) {
      for (const p of participants) {
        io.to(p.user_id).emit('messages_read', { chatId, userId: req.user.id })
      }
    }
  }

  res.json({ message: 'Marcado como leído' })
}))

app.post('/api/calls/offer', auth, asyncHandler(async (req, res) => {
  const { targetUserId, sdp } = req.body
  if (!targetUserId || !sdp) {
    return res.status(400).json({ error: 'Parámetros requeridos' })
  }

  if (isInCall(targetUserId)) {
    await insertMissedCall(req.user.id, targetUserId)
    return res.status(409).json({ error: 'user_busy', message: 'El usuario está en otra llamada' })
  }

  const io = getIO()
  if (!io) {
    return res.status(500).json({ error: 'Socket no disponible' })
  }

  const targetSockets = await io.in(targetUserId).fetchSockets()
  if (targetSockets.length === 0) {
    await insertMissedCall(req.user.id, targetUserId)
    return res.status(404).json({ error: 'user_offline', message: 'El usuario no está disponible' })
  }

  addToCall(req.user.id)

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', req.user.id)
    .maybeSingle()

  io.to(targetUserId).emit('signal:offer', {
    caller: {
      id: req.user.id,
      username: profile?.display_name || profile?.username || 'Desconocido',
      avatar_url: profile?.avatar_url || null,
    },
    sdp,
  })

  io.to(req.user.id).emit('call:ack', { targetUserId })

  res.json({ sent: true })
}))

app.post('/api/calls/answer', auth, asyncHandler(async (req, res) => {
  const { targetUserId, sdp } = req.body
  if (!targetUserId || !sdp) {
    return res.status(400).json({ error: 'Parámetros requeridos' })
  }

  addToCall(req.user.id)

  const io = getIO()
  if (io) {
    io.to(targetUserId).emit('signal:answer', { sdp })
  }

  res.json({ sent: true })
}))

app.post('/api/calls/ice-candidate', auth, asyncHandler(async (req, res) => {
  const { targetUserId, candidate } = req.body
  if (!targetUserId || !candidate) {
    return res.status(400).json({ error: 'Parámetros requeridos' })
  }

  const io = getIO()
  if (io) {
    io.to(targetUserId).emit('signal:ice-candidate', { candidate })
  }

  res.json({ sent: true })
}))

app.post('/api/calls/end', auth, asyncHandler(async (req, res) => {
  const { targetUserId } = req.body
  if (!targetUserId) {
    return res.status(400).json({ error: 'Parámetros requeridos' })
  }

  removeFromCall(req.user.id)
  removeFromCall(targetUserId)

  const io = getIO()
  if (io) {
    io.to(targetUserId).emit('call:end', {})
  }

  res.json({ sent: true })
}))

app.post('/api/calls/missed', auth, asyncHandler(async (req, res) => {
  const { targetUserId } = req.body
  if (!targetUserId) {
    return res.status(400).json({ error: 'targetUserId requerido' })
  }

  await insertMissedCall(req.user.id, targetUserId)
  res.json({ sent: true })
}))

app.post('/api/posts', auth, asyncHandler(async (req, res) => {
  const { content } = req.body
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'El contenido es requerido' })
  }

  const sanitized = sanitize(content.trim()).slice(0, 300)

  const { data: existing } = await supabase
    .from('posts')
    .select('id')
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (existing) {
    const { data: post, error } = await supabase
      .from('posts')
      .update({ content: sanitized, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: 'Error al actualizar post' })

    await supabase.from('post_likes').delete().eq('post_id', existing.id)

    return res.json({ post, likesReset: true })
  }

  const { data: post, error } = await supabase
    .from('posts')
    .insert({ user_id: req.user.id, content: sanitized })
    .select()
    .single()

  if (error) return res.status(500).json({ error: 'Error al crear post' })

  res.status(201).json({ post })
}))

app.delete('/api/posts', auth, asyncHandler(async (req, res) => {
  const { data: existing, error: findError } = await supabase
    .from('posts')
    .select('id')
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (findError) return res.status(500).json({ error: 'Error al buscar post' })
  if (!existing) return res.status(404).json({ error: 'No tenés un post para eliminar' })

  const { error } = await supabase.from('posts').delete().eq('id', existing.id)
  if (error) return res.status(500).json({ error: 'Error al eliminar post' })

  res.json({ deleted: true })
}))

app.get('/api/posts/mine', auth, asyncHandler(async (req, res) => {
  const { data: post, error } = await supabase
    .from('posts')
    .select('*, post_likes(count)')
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: 'Error al obtener post' })

  res.json({ post })
}))

app.get('/api/posts/feed', auth, asyncHandler(async (req, res) => {
  const { data: posts, error } = await supabase
    .from('posts')
    .select(`
      id,
      content,
      created_at,
      updated_at,
      user_id,
      post_likes(count)
    `)
    .neq('user_id', req.user.id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: 'Error al obtener feed' })

  if (!posts || posts.length === 0) {
    return res.json({ posts: [] })
  }

  const userIds = [...new Set(posts.map(p => p.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', userIds)

  const profileMap = {}
  if (profiles) {
    profiles.forEach(pr => { profileMap[pr.id] = pr })
  }

  const postIds = posts.map(p => p.id)
  const { data: myLikes } = await supabase
    .from('post_likes')
    .select('post_id')
    .in('post_id', postIds)
    .eq('user_id', req.user.id)

  const likedPostIds = new Set(myLikes?.map(l => l.post_id) || [])

  const { data: sentRequests } = await supabase
    .from('friend_requests')
    .select('receiver_id, status')
    .eq('sender_id', req.user.id)
    .in('receiver_id', userIds)

  const { data: receivedRequests } = await supabase
    .from('friend_requests')
    .select('sender_id, status')
    .eq('receiver_id', req.user.id)
    .in('sender_id', userIds)

  const friendRequestMap = {}
  if (sentRequests) {
    sentRequests.forEach(r => { friendRequestMap[r.receiver_id] = r.status })
  }
  if (receivedRequests) {
    receivedRequests.forEach(r => {
      if (!friendRequestMap[r.sender_id]) {
        friendRequestMap[r.sender_id] = r.status
      }
    })
  }

  const enriched = posts.map(p => ({
    id: p.id,
    content: p.content,
    created_at: p.created_at,
    user_id: p.user_id,
    username: profileMap[p.user_id]?.username || 'unknown',
    display_name: profileMap[p.user_id]?.display_name || null,
    avatar_url: profileMap[p.user_id]?.avatar_url || null,
    likes_count: p.post_likes?.[0]?.count ?? 0,
    liked_by_me: likedPostIds.has(p.id),
    friend_request_status: friendRequestMap[p.user_id] || null,
  })).filter(p => p.username !== 'unknown')

  res.json({ posts: enriched })
}))

const pendingLikeToggles = new Map()

app.post('/api/posts/:id/like', auth, asyncHandler(async (req, res) => {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, user_id')
    .eq('id', req.params.id)
    .maybeSingle()

  if (postError) return res.status(500).json({ error: 'Error al verificar post' })
  if (!post) return res.status(404).json({ error: 'Post no encontrado' })
  if (post.user_id === req.user.id) {
    return res.status(400).json({ error: 'No podés dar like a tu propio post' })
  }

  const key = `${req.user.id}:${req.params.id}`
  if (pendingLikeToggles.has(key)) {
    clearTimeout(pendingLikeToggles.get(key).timer)
  }

  const timer = setTimeout(async () => {
    pendingLikeToggles.delete(key)
    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: post.id, user_id: req.user.id })
    if (error && error.code !== '23505') {
      console.error('Error al dar like:', error)
      return
    }

    const { data: existingNotif } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', post.user_id)
      .eq('from_user_id', req.user.id)
      .eq('type', 'like')
      .maybeSingle()

    if (!existingNotif) {
      const { data: inserted } = await supabase
        .from('notifications')
        .insert({ user_id: post.user_id, from_user_id: req.user.id, type: 'like' })
        .select()
        .single()

      if (inserted) {
        const { data: fromProfile } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', req.user.id)
          .maybeSingle()

        const io = getIO()
        if (io) {
          io.to(post.user_id).emit('notification', {
            notification: {
              id: inserted.id,
              type: 'like',
              read: false,
              createdAt: inserted.created_at,
              isFollowingBack: false,
              fromUser: {
                id: req.user.id,
                username: sanitize(fromProfile?.display_name || fromProfile?.username || 'Desconocido'),
                avatar_url: fromProfile?.avatar_url || null,
              },
            },
          })
        }
      }
    }
  }, 2000)

  pendingLikeToggles.set(key, { timer })

  const { count } = await supabase
    .from('post_likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', post.id)

  res.status(201).json({ liked: true, likesCount: count })
}))

app.post('/api/posts/:id/unlike', auth, asyncHandler(async (req, res) => {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id')
    .eq('id', req.params.id)
    .maybeSingle()

  if (postError) return res.status(500).json({ error: 'Error al verificar post' })
  if (!post) return res.status(404).json({ error: 'Post no encontrado' })

  const key = `${req.user.id}:${req.params.id}`
  if (pendingLikeToggles.has(key)) {
    clearTimeout(pendingLikeToggles.get(key).timer)
  }

  const timer = setTimeout(async () => {
    pendingLikeToggles.delete(key)
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', post.id)
      .eq('user_id', req.user.id)
    if (error) console.error('Error al quitar like:', error)
  }, 2000)

  pendingLikeToggles.set(key, { timer })

  const { count } = await supabase
    .from('post_likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', post.id)

  res.json({ unliked: true, likesCount: count })
}))

app.get('/api/posts/user/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', escapeILike(sanitized.toLowerCase()))
    .maybeSingle()

  if (!profile) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const { data: post, error } = await supabase
    .from('posts')
    .select('*, post_likes(count)')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: 'Error al obtener post' })

  if (!post) {
    return res.json({ post: null })
  }

  const likesCount = post.post_likes?.[0]?.count ?? 0

  let likedByMe = false
  let friendRequestStatus = null

  if (req.user.id !== profile.id) {
    const { count: likeCount } = await supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .eq('user_id', req.user.id)

    likedByMe = (likeCount || 0) > 0

    const { data: friendReq } = await supabase
      .from('friend_requests')
      .select('status')
      .or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${req.user.id})`)
      .maybeSingle()

    friendRequestStatus = friendReq?.status || null
  }

  res.json({
    post: {
      id: post.id,
      content: post.content,
      created_at: post.created_at,
      updated_at: post.updated_at,
      user_id: post.user_id,
      likes_count: likesCount,
      liked_by_me: likedByMe,
      friend_request_status: friendRequestStatus,
    },
  })
}))

app.get('/api/posts/:id', auth, asyncHandler(async (req, res) => {
  const { data: post, error } = await supabase
    .from('posts')
    .select('*, post_likes(count)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: 'Error al obtener post' })
  if (!post) return res.status(404).json({ error: 'Post no encontrado' })

  res.json({ post })
}))

app.use((err, req, res, next) => {
  console.error(err)

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La imagen es demasiado grande. Usá una de menos de 10 MB.' })
  }

  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message })
  }

  res.status(500).json({ error: 'Error interno del servidor' })
})

async function ensureAvatarBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some(b => b.name === 'avatars')
  if (!exists) {
    const { error } = await supabase.storage.createBucket('avatars', {
      public: true,
      fileSizeLimit: 2097152,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    })
    if (error) console.error('Error creating avatars bucket:', error.message)
  }
}

const server = http.createServer(app)
setupSocket(server)

const PORT = process.env.PORT || 3001
server.listen(PORT, async () => {
  await ensureAvatarBucket()
  console.log(`KnowMe API running on port ${PORT}`)
})
