import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize } from '../lib/utils.js'
import { getBlockRowsForUser, getBlockStatus } from '../lib/blocks.js'
import { uploadGroupIcon } from '../lib/profile.js'
import { getIO } from '../src/socket.js'

const nameWithAt = (name) => {
  const trimmed = sanitize(String(name || '').replace(/^@+/, '')).trim()
  return trimmed ? `@${trimmed}` : null
}

export const list = asyncHandler(async (req, res) => {
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
    .select('chat_id, last_read_at, is_admin')
    .eq('user_id', req.user.id)
    .in('chat_id', chatIds)

  const lastReadMap = {}
  const myAdminMap = {}
  if (myParticipants) {
    for (const p of myParticipants) {
      lastReadMap[p.chat_id] = p.last_read_at
      myAdminMap[p.chat_id] = !!p.is_admin
    }
  }

  const { data: allParticipants } = await supabase
    .from('chat_participants')
    .select('chat_id, user_id, is_admin')
    .in('chat_id', chatIds)

  const participantsByChat = {}
  const otherUserIds = new Set()
  if (allParticipants) {
    for (const p of allParticipants) {
      if (!participantsByChat[p.chat_id]) participantsByChat[p.chat_id] = []
      participantsByChat[p.chat_id].push(p)
      if (p.user_id !== req.user.id) otherUserIds.add(p.user_id)
    }
  }

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

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, last_seen_at, show_activity')
    .in('id', [...otherUserIds])

  const profileMap = {}
  if (profiles) {
    for (const p of profiles) {
      profileMap[p.id] = { id: p.id, username: sanitize(p.display_name || p.username), avatar_url: p.avatar_url, last_seen_at: p.show_activity ? p.last_seen_at : null }
    }
  }

  const blockRows = await getBlockRowsForUser(req.user.id)
  const excluded = new Set([...blockRows.blockedByMe, ...blockRows.blockedByThem])

  const visibleChats = chats.filter(chat => {
    if (chat.is_group) return true
    const others = participantsByChat[chat.id]?.filter(p => p.user_id !== req.user.id) || []
    const otherId = others[0]?.user_id
    return otherId && !excluded.has(otherId)
  })

  const enriched = await Promise.all(visibleChats.map(async (chat) => {
    const others = participantsByChat[chat.id]?.filter(p => p.user_id !== req.user.id) || []
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
        .eq('deleted', false)
        .gt('created_at', lastReadMap[chat.id] || chat.created_at),
    ])

    const lastMsg = lastMsgResult.data
    const unreadCount = unreadResult.count || 0

    let otherUser = null
    let isFriend = false
    let name = null
    let iconUrl = null
    let memberCount = 0
    let isAdmin = false

    if (chat.is_group) {
      name = chat.name
      iconUrl = chat.icon_url
      memberCount = (participantsByChat[chat.id] || []).length
      isAdmin = !!myAdminMap[chat.id]
    } else {
      const otherId = others[0]?.user_id
      otherUser = profileMap[otherId] || null
      isFriend = otherId ? friendIds.has(otherId) : false
    }

    return {
      id: chat.id,
      isGroup: !!chat.is_group,
      isAdmin,
      name,
icon_url: iconUrl,
      memberCount,
      otherUser,
      isFriend,
      unreadCount,
      lastMessage: lastMsg ? {
        id: lastMsg.id,
        content: lastMsg.deleted ? 'Mensaje eliminado' : lastMsg.content,
        sender_id: lastMsg.sender_id,
        sender_name: profileMap[lastMsg.sender_id]?.username || null,
        created_at: lastMsg.created_at,
        deleted: lastMsg.deleted,
        type: lastMsg.type,
      } : null,
      updatedAt: chat.updated_at,
      createdAt: chat.created_at,
    }
  }))

  res.json({ chats: enriched })
})

