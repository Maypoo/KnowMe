import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize } from '../lib/utils.js'
import { getBlockRowsForUser, formatExcludedIds } from '../lib/blocks.js'
import { getIO } from '../src/socket.js'

export const list = asyncHandler(async (req, res) => {
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!notifications || notifications.length === 0) {
    return res.json({ notifications: [] })
  }

  const blockRows = await getBlockRowsForUser(req.user.id)
  const excluded = new Set([...blockRows.blockedByMe, ...blockRows.blockedByThem])

  const visible = notifications.filter(n => !excluded.has(n.from_user_id))
  if (visible.length === 0) {
    return res.json({ notifications: [] })
  }

  const fromIds = [...new Set(visible.map(n => n.from_user_id))]

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

  const enriched = visible.map(n => ({
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
})

export const unreadCount = asyncHandler(async (req, res) => {
  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .eq('read', false)

  const blockRows = await getBlockRowsForUser(req.user.id)
  const excluded = new Set([...blockRows.blockedByMe, ...blockRows.blockedByThem])
  const excludedStr = formatExcludedIds(excluded)
  if (excludedStr) {
    query = query.not('from_user_id', 'in', excludedStr)
  }

  const { count } = await query

  res.json({ count: count || 0 })
})

export const markRead = asyncHandler(async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', req.user.id)
    .eq('read', false)

  if (error) {
    return res.status(400).json({ error: 'Error al marcar notificaciones como leídas' })
  }

  res.json({ message: 'Notificaciones marcadas como leídas' })
})

export const clear = asyncHandler(async (req, res) => {
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
})
