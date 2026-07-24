import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize, escapeILike } from '../lib/utils.js'
import { getIO } from '../src/socket.js'

export const request = asyncHandler(async (req, res) => {
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
})

export const listRequests = asyncHandler(async (req, res) => {
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
})

export const requestsCount = asyncHandler(async (req, res) => {
  const { count } = await supabase
    .from('friend_requests')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', req.user.id)
    .eq('status', 'pending')

  res.json({ count: count || 0 })
})

export const respond = asyncHandler(async (req, res) => {
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
})

export const list = asyncHandler(async (req, res) => {
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
})

export const pending = asyncHandler(async (req, res) => {
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
})

export const remove = asyncHandler(async (req, res) => {
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
})

export const cancelRequest = asyncHandler(async (req, res) => {
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
})

export const getUserFriends = asyncHandler(async (req, res) => {
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
})