export const create = asyncHandler(async (req, res) => {
  const { userId: otherUserId } = req.body

  if (!otherUserId) {
    return res.status(400).json({ error: 'Usuario requerido' })
  }

  if (otherUserId === req.user.id) {
    return res.status(400).json({ error: 'No podés chatear con vos mismo' })
  }

  const blockStatus = await getBlockStatus(req.user.id, otherUserId)
  if (blockStatus.blockedByMe || blockStatus.blockedByThem) {
    return res.status(403).json({ error: 'No podés chatear con este usuario' })
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
      .select('username, display_name, avatar_url, last_seen_at, show_activity')
      .eq('id', otherUserId)
      .maybeSingle()

    return res.json({
      chat: {
        id: existingChatId,
        isGroup: false,
        otherUser: {
          id: otherUserId,
          username: sanitize(otherProfile?.display_name || otherProfile?.username || 'Desconocido'),
          avatar_url: otherProfile?.avatar_url || null,
          last_seen_at: otherProfile?.show_activity ? otherProfile?.last_seen_at : null,
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
    .select('username, display_name, avatar_url, last_seen_at, show_activity')
    .eq('id', otherUserId)
    .maybeSingle()

  const chatData = {
    id: chat.id,
    isGroup: false,
    otherUser: {
      id: otherUserId,
      username: sanitize(otherProfile?.display_name || otherProfile?.username || 'Desconocido'),
      avatar_url: otherProfile?.avatar_url || null,
      last_seen_at: otherProfile?.show_activity ? otherProfile?.last_seen_at : null,
    },
  }

  const io = getIO()
  if (io) {
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url, last_seen_at, show_activity')
      .eq('id', req.user.id)
      .maybeSingle()

    io.to(otherUserId).emit('chat_created', {
      chat: {
        id: chat.id,
        isGroup: false,
        otherUser: {
          id: req.user.id,
          username: sanitize(myProfile?.display_name || myProfile?.username || 'Desconocido'),
          avatar_url: myProfile?.avatar_url || null,
          last_seen_at: myProfile?.show_activity ? myProfile?.last_seen_at : null,
        },
        lastMessage: null,
      },
    })
  }

  res.json({ chat: chatData })
})

export const createGroup = asyncHandler(async (req, res) => {
  const { userIds, name, icon } = req.body

  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 3) {
    return res.status(400).json({ error: 'Seleccioná entre 1 y 3 amigos' })
  }

  const uniqueIds = [...new Set(userIds)]
  if (uniqueIds.length !== userIds.length) {
    return res.status(400).json({ error: 'No podés repetir amigos' })
  }

  if (uniqueIds.includes(req.user.id)) {
    return res.status(400).json({ error: 'No podés agregarte a vos mismo' })
  }

  const blockRows = await getBlockRowsForUser(req.user.id)
  const excluded = new Set([...blockRows.blockedByMe, ...blockRows.blockedByThem])
  for (const uid of uniqueIds) {
    if (excluded.has(uid)) {
      return res.status(403).json({ error: 'No podés crear un grupo con un usuario bloqueado' })
    }
  }

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

  for (const uid of uniqueIds) {
    if (!friendIds.has(uid)) {
      return res.status(403).json({ error: 'Todos los integrantes deben ser amigos tuyos' })
    }
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', [...uniqueIds, req.user.id])

  const profileMap = {}
  if (profiles) {
    for (const p of profiles) {
      profileMap[p.id] = { id: p.id, username: sanitize(p.display_name || p.username), avatar_url: p.avatar_url }
    }
  }

  const participantNames = [...uniqueIds, req.user.id].map(id => profileMap[id]?.username || 'Desconocido')
  const defaultName = participantNames.join(', ')

  if (icon && !/^data:image\/(png|jpeg|gif|webp);base64,/.test(icon)) {
    return res.status(400).json({ error: 'Formato de imagen inválido. Usá PNG, JPG, GIF o WebP.' })
  }

  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .insert({ is_group: true, name: (name && name.trim()) || defaultName, icon_url: null, created_by: req.user.id })
    .select()
    .single()

  if (chatError) {
    return res.status(400).json({ error: 'Error al crear el grupo' })
  }

  let iconUrl = null
  if (icon) {
    iconUrl = await uploadGroupIcon(chat.id, icon)
    if (iconUrl) {
      await supabase.from('chats').update({ icon_url: iconUrl }).eq('id', chat.id)
    } else {
      await supabase.from('chat_participants').delete().eq('chat_id', chat.id)
      await supabase.from('chats').delete().eq('id', chat.id)
      return res.status(400).json({ error: 'Formato de imagen inválido. Usá PNG, JPG, GIF o WebP.' })
    }
  }

  const memberRows = [{ user_id: req.user.id, is_admin: true }, ...uniqueIds.map(uid => ({ user_id: uid, is_admin: false }))]
  const { error: membersError } = await supabase
    .from('chat_participants')
    .insert(memberRows.map(m => ({ chat_id: chat.id, ...m })))

  if (membersError) {
    await supabase.from('chats').delete().eq('id', chat.id)
    return res.status(400).json({ error: 'Error al crear el grupo' })
  }

  const chatData = {
    id: chat.id,
    isGroup: true,
    isAdmin: true,
    name: chat.name,
    icon_url: iconUrl,
    memberCount: memberRows.length,
    otherUser: null,
    isFriend: false,
    lastMessage: null,
    updatedAt: chat.updated_at,
    createdAt: chat.created_at,
  }

  const io = getIO()
  if (io) {
    for (const uid of uniqueIds) {
      io.to(uid).emit('group_created', { chat: chatData })
    }
  }

  res.json({ chat: chatData })
})

export const unreadTotal = asyncHandler(async (req, res) => {
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
    .select('id, created_at, is_group')
    .in('id', chatIds)

  const chatInfoMap = {}
  if (chats) {
    for (const c of chats) {
      chatInfoMap[c.id] = { created_at: c.created_at, is_group: !!c.is_group }
    }
  }

  const { data: allParticipants } = await supabase
    .from('chat_participants')
    .select('chat_id, user_id')
    .in('chat_id', chatIds)
    .neq('user_id', req.user.id)

  const otherByChat = {}
  if (allParticipants) {
    for (const p of allParticipants) {
      if (!otherByChat[p.chat_id]) otherByChat[p.chat_id] = []
      otherByChat[p.chat_id].push(p.user_id)
    }
  }

  const blockRows = await getBlockRowsForUser(req.user.id)
  const excluded = new Set([...blockRows.blockedByMe, ...blockRows.blockedByThem])

  let total = 0
  for (const p of participations) {
    const chatInfo = chatInfoMap[p.chat_id]
    if (!chatInfo) continue
    const others = otherByChat[p.chat_id] || []
    if (!chatInfo.is_group && others.some(uid => excluded.has(uid))) continue
    const { count } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', p.chat_id)
      .neq('sender_id', req.user.id)
      .eq('deleted', false)
      .gt('created_at', p.last_read_at || chatInfo.created_at || p.created_at)
    total += (count || 0)
  }

  res.json({ total })
})

export const getMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params

  const { data: participants } = await supabase
    .from('chat_participants')
    .select('user_id, is_admin, last_read_at')
    .eq('chat_id', chatId)

  if (!participants || participants.length === 0) {
    return res.status(404).json({ error: 'Chat no encontrado' })
  }

  const isParticipant = participants.some(p => p.user_id === req.user.id)
  if (!isParticipant) {
    return res.status(403).json({ error: 'No sos participante de este chat' })
  }

  const { data: chatRow } = await supabase
    .from('chats')
    .select('is_group, name, icon_url')
    .eq('id', chatId)
    .maybeSingle()

  const isGroup = !!chatRow?.is_group

  const otherUserIds = participants.filter(p => p.user_id !== req.user.id).map(p => p.user_id)

  if (!isGroup && otherUserIds.length > 0) {
    const blockStatus = await getBlockStatus(req.user.id, otherUserIds[0])
    if (blockStatus.blockedByMe || blockStatus.blockedByThem) {
      return res.status(403).json({ error: 'No podés ver este chat' })
    }
  }

  let isFriend = false
  let pendingRequest = false
  if (!isGroup && otherUserIds.length > 0) {
    const otherUserId = otherUserIds[0]
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

  const allIds = new Set([req.user.id, ...otherUserIds])
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', [...allIds])

  const profileMap = {}
  if (profiles) {
    for (const p of profiles) {
      profileMap[p.id] = { username: sanitize(p.display_name || p.username), avatar_url: p.avatar_url }
    }
  }

  const blockRows = await getBlockRowsForUser(req.user.id)

  const enrichedMessages = (messages || []).map(m => ({
    ...m,
    sender: profileMap[m.sender_id] || { username: 'Desconocido', avatar_url: null },
  }))

  const memberProfiles = participants.map(p => ({
    id: p.user_id,
    username: profileMap[p.user_id]?.username || 'Desconocido',
    avatar_url: profileMap[p.user_id]?.avatar_url || null,
    is_admin: !!p.is_admin,
    last_read_at: p.last_read_at,
    isFriend: !isGroup && p.user_id === otherUserIds[0] ? isFriend : undefined,
  }))

  res.json({
    messages: enrichedMessages,
    isFriend,
    pendingRequest,
    isGroup,
    isAdmin: isGroup ? !!participants.find(p => p.user_id === req.user.id)?.is_admin : undefined,
    name: isGroup ? chatRow?.name : null,
    icon_url: isGroup ? chatRow?.icon_url : null,
    participants: isGroup ? memberProfiles : [],
    blockedByMe: isGroup ? [...blockRows.blockedByMe] : [],
  })
})

export const sendMessage = asyncHandler(async (req, res) => {
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

  const { data: chatRow } = await supabase
    .from('chats')
    .select('is_group')
    .eq('id', chatId)
    .maybeSingle()

  const isGroup = !!chatRow?.is_group

  if (!isGroup) {
    const otherUserId = participants.find(p => p.user_id !== req.user.id)?.user_id
    if (otherUserId) {
      const blockStatus = await getBlockStatus(req.user.id, otherUserId)
      if (blockStatus.blockedByMe || blockStatus.blockedByThem) {
        return res.status(403).json({ error: 'No podés enviar mensajes a este usuario' })
      }
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
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', req.user.id)
      .maybeSingle()

    const emitted = {
      ...message,
      sender: {
        username: sanitize(senderProfile?.display_name || senderProfile?.username || 'Desconocido'),
        avatar_url: senderProfile?.avatar_url || null,
      },
    }

    const otherUserIds = participants.filter(p => p.user_id !== req.user.id).map(p => p.user_id)
    for (const uid of otherUserIds) {
      io.to(uid).emit('new_message', { chatId, message: emitted })
    }
  }

  res.json({ message })
})

export const updateGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params
  const { name, icon } = req.body

  const { data: participant } = await supabase
    .from('chat_participants')
    .select('is_admin')
    .eq('chat_id', chatId)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!participant) {
    return res.status(404).json({ error: 'Grupo no encontrado' })
  }

  if (!participant.is_admin) {
    return res.status(403).json({ error: 'Solo los administradores pueden editar el grupo' })
  }

  const { data: chatRow } = await supabase
    .from('chats')
    .select('is_group')
    .eq('id', chatId)
    .maybeSingle()

  if (!chatRow?.is_group) {
    return res.status(400).json({ error: 'Este chat no es un grupo' })
  }

  const updates = {}
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre no puede estar vacío' })
    }
    if (name.trim().length > 60) {
      return res.status(400).json({ error: 'El nombre no puede superar los 60 caracteres' })
    }
    updates.name = sanitize(name.trim())
  }
  if (icon !== undefined) {
    if (icon === null || icon === '') {
      updates.icon_url = null
    } else if (typeof icon === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,/.test(icon)) {
      const iconUrl = await uploadGroupIcon(chatId, icon)
      if (!iconUrl) {
        return res.status(400).json({ error: 'Formato de imagen inválido. Usá PNG, JPG, GIF o WebP.' })
      }
      updates.icon_url = iconUrl
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' })
  }

  const { data: updated, error: updateError } = await supabase
    .from('chats')
    .update(updates)
    .eq('id', chatId)
    .select('*')
    .single()

  if (updateError) {
    return res.status(400).json({ error: 'Error al actualizar el grupo' })
  }

  const { data: participants } = await supabase
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', chatId)

  const io = getIO()
  if (io && participants) {
    for (const p of participants) {
      io.to(p.user_id).emit('group_updated', { chatId, chat: updated })
    }
  }

  res.json({ chat: updated })
})

export const addMembers = asyncHandler(async (req, res) => {
  const { chatId } = req.params
  const { userIds } = req.body

  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 3) {
    return res.status(400).json({ error: 'Seleccioná entre 1 y 3 amigos' })
  }

  const uniqueIds = [...new Set(userIds)]
  if (uniqueIds.includes(req.user.id)) {
    return res.status(400).json({ error: 'No podés agregarte a vos mismo' })
  }

  const { data: participant } = await supabase
    .from('chat_participants')
    .select('is_admin')
    .eq('chat_id', chatId)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!participant) {
    return res.status(404).json({ error: 'Grupo no encontrado' })
  }

  if (!participant.is_admin) {
    return res.status(403).json({ error: 'Solo los administradores pueden agregar personas' })
  }

  const { data: chatRow } = await supabase
    .from('chats')
    .select('is_group')
    .eq('id', chatId)
    .maybeSingle()

  if (!chatRow?.is_group) {
    return res.status(400).json({ error: 'Este chat no es un grupo' })
  }

  const { data: existingMembers } = await supabase
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', chatId)

  const memberIds = new Set((existingMembers || []).map(m => m.user_id))
  const newIds = uniqueIds.filter(id => !memberIds.has(id))

  if (newIds.length === 0) {
    return res.status(400).json({ error: 'Esos usuarios ya están en el grupo' })
  }

  const blockRows = await getBlockRowsForUser(req.user.id)
  const excluded = new Set([...blockRows.blockedByMe, ...blockRows.blockedByThem])
  for (const uid of newIds) {
    if (excluded.has(uid)) {
      return res.status(403).json({ error: 'No podés agregar a un usuario bloqueado' })
    }
  }

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

  for (const uid of newIds) {
    if (!friendIds.has(uid)) {
      return res.status(403).json({ error: 'Todos los integrantes deben ser amigos tuyos' })
    }
  }

  const { error: insertError } = await supabase
    .from('chat_participants')
    .insert(newIds.map(uid => ({ chat_id: chatId, user_id: uid, is_admin: false })))

  if (insertError) {
    return res.status(400).json({ error: 'Error al agregar personas' })
  }

  const [myProfileResult, addedProfilesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', req.user.id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id, username, display_name')
      .in('id', newIds),
  ])

  const myName = nameWithAt(myProfileResult.data?.display_name || myProfileResult.data?.username) || '@Alguien'
  const addedNameMap = {}
  if (addedProfilesResult.data) {
    for (const p of addedProfilesResult.data) {
      addedNameMap[p.id] = nameWithAt(p.display_name || p.username)
    }
  }

  const systemMessages = newIds.map(uid => ({
    chat_id: chatId,
    sender_id: req.user.id,
    content: `${myName} agregó a ${addedNameMap[uid] || '@Desconocido'}`,
    type: 'system',
  }))

  const { data: insertedMessages, error: sysMsgError } = await supabase
    .from('chat_messages')
    .insert(systemMessages)
    .select()

  if (!sysMsgError) {
    await supabase
      .from('chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatId)
  }

  const { data: chatRowFull } = await supabase
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .single()

  const io = getIO()
  if (io) {
    const allUserIds = [...memberIds, ...newIds]
    for (const uid of allUserIds) {
      io.to(uid).emit('group_updated', { chatId, chat: chatRowFull })
    }
    if (insertedMessages && insertedMessages.length > 0) {
      for (const message of insertedMessages) {
        const emitted = {
          ...message,
          sender: { username: myName, avatar_url: null },
        }
        for (const uid of allUserIds) {
          io.to(uid).emit('new_message', { chatId, message: emitted })
        }
      }
    }
  }

  res.json({ message: 'Personas agregadas' })
})

