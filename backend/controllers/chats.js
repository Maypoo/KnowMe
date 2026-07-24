import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize } from '../lib/utils.js'
import { getIO } from '../src/socket.js'

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
})

export const create = asyncHandler(async (req, res) => {
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
})

export const getMessages = asyncHandler(async (req, res) => {
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
