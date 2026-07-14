import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { socket } from '../lib/socket'
import Avatar from './Avatar'

export default function ChatsList({ onSelectChat, refreshTrigger }) {
  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchChats = useCallback(async () => {
    try {
      const res = await api('/api/chats')
      const data = await res.json()
      if (res.ok) {
        setChats(data.chats)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchChats()
  }, [fetchChats, refreshTrigger])

  useEffect(() => {
    const handleNewMessage = () => {
      fetchChats()
    }
    const handleChatCreated = () => {
      fetchChats()
    }

    socket.on('new_message', handleNewMessage)
    socket.on('chat_created', handleChatCreated)

    return () => {
      socket.off('new_message', handleNewMessage)
      socket.off('chat_created', handleChatCreated)
    }
  }, [fetchChats])

  if (loading) return null

  return (
    <div className="flex-1 flex flex-col">
      {chats.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">No hay nada por aca.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {chats.map(chat => {
            return (
              <li key={chat.id}>
                <button
                  onClick={() => onSelectChat(chat)}
                  className="w-full rounded-lg px-4 py-3 flex items-center gap-3 transition bg-zinc-900 hover:bg-zinc-800"
                >
                  <Avatar src={chat.otherUser?.avatar_url} size={40} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-100 text-sm font-medium">
                        {chat.otherUser?.username || 'Desconocido'}
                      </span>
                      <div className="flex items-center gap-2">
                        {chat.unreadCount > 0 && (
                          <span
                            className="rounded-full text-[11px] font-medium flex items-center justify-center"
                            style={{
                              backgroundColor: '#6659ff',
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
                      {chat.lastMessage
                        ? (chat.lastMessage.sender_id !== chat.otherUser?.id ? 'Tú: ' : '') + chat.lastMessage.content
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