export const promoteAdmin = asyncHandler(async (req, res) => {
  const { chatId } = req.params
  const { userId } = req.body

  if (!userId || userId === req.user.id) {
    return res.status(400).json({ error: 'Usuario inválido' })
  }

  const { data: participant } = await supabase
    .from('chat_participants')
    .select('is_admin')
    .eq('chat_id', chatId)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!participant) {
    return res.status(404).json({ error: 'Grupo no encontrado' })
  }

  if (!participant.is_admin) {
    return res.status(403).json({ error: 'Solo los administradores pueden dar administradores' })
  }

  const { data: target } = await supabase
    .from('chat_participants')
    .select('user_id, is_admin')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'El usuario no está en el grupo' })
  }

  if (target.is_admin) {
    return res.status(400).json({ error: 'El usuario ya es administrador' })
  }

  const { error: updateError } = await supabase
    .from('chat_participants')
    .update({ is_admin: true })
    .eq('chat_id', chatId)
    .eq('user_id', userId)

  if (updateError) {
    return res.status(400).json({ error: 'Error al dar administrador' })
  }

  const { data: participants } = await supabase
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', chatId)

  const [myProfileResult, targetProfileResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', req.user.id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', userId)
      .maybeSingle(),
  ])

  const myName = nameWithAt(myProfileResult.data?.display_name || myProfileResult.data?.username) || '@Alguien'
  const targetName = nameWithAt(targetProfileResult.data?.display_name || targetProfileResult.data?.username) || '@Desconocido'

  const { data: systemMessage, error: sysMsgError } = await supabase
    .from('chat_messages')
    .insert({
      chat_id: chatId,
      sender_id: req.user.id,
      content: `${myName} dió administrador a ${targetName}`,
      type: 'system',
    })
    .select()
    .single()

  if (!sysMsgError) {
    await supabase
      .from('chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatId)
  }

const io = getIO()
  if (io && participants) {
    const { data: chatRowFull } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single()

    for (const p of participants) {
      io.to(p.user_id).emit('group_updated', { chatId, chat: chatRowFull })
    }
    if (systemMessage) {
      const emitted = { ...systemMessage, sender: { username: myName, avatar_url: null } }
      for (const p of participants) {
        io.to(p.user_id).emit('new_message', { chatId, message: emitted })
      }
    }
  }

  res.json({ message: 'Administrador asignado' })
})

