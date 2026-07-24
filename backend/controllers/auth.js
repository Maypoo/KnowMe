import crypto from 'crypto'
import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize, escapeILike, setSessionCookies, clearSessionCookies, withDisplayName } from '../lib/utils.js'
import { auditLog } from '../lib/audit.js'
import { rotatedTokens } from '../lib/tokens.js'
import { getUsernameChangeLimits, uploadAvatar } from '../lib/profile.js'

export const refresh = asyncHandler(async (req, res) => {
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
})

export const logout = asyncHandler(async (req, res) => {
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
})

export const deleteAccount = asyncHandler(async (req, res) => {
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
})

export const google = asyncHandler(async (req, res) => {
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
})

export const setupUsername = asyncHandler(async (req, res) => {
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
})

export const me = asyncHandler(async (req, res) => {
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
})
