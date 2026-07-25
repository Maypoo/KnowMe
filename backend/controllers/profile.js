import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize, escapeILike, withDisplayName } from '../lib/utils.js'
import { getUsernameChangeLimits, uploadAvatar } from '../lib/profile.js'
import { getIO, isUserOnline } from '../src/socket.js'

export const getByUsername = asyncHandler(async (req, res) => {
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

  let isFollowedBy = false

  if (req.user.id !== profile.id) {
    const [{ count: followCount }, { data: friendReq }, { count: followerBackCount }] = await Promise.all([
      supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', req.user.id).eq('following_id', profile.id),
      supabase.from('friend_requests').select('status').or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${req.user.id})`).maybeSingle(),
      supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id).eq('following_id', req.user.id),
    ])
    isFollowing = (followCount || 0) > 0
    isFollowedBy = (followerBackCount || 0) > 0
    friendRequestStatus = friendReq?.status || null
  }

  res.json({
    profile: {
      ...profile,
      follower_count: followerCount || 0,
      following_count: followingCount || 0,
      friend_count: friendCountVal,
      is_following: isFollowing,
      is_followed_by: isFollowedBy,
      friend_request_status: friendRequestStatus,
    },
  })
})

export const update = asyncHandler(async (req, res) => {
  const { bio, display_name, username, birth_date, show_age, country, show_country, show_activity } = req.body

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

  if (show_activity !== undefined) {
    updates.show_activity = Boolean(show_activity)
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

  if (updates.show_activity !== undefined) {
    const io = getIO()
    if (io && isUserOnline(req.user.id)) {
      if (updates.show_activity) {
        io.emit('user:online', { userId: req.user.id })
      } else {
        io.emit('user:offline', { userId: req.user.id })
      }
    }
  }

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
})

export const avatar = asyncHandler(async (req, res) => {
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
})

export const checkUsername = asyncHandler(async (req, res) => {
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
})