export const leaveGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params
  const { successorId } = req.body

  const { data: chatRow } = await supabase
    .from('chats')
    .select('is_group')
    .eq('id', chatId)
    .maybeSingle()

  if (!chatRow) {
    return res.status(404).json({ error: 'Grupo no encontrado' })
  }

  if (!chatRow.is_group) {
    return res.status(400).json({ error: 'Este chat no es un grupo' })
  }

  const { data: participants } = await supabase
    .from('chat_participants')
    .select('user_id, is_admin')
    .eq('chat_id', chatId)

  const myParticipant = participants?.find(p => p.user_id === req.user.id)
  if (!myParticipant) {
    return res.status(404).json({ error: 'No sos parte de este grupo' })
  }

  const adminCount = (participants || []).filter(p => p.is_admin).length
  const onlyAdmin = !!myParticipant.is_admin && adminCount === 1 && participants.length > 1

  if (onlyAdmin) {
    if (!successorId) {
      return res.status(400).json({ error: 'Elegí un nuevo administrador antes de salir' })
    }

    const successor = participants?.find(p => p.user_id === successorId && !p.is_admin)
    if (!successor) {
      return res.status(400).json({ error: 'El administrador elegido no es válido' })
    }

    const { error: promoteError } = await supabase
      .from('chat_participants')
      .update({ is_admin: true })
      .eq('chat_id', chatId)
      .eq('user_id', successorId)

    if (promoteError) {
      return res.status(400).json({ error: 'Error al heredar administrador' })
    }
  }

  const { error: leaveError } = await supabase
    .from('chat_participants')
    .delete()
    .eq('chat_id', chatId)
    .eq('user_id', req.user.id)

  if (leaveError) {
    return res.status(400).json({ error: 'Error al salir del grupo' })
  }

  const { count } = await supabase
    .from('chat_participants')
    .select('*', { count: 'exact', head: true })
    .eq('chat_id', chatId)

  if ((count || 0) === 0) {
    await supabase.from('chats').delete().eq('id', chatId)
    return res.json({ message: 'Grupo eliminado' })
  }

  const { data: myProfileResult } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', req.user.id)
    .maybeSingle()

  const myName = nameWithAt(myProfileResult?.display_name || myProfileResult?.username) || '@Alguien'

  const systemMessages = []

  if (onlyAdmin && successorId) {
    const { data: successorProfileResult } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', successorId)
      .maybeSingle()

    const successorName = nameWithAt(successorProfileResult?.display_name || successorProfileResult?.username) || '@Desconocido'
    const { data: promoteMsg, error: promoteMsgError } = await supabase
      .from('chat_messages')
      .insert({
        chat_id: chatId,
        sender_id: req.user.id,
        content: `${myName} dió administrador a ${successorName}`,
        type: 'system',
      })
      .select()
      .single()

    if (!promoteMsgError && promoteMsg) {
      systemMessages.push(promoteMsg)
    }
  }

  const { data: leaveMsg, error: sysMsgError } = await supabase
    .from('chat_messages')
    .insert({
      chat_id: chatId,
      sender_id: req.user.id,
      content: `${myName} salió del grupo`,
      type: 'system',
    })
    .select()
    .single()

  if (!sysMsgError && leaveMsg) {
    systemMessages.push(leaveMsg)
  }

  if (systemMessages.length > 0) {
    await supabase
      .from('chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatId)
  }

  const io = getIO()
  if (io) {
    const { data: remaining } = await supabase
      .from('chat_participants')
      .select('user_id')
      .eq('chat_id', chatId)

    if (remaining) {
      const { data: chatRowFull } = await supabase
        .from('chats')
        .select('*')
        .eq('id', chatId)
        .single()

      for (const p of remaining) {
        io.to(p.user_id).emit('group_updated', { chatId, chat: chatRowFull })
      }

      for (const message of systemMessages) {
        const emitted = { ...message, sender: { username: myName, avatar_url: null } }
        for (const p of remaining) {
          io.to(p.user_id).emit('new_message', { chatId, message: emitted })
        }
      }
    }
  }

  res.json({ message: 'Saliste del grupo' })
})

