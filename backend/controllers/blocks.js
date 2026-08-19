import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize, escapeILike } from '../lib/utils.js'
import { getIO, notifyBlocked, notifyUnblocked, endCallBetween } from '../src/socket.js'

export const block = asyncHandler(async (req, res) => {
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
    return res.status(400).json({ error: 'No podés bloquearte a vos mismo' })
  }

  const { data: existing } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', req.user.id)
    .eq('blocked_id', target.id)
    .maybeSingle()

  if (existing) {
    return res.status(409).json({ error: 'Ya bloqueaste a este usuario' })
  }

  const { error: insertError } = await supabase
    .from('blocks')
    .insert({ blocker_id: req.user.id, blocked_id: target.id })

  if (insertError) {
    return res.status(400).json({ error: 'Error al bloquear al usuario' })
  }

  const me = req.user.id
  const other = target.id

  const [{ data: myChats }, { data: otherChats }, { data: myPosts }, { data: otherPosts }] = await Promise.all([
    supabase.from('chat_participants').select('chat_id').eq('user_id', me),
    supabase.from('chat_participants').select('chat_id').eq('user_id', other),
    supabase.from('posts').select('id').eq('user_id', me),
    supabase.from('posts').select('id').eq('user_id', other),
  ])

  const commonChats = myChats && otherChats
    ? myChats.map(c => c.chat_id).filter(id => otherChats.some(o => o.chat_id === id))
    : []

  let dmChatIds = []
  if (commonChats.length > 0) {
    const { data: commonChatRows } = await supabase
      .from('chats')
      .select('id, is_group')
      .in('id', commonChats)
    dmChatIds = (commonChatRows || []).filter(c => !c.is_group).map(c => c.id)
  }

  await Promise.all([
    supabase.from('friend_requests').delete().or(`and(sender_id.eq.${me},receiver_id.eq.${other}),and(sender_id.eq.${other},receiver_id.eq.${me})`),
    supabase.from('followers').delete().eq('follower_id', me).eq('following_id', other),
    supabase.from('followers').delete().eq('follower_id', other).eq('following_id', me),
    supabase.from('notifications').delete().or(`and(user_id.eq.${me},from_user_id.eq.${other}),and(user_id.eq.${other},from_user_id.eq.${me})`),
    myPosts && myPosts.length > 0
      ? supabase.from('post_likes').delete().eq('user_id', other).in('post_id', myPosts.map(p => p.id))
      : Promise.resolve(),
    otherPosts && otherPosts.length > 0
      ? supabase.from('post_likes').delete().eq('user_id', me).in('post_id', otherPosts.map(p => p.id))
      : Promise.resolve(),
    dmChatIds.length > 0
      ? supabase.from('chats').delete().in('id', dmChatIds)
      : Promise.resolve(),
  ])

  const io = getIO()
  if (io) {
    io.to(other).emit('user:blocked', { blockerId: me })
    io.to(me).emit('blocked:updated')
  }
  notifyBlocked(me, other)
  endCallBetween(me, other)

  res.json({ message: 'Usuario bloqueado' })
})

export const listBlocks = asyncHandler(async (req, res) => {
  const { data: blockRows, error: blockError } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', req.user.id)
    .order('created_at', { ascending: false })

  if (blockError) {
    return res.status(400).json({ error: 'Error al obtener bloqueados' })
  }

  if (blockRows.length === 0) {
    return res.json({ users: [] })
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', blockRows.map(r => r.blocked_id))

  if (profileError) {
    return res.status(400).json({ error: 'Error al obtener perfiles' })
  }

  const idOrder = blockRows.map(r => r.blocked_id)
  const mapped = (profiles || []).sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id))

  res.json({ users: mapped })
})

export const unblock = asyncHandler(async (req, res) => {
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

  await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', req.user.id)
    .eq('blocked_id', target.id)

  notifyUnblocked(req.user.id, target.id)

  const io = getIO()
  if (io) {
    io.to(req.user.id).emit('blocked:updated')
  }

  res.json({ message: 'Usuario desbloqueado' })
})
