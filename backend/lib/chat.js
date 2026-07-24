import { supabase } from './supabase.js'
import { getIO } from '../src/socket.js'

export async function findChatId(userId1, userId2) {
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

export async function findOrCreateChat(userId1, userId2) {
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

export async function insertMissedCall(callerId, targetId) {
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
