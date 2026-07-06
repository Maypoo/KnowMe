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
import { setupSocket, getIO } from './src/socket.js'

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

const app = express()

app.use(helmet())
app.set('trust proxy', 1)

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim())

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('No autorizado por CORS'))
    }
  },
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())

const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()

  const origin = req.headers.origin
  const referer = req.headers.referer

  if (!origin && !referer) {
    return res.status(403).json({ error: 'Origen no válido' })
  }

  const source = (origin || referer || '').replace(/\/$/, '')
  const isAllowed = allowedOrigins.includes(source)

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
  } catch {}
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
}

function sanitize(str) {
  return str.replace(/[<>"']/g, '').trim()
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
  } catch {
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

app.post('/api/auth/setup-username', auth, authLimiter, asyncHandler(async (req, res) => {
  const { username, avatar } = req.body

  if (!username) {
    return res.status(400).json({ error: 'El nombre de usuario es obligatorio' })
  }

  if (!/^@[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'El username debe empezar con @ y solo puede contener letras, números y guión bajo' })
  }

  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'El username debe tener entre 2 y 20 caracteres' })
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle()

  if (existing) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso' })
  }

  const sanitizedUsername = sanitize(username)

  let avatarUrl = avatar ? await uploadAvatar(req.user.id, avatar) : null

  const profileData = { id: req.user.id, username: sanitizedUsername, email: req.user.email }
  if (avatarUrl) profileData.avatar_url = avatarUrl

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert(profileData)
    .select()
    .maybeSingle()

  if (profileError) {
    return res.status(400).json({ error: 'Error al crear el perfil' })
  }

  auditLog('register_google_complete', req.user.id, req.user.email, { username, ip: req.ip, user_agent: req.headers['user-agent'] })
  res.json({ profile })
}))

app.get('/api/auth/me', auth, asyncHandler(async (req, res) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .maybeSingle()

  if (profile) {
    profile.username = sanitize(profile.username)
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

  res.json({
    user: req.user,
    profile: profile
      ? { ...profile, follower_count: followerCount, following_count: followingCount, friend_count: friendCount }
      : { username: req.user.user_metadata?.username || null },
  })
}))

app.get('/api/profile/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', sanitized)
    .maybeSingle()

  if (!profile) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
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

  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Búsqueda muy corta' })
  }

  const sanitized = sanitize(q)

  const { data: users } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .ilike('username', `%${sanitized}%`)
    .neq('id', req.user.id)
    .limit(10)

  res.json({ users: users || [] })
}))

app.post('/api/friends/request', auth, asyncHandler(async (req, res) => {
  const { username } = req.body

  if (!username || !/^@[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Nombre de usuario inválido' })
  }

  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'El username debe tener entre 2 y 20 caracteres' })
  }

  const { data: target } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', sanitize(username))
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
      const { error: updateError } = await supabase
        .from('friend_requests')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (updateError) {
        return res.status(400).json({ error: 'Error al enviar la solicitud' })
      }

      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', req.user.id)
        .maybeSingle()

      const io = getIO()
      if (io) {
        io.to(target.id).emit('friend_request_received', {
          id: existing.id,
          sender: { id: req.user.id, username: sanitize(senderProfile?.username || 'Desconocido'), avatar_url: senderProfile?.avatar_url || null },
          status: 'pending',
        })
      }

      return res.json({ message: 'Solicitud enviada', requestId: existing.id })
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
    .select('username, avatar_url')
    .eq('id', req.user.id)
    .maybeSingle()

  const io = getIO()
  if (io) {
    io.to(target.id).emit('friend_request_received', {
      id: request.id,
      sender: { id: req.user.id, username: sanitize(senderProfile?.username || 'Desconocido'), avatar_url: senderProfile?.avatar_url || null },
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
    .select('id, username, avatar_url')
    .in('id', senderIds)

  const senderMap = {}
  if (senders) {
    for (const s of senders) {
      senderMap[s.id] = { username: sanitize(s.username), avatar_url: s.avatar_url }
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

  const { error: updateError } = await supabase
    .from('friend_requests')
    .update({ status: action, updated_at: new Date().toISOString() })
    .eq('id', requestId)

  if (updateError) {
    return res.status(400).json({ error: 'Error al responder la solicitud' })
  }

  const io = getIO()
  if (io) {
    io.to(request.sender_id).emit('friend_request_updated', {
      id: requestId,
      status: action,
      responderId: req.user.id,
    })
  }

  res.json({ message: action === 'accepted' ? 'Solicitud aceptada' : 'Solicitud rechazada' })
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
    .select('id, username, avatar_url')
    .in('id', friendIds)

  const friends = (profiles || []).map(p => ({
    id: p.id,
    username: sanitize(p.username),
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
    .select('id, username, avatar_url')
    .in('id', receiverIds)

  const receiverMap = {}
  if (receivers) {
    for (const r of receivers) {
      receiverMap[r.id] = { username: sanitize(r.username), avatar_url: r.avatar_url }
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
  const { bio } = req.body

  if (typeof bio !== 'string' || bio.length > 100) {
    return res.status(400).json({ error: 'La biografía no puede superar los 100 caracteres' })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ bio })
    .eq('id', req.user.id)
    .select()
    .maybeSingle()

  if (error) {
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

app.post('/api/follow/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sanitized)
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'No podés seguirte a vos mismo' })
  }

  const { error: insertError } = await supabase
    .from('followers')
    .insert({ follower_id: req.user.id, following_id: target.id })

  if (insertError) {
    if (insertError.code === '23505') {
      return res.status(409).json({ error: 'Ya seguís a este usuario' })
    }
    return res.status(400).json({ error: 'Error al seguir al usuario' })
  }

  res.json({ message: 'Usuario seguido' })
}))

app.delete('/api/follow/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sanitized)
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const { error: deleteError } = await supabase
    .from('followers')
    .delete()
    .eq('follower_id', req.user.id)
    .eq('following_id', target.id)

  if (deleteError) {
    return res.status(400).json({ error: 'Error al dejar de seguir' })
  }

  res.json({ message: 'Dejaste de seguir al usuario' })
}))

app.get('/api/followers/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sanitized)
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
    .select('id, username, avatar_url')
    .in('id', followerIds)

  if (profileError) {
    return res.status(400).json({ error: 'Error al obtener perfiles' })
  }

  const idOrder = followerIds
  profiles.sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id))

  res.json({ followers: profiles })
}))