export const editMessage = asyncHandler(async (req, res) => {
  const { chatId, messageId } = req.params
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
    .select('*')
    .eq('id', messageId)
    .eq('chat_id', chatId)
    .single()

  if (msgError || !message) {
    return res.status(404).json({ error: 'Mensaje no encontrado' })
  }

  if (message.sender_id !== req.user.id) {
    return res.status(403).json({ error: 'Solo podés editar tus propios mensajes' })
  }

  if (message.deleted) {
    return res.status(400).json({ error: 'No podés editar un mensaje eliminado' })
  }

  const { data: updated, error: updateError } = await supabase
    .from('chat_messages')
    .update({ content: content.trim(), edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select()
    .single()

  if (updateError) {
    return res.status(400).json({ error: 'Error al editar el mensaje' })
  }

  const io = getIO()
  if (io) {
    const allUserIds = participants.map(p => p.user_id)
    for (const uid of allUserIds) {
      io.to(uid).emit('message_updated', { chatId, message: updated })
    }
  }

  res.json({ message: updated })
})

export const deleteMessage = asyncHandler(async (req, res) => {
  const { chatId, messageId } = req.params

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
    .select('*')
    .eq('id', messageId)
    .eq('chat_id', chatId)
    .single()

  if (msgError || !message) {
    return res.status(404).json({ error: 'Mensaje no encontrado' })
  }

  if (message.sender_id !== req.user.id) {
    return res.status(403).json({ error: 'Solo podés eliminar tus propios mensajes' })
  }

  const { error: deleteError } = await supabase
    .from('chat_messages')
    .update({ deleted: true })
    .eq('id', messageId)

  if (deleteError) {
    return res.status(400).json({ error: 'Error al eliminar el mensaje' })
  }

  const io = getIO()
  if (io) {
    const allUserIds = participants.map(p => p.user_id)
    for (const uid of allUserIds) {
      io.to(uid).emit('message_deleted', { chatId, messageId: Number(messageId) })
    }
  }

  res.json({ message: 'Mensaje eliminado' })
})

export const markRead = asyncHandler(async (req, res) => {
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
})
