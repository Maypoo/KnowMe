import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Phone } from 'lucide-react'
import { api } from '../lib/api'
import { socket } from '../lib/socket'
import Avatar from './Avatar'
import GroupAvatar from './GroupAvatar'
import { SkeletonBox, SkeletonAvatar } from './Skeleton'
import { useOnlineUsers } from '../lib/OnlineUsersContext'

export default function ChatsList({ profile, onSelectChat, incomingCall }) {
  const queryClient = useQueryClient()
  const { isOnline } = useOnlineUsers()
  const [typingChats, setTypingChats] = useState({})
  const typingTimeoutsRef = useRef({})

  function clearTyping(chatId) {
    setTypingChats(prev => {
      const next = { ...prev }
      delete next[chatId]
      return next
    })
    if (typingTimeoutsRef.current[chatId]) {
      clearTimeout(typingTimeoutsRef.current[chatId])
      delete typingTimeoutsRef.current[chatId]
    }
  }

  useEffect(() => {
    const handleTyping = ({ userId, chatId }) => {
      if (!chatId) return
      setTypingChats(prev => ({ ...prev, [chatId]: true }))
      if (typingTimeoutsRef.current[chatId]) {
        clearTimeout(typingTimeoutsRef.current[chatId])
      }
      typingTimeoutsRef.current[chatId] = setTimeout(() => {
        clearTyping(chatId)
      }, 3000)
    }

    const handleNewMessage = (data) => {
      if (!data?.chatId) return
      clearTyping(data.chatId)
      queryClient.setQueryData(['chats'], (old) => {
        if (!old) return old
        return old.map(c =>
          c.id === data.chatId
            ? { ...c, lastMessage: data.message, updatedAt: data.message.created_at }
            : c
        )
      })
    }

    socket.on('chat:typing', handleTyping)
    socket.on('new_message', handleNewMessage)
    return () => {
      socket.off('chat:typing', handleTyping)
      socket.off('new_message', handleNewMessage)
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout)
    }
  }, [queryClient])

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const res = await api('/api/chats')
      const data = await res.json()
      return data.chats || []
    },
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col">
        <ul className="space-y-1">
          {[1,2,3,4,5].map(i => (
            <li key={i}>
              <div className="w-full rounded-lg px-4 py-3 flex items-center gap-3 bg-zinc-900">
                <SkeletonAvatar size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <SkeletonBox className="h-4 w-24" />
                    <SkeletonBox className="h-3 w-12" />
                  </div>
                  <SkeletonBox className="h-3 w-40" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {chats.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">No hay nada por aca.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {chats.map(chat => {
            const title = chat.isGroup ? (chat.name || 'Grupo') : (chat.otherUser?.username || 'Desconocido')
            return (
              <li key={chat.id}>
                <button
                  onClick={() => onSelectChat(chat)}
                  className="w-full rounded-lg px-4 py-3 flex items-center gap-3 transition bg-zinc-900 hover:bg-zinc-800"
                >
                  {chat.isGroup ? (
                    <GroupAvatar iconUrl={chat.icon_url} size={40} />
                  ) : (
                    <div className="relative">
                      <Avatar src={chat.otherUser?.avatar_url} size={40} />
                      {isOnline(chat.otherUser?.id) ? (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 ring-2 ring-zinc-950" />
                      ) : chat.otherUser?.last_seen_at ? (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-zinc-600 ring-2 ring-zinc-950" />
                      ) : null}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-100 text-sm font-medium truncate">
                        {title}
                        {chat.isGroup && chat.memberCount > 0 && (
                          <span className="text-zinc-500 font-normal"> · {chat.memberCount}</span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {incomingCall && chat.otherUser?.id === incomingCall.from.id && (
                          <span
                            className="rounded-full flex items-center justify-center"
                            style={{
                              backgroundColor: '#22c55e',
                              color: '#fff',
                              width: 18,
                              height: 18,
                            }}
                          >
                            <Phone size={11} strokeWidth={3} />
                          </span>
                        )}
                        {chat.unreadCount > 0 && (
                          <span
                            className="rounded-full text-[11px] font-medium flex items-center justify-center"
                            style={{
                              backgroundColor: 'var(--color-accent)',
                              color: '#fff',
                              minWidth: 18,
                              height: 18,
                              padding: '0 5px',
                            }}
                          >
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                          </span>
                        )}
                        {chat.lastMessage && (
                          <span className="text-zinc-600 text-xs">
                            {formatTime(chat.lastMessage.created_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-zinc-500 text-sm truncate">
                      {typingChats[chat.id] && !chat.isGroup && isOnline(chat.otherUser?.id)
                        ? <span className="text-green-400">escribiendo...</span>
                        : chat.lastMessage
                          ? <span>{previewPrefix(chat, profile?.id)}{chat.lastMessage.content}</span>
                          : 'Sin mensajes aún'}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function previewPrefix(chat, myId) {
  if (chat.lastMessage.type === 'system') return ''
  if (chat.lastMessage.sender_id === myId) return 'Tú: '
  const senderName = chat.lastMessage.sender_name || chat.lastMessage.sender?.username
  if (chat.isGroup && senderName) return `${senderName}: `
  return ''
}

function formatTime(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const day = 86400000
  if (diff < day) {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 7 * day) {
    return date.toLocaleDateString('es-AR', { weekday: 'short' })
  }
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}