app.get('/api/friends/:username', auth, asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sanitized)
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
    .select('id, username, avatar_url')
    .in('id', friendIds)

  res.json({ friends: profiles || [] })
}))

app.get('/api/chats', auth, asyncHandler(async (req, res) => {
  const { data: participations } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('user_id', req.user.id)
    .is('deleted_at', null)

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

  const { data: otherProfiles } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', otherUserIds)

  const profileMap = {}
  if (otherProfiles) {
    for (const p of otherProfiles) {
      profileMap[p.id] = { id: p.id, username: sanitize(p.username), avatar_url: p.avatar_url }
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

  res.json({ chats: enriched.filter(c => c.lastMessage !== null) })
}))

app.post('/api/chats', auth, asyncHandler(async (req, res) => {
  const { userId: otherUserId } = req.body

  if (!otherUserId) {
    return res.status(400).json({ error: 'Usuario requerido' })
  }

  if (otherUserId === req.user.id) {
    return res.status(400).json({ error: 'No podés chatear con vos mismo' })
  }

  const { data: friendship } = await supabase
    .from('friend_requests')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${req.user.id})`)
    .maybeSingle()

  if (!friendship) {
    return res.status(403).json({ error: 'No son amigos' })
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
      .select('username, avatar_url')
      .eq('id', otherUserId)
      .maybeSingle()

    return res.json({
      chat: {
        id: existingChatId,
        otherUser: {
          id: otherUserId,
          username: sanitize(otherProfile?.username || 'Desconocido'),
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
    .select('username, avatar_url')
    .eq('id', otherUserId)
    .maybeSingle()

  const chatData = {
    id: chat.id,
    otherUser: {
      id: otherUserId,
      username: sanitize(otherProfile?.username || 'Desconocido'),
      avatar_url: otherProfile?.avatar_url || null,
    },
  }

  const io = getIO()
  if (io) {
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', req.user.id)
      .maybeSingle()

    io.to(otherUserId).emit('chat_created', {
      chat: {
        id: chat.id,
        otherUser: {
          id: req.user.id,
          username: sanitize(myProfile?.username || 'Desconocido'),
          avatar_url: myProfile?.avatar_url || null,
        },
        lastMessage: null,
      },
    })
  }

  res.json({ chat: chatData })
}))

app.get('/api/chats/:chatId/messages', auth, asyncHandler(async (req, res) => {
  const { chatId } = req.params

  const { data: participation } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('chat_id', chatId)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!participation) {
    return res.status(403).json({ error: 'No sos participante de este chat' })
  }

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

  res.json({ messages: messages || [] })
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

  await supabase
    .from('chat_participants')
    .update({ deleted_at: null })
    .eq('chat_id', chatId)

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

  res.json({ message: 'Marcado como leído' })
}))

app.delete('/api/chats/:chatId/leave', auth, asyncHandler(async (req, res) => {
  const { chatId } = req.params

  const { data: participation } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('chat_id', chatId)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!participation) {
    return res.status(404).json({ error: 'Chat no encontrado' })
  }

  await supabase
    .from('chat_participants')
    .update({ deleted_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', req.user.id)

  res.json({ message: 'Chat eliminado' })
}))

app.delete('/api/chats/leave-all', auth, asyncHandler(async (req, res) => {
  const { data: participations } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('user_id', req.user.id)

  if (!participations || participations.length === 0) {
    return res.json({ message: 'No hay chats para eliminar' })
  }

  await supabase
    .from('chat_participants')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', req.user.id)

  res.json({ message: `${participations.length} chats eliminados` })
}))

app.use((err, req, res, next) => {
  console.error(err)
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
