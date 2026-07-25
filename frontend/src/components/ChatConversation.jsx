import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Phone, PhoneOff, Send, Pencil, Trash2, X } from 'lucide-react'
import { api } from '../lib/api'
import { socket } from '../lib/socket'
import Avatar from './Avatar'
import { useOnlineUsers } from '../lib/OnlineUsersContext'
import { timeAgo } from '../lib/timeAgo'

export default function ChatConversation({ chat, onBack, profile, onStartCall, incomingCall, onJoinCall, onClearIncomingCall }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { isOnline } = useOnlineUsers()
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [isFriend, setIsFriend] = useState(chat.isFriend ?? true)
  const [friendRequestSent, setFriendRequestSent] = useState(false)
  const [typingUserId, setTypingUserId] = useState(null)
  const typingTimeoutRef = useRef(null)
  const lastTypingEmitRef = useRef(0)
  const bottomRef = useRef(null)
  const [popupMsgId, setPopupMsgId] = useState(null)
  const [editingMsgId, setEditingMsgId] = useState(null)
  const [editContent, setEditContent] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['messages', chat.id],
    queryFn: async () => {
      const res = await api(`/api/chats/${chat.id}/messages`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Error al cargar mensajes')
      return body
    },
  })

  const messages = data?.messages ?? []

  function clearUnreadForChat() {
    if (!chat?.id) return
    const chats = queryClient.getQueryData(['chats'])
    if (chats) {
      const updated = chats.map(c =>
        c.id === chat.id ? { ...c, unreadCount: 0 } : c
      )
      queryClient.setQueryData(['chats'], updated)
      const newTotal = updated.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
      queryClient.setQueryData(['chatsUnread'], newTotal)
      return
    }
    queryClient.setQueryData(['chatsUnread'], 0)
  }

  useEffect(() => {
    if (data) {
      if (typeof data.isFriend === 'boolean') setIsFriend(data.isFriend)
      if (data.pendingRequest) setFriendRequestSent(true)
    }
  }, [data])

  useEffect(() => {
    if (!chat?.id) return
    queryClient.invalidateQueries({ queryKey: ['messages', chat.id] })
    clearUnreadForChat()
    api(`/api/chats/${chat.id}/read`, { method: 'POST' }).catch(() => {})
    return () => {
      api(`/api/chats/${chat.id}/read`, { method: 'POST' }).catch(() => {})
    }
  }, [chat?.id, queryClient])

  useEffect(() => {
    const handleConnect = () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chat.id] })
    }
    socket.on('connect', handleConnect)
    return () => socket.off('connect', handleConnect)
  }, [chat.id, queryClient])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const handleNewMessage = (msgData) => {
      if (msgData.chatId === chat.id) {
        queryClient.setQueryData(['messages', chat.id], (old) => {
          if (!old) return { messages: [msgData.message] }
          if (old.messages?.some(m => m.id === msgData.message.id)) return old
          return { ...old, messages: [...old.messages, msgData.message] }
        })
        clearUnreadForChat()
        api(`/api/chats/${chat.id}/read`, { method: 'POST' }).catch(() => {})
      }
    }

    socket.on('new_message', handleNewMessage)
    return () => socket.off('new_message', handleNewMessage)
  }, [chat.id, queryClient])

  useEffect(() => {
    const handleUpdated = (msgData) => {
      if (msgData.chatId === chat.id) {
        queryClient.setQueryData(['messages', chat.id], (old) => {
          if (!old) return old
          return {
            ...old,
            messages: old.messages.map(m =>
              m.id === msgData.message.id ? msgData.message : m
            ),
          }
        })
      }
    }

    socket.on('message_updated', handleUpdated)
    return () => socket.off('message_updated', handleUpdated)
  }, [chat.id, queryClient])

  useEffect(() => {
    const handleDeleted = (msgData) => {
      if (msgData.chatId === chat.id) {
        queryClient.setQueryData(['messages', chat.id], (old) => {
          if (!old) return old
          return {
            ...old,
            messages: old.messages.map(m =>
              m.id === msgData.messageId ? { ...m, deleted: true } : m
            ),
          }
        })
      }
    }

    socket.on('message_deleted', handleDeleted)
    return () => socket.off('message_deleted', handleDeleted)
  }, [chat.id, queryClient])

  const otherUserId = chat.otherUser?.id

  useEffect(() => {
    const handleTyping = ({ userId, chatId }) => {
      if (chatId === chat.id && userId === otherUserId) {
        setTypingUserId(userId)
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => setTypingUserId(null), 3000)
      }
    }

    socket.on('chat:typing', handleTyping)
    return () => {
      socket.off('chat:typing', handleTyping)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [chat.id, otherUserId])

  useEffect(() => {
    if (!popupMsgId && !editingMsgId) return
    const handleClick = (e) => {
      const inPopup = e.target.closest('[data-popup-menu]')
      const inModal = e.target.closest('[data-edit-modal]')
      const inBubble = e.target.closest('[data-message-bubble]')
      if (!inPopup && !inModal && !inBubble) {
        setPopupMsgId(null)
        setEditingMsgId(null)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [popupMsgId, editingMsgId])

  const emitTyping = useCallback(() => {
    if (!otherUserId) return
    const now = Date.now()
    if (now - lastTypingEmitRef.current < 2000) return
    lastTypingEmitRef.current = now
    socket.emit('chat:typing', { targetUserId: otherUserId, chatId: chat.id })
  }, [otherUserId, chat.id])

  const sendMutation = useMutation({
    mutationFn: async (content) => {
      const res = await api(`/api/chats/${chat.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Error al enviar el mensaje')
      }
      return res.json()
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['messages', chat.id], (old) => {
        if (!old) return { messages: [result.message] }
        return { ...old, messages: [...old.messages, result.message] }
      })
      queryClient.setQueryData(['chats'], (old) => {
        if (!old) return old
        const updated = old.map(c =>
          c.id === chat.id
            ? { ...c, lastMessage: result.message, updatedAt: result.message.created_at, unreadCount: 0 }
            : c
        )
        const newTotal = updated.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
        queryClient.setQueryData(['chatsUnread'], newTotal)
        return updated
      })
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({ messageId, content }) => {
      const res = await api(`/api/chats/${chat.id}/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Error al editar el mensaje')
      }
      return res.json()
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['messages', chat.id], (old) => {
        if (!old) return old
        return {
          ...old,
          messages: old.messages.map(m =>
            m.id === result.message.id ? result.message : m
          ),
        }
      })
      setEditingMsgId(null)
      setEditContent('')
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (messageId) => {
      const res = await api(`/api/chats/${chat.id}/messages/${messageId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Error al eliminar el mensaje')
      }
      return res.json()
    },
    onSuccess: (_, messageId) => {
      queryClient.setQueryData(['messages', chat.id], (old) => {
        if (!old) return old
        return {
          ...old,
          messages: old.messages.map(m =>
            m.id === messageId ? { ...m, deleted: true } : m
          ),
        }
      })
      setPopupMsgId(null)
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const handleSend = () => {
    const text = input.trim()
    if (!text || sendMutation.isPending) return

    if (text.length > 300) {
      setError('El mensaje no puede superar los 300 caracteres')
      return
    }

    setError('')
    setInput('')
    sendMutation.mutate(text)
  }

  const handleOpenProfile = () => {
    if (chat.otherUser?.username) {
      sessionStorage.setItem('chatReturn', JSON.stringify({ activeChat: chat }))
      navigate(`/${chat.otherUser.username}`)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSendFriendRequest = async () => {
    try {
      const res = await api('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username: chat.otherUser?.username }),
      })
      if (res.ok) {
        setFriendRequestSent(true)
        setError('')
      } else {
        const data = await res.json()
        if (data.error === 'Ya hay una solicitud pendiente') {
          setFriendRequestSent(true)
        } else {
          setError(data.error || 'Error al enviar la solicitud')
        }
      }
    } catch (err) {
      console.error(err)
      setError('Error al enviar la solicitud')
    }
  }

  const handleMessageTap = (msg, msgId) => {
    if (editingMsgId || msg.deleted) return
    setPopupMsgId(prev => prev === msgId ? null : msgId)
  }

  const handleStartEdit = (msg) => {
    setEditContent(msg.content)
    setEditingMsgId(msg.id)
    setPopupMsgId(null)
  }

  const handleCancelEdit = () => {
    setEditingMsgId(null)
    setEditContent('')
  }

  const handleSaveEdit = () => {
    const text = editContent.trim()
    const original = messages.find(m => m.id === editingMsgId)?.content
    if (!text || text === original) return
    if (text.length > 300) {
      setError('El mensaje no puede superar los 300 caracteres')
      return
    }
    setError('')
    editMutation.mutate({ messageId: editingMsgId, content: text })
  }

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit()
    }
    if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-100 transition">
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={handleOpenProfile} className="inline-flex items-center gap-3 hover:opacity-80 transition">
            <div className="relative">
              <Avatar src={chat.otherUser?.avatar_url} size={36} />
              {isOnline(chat.otherUser?.id) ? (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-zinc-950" />
              ) : chat.otherUser?.last_seen_at ? (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-zinc-600 ring-2 ring-zinc-950" />
              ) : null}
            </div>
            <div className="flex flex-col items-start">
              <span className="text-zinc-100 text-sm font-medium truncate">{chat.otherUser?.username}</span>
              {typingUserId ? (
                <span className="text-green-400 text-xs">escribiendo...</span>
              ) : isOnline(chat.otherUser?.id) ? (
                <span className="text-green-500 text-xs">En línea</span>
              ) : chat.otherUser?.last_seen_at ? (
                <span className="text-zinc-500 text-xs">Conectado {timeAgo(chat.otherUser?.last_seen_at)}</span>
              ) : null}
            </div>
          </button>
        </div>
        {isFriend && (
          <button
            onClick={() => onStartCall?.(chat.otherUser)}
            className="text-zinc-400 hover:text-zinc-100 transition p-2 rounded-full hover:bg-zinc-800"
            title="Llamar"
          >
            <Phone size={20} />
          </button>
        )}
      </div>

      {incomingCall && incomingCall.from.id === chat.otherUser?.id && (
        <div className="flex items-center gap-3 mb-3 px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <div className="relative">
            <Avatar src={incomingCall.from.avatar_url} size={40} />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-zinc-100 text-sm font-medium">{incomingCall.from.username} te está llamando</p>
            <p className="text-green-400 text-xs">Llamada entrante</p>
          </div>
          <button
            onClick={() => onJoinCall?.(incomingCall.from, incomingCall.sdp)}
            className="rounded-full p-2.5 bg-green-600 text-white hover:bg-green-700 transition shrink-0"
            title="Unirse"
          >
            <Phone size={18} />
          </button>
          <button
            onClick={() => {
              api('/api/calls/end', {
                method: 'POST',
                body: JSON.stringify({ targetUserId: incomingCall.from.id }),
              }).catch(() => {})
              onClearIncomingCall?.()
            }}
            className="rounded-full p-2.5 bg-red-600 text-white hover:bg-red-700 transition shrink-0"
            title="Rechazar"
          >
            <PhoneOff size={18} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 mb-4" data-messages-container>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm">Cargando...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm">No hay mensajes aún. Enviá el primero.</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const date = new Date(msg.created_at)
            const today = new Date()
            const isNewDay = i === 0 || new Date(messages[i - 1].created_at).toDateString() !== date.toDateString()
            const isOwn = msg.sender_id === profile.id
            const isCallMsg = msg.content.startsWith('Llamada perdida de ')
            const displayContent = msg.deleted ? 'Mensaje eliminado' : msg.content

            return (
              <div key={msg.id}>
                {isNewDay && (
                  <p className="text-zinc-600 text-xs text-center py-2">
                    {date.getFullYear() === today.getFullYear()
                      ? date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
                      : date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
                {isCallMsg ? (
                  <div className="flex justify-center">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800/50">
                      <Phone size={14} className="text-zinc-500" />
                      <p className="text-zinc-500 text-xs">{msg.content}</p>
                      <p className="text-zinc-600 text-[10px]">
                        {date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ) : (
                <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] min-w-[100px] rounded-2xl px-4 py-3 break-words${isOwn ? ' cursor-pointer' : ''} ${
                      isOwn ? 'rounded-br-md' : 'rounded-bl-md'
                    } ${isOwn && popupMsgId === msg.id ? 'relative' : ''}`}
                      data-message-bubble={isOwn ? '' : undefined}
                    style={{
                      backgroundColor: isOwn ? 'var(--color-accent)' : '#27272a',
                    }}
                    onClick={() => isOwn && handleMessageTap(msg, msg.id)}
                  >
                    <p className={`text-sm ${msg.deleted ? 'text-zinc-400 italic' : 'text-zinc-100'}`}>{displayContent}</p>
                    <p className="text-zinc-400 text-[10px] text-right mt-1">
                      {date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      {msg.edited_at && !msg.deleted && (
                          <span className="text-zinc-400 ml-1">(editado)</span>
                      )}
                    </p>
                    {isOwn && popupMsgId === msg.id && (
                      <div className="absolute z-10 right-0 bottom-full mb-1.5 flex flex-col bg-zinc-800 rounded-lg py-0.5 shadow-lg border border-zinc-700 whitespace-nowrap min-w-[110px]" data-popup-menu>
                        <button
                          onClick={() => handleStartEdit(msg)}
                          className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-700 transition text-xs text-zinc-300"
                        >
                          <Pencil size={11} />
                          Editar
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(msg.id)}
                          disabled={deleteMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-red-900/40 transition text-xs text-red-400 disabled:opacity-40"
                        >
                          <Trash2 size={11} />
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="text-red-400 text-xs mb-2 text-center">{error}</p>
      )}

      {editingMsgId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={handleCancelEdit} data-edit-modal>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center p-4 border-b border-zinc-800 relative">
              <h2 className="text-zinc-100 font-semibold text-lg">Editar mensaje</h2>
              <button onClick={handleCancelEdit} className="absolute right-4 text-zinc-400 hover:text-zinc-200 transition p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <input
                type="text"
                value={editContent}
                onChange={e => { setEditContent(e.target.value); setError('') }}
                onKeyDown={handleEditKeyDown}
                maxLength={300}
                autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-100 text-sm outline-none focus:border-zinc-500 transition"
              />
            </div>
            <div className="flex justify-center pb-4 px-4">
              <button
                onClick={handleSaveEdit}
                disabled={!editContent.trim() || editContent.trim() === messages.find(m => m.id === editingMsgId)?.content || editMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {!isFriend ? (
        <div className="flex flex-col items-center gap-2 py-4 px-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <p className="text-zinc-400 text-sm text-center">
            No podés enviar mensajes a menos que sean amigos.
          </p>
          {friendRequestSent ? (
            <button
              disabled
              className="rounded-full px-5 py-2 text-sm font-medium text-white opacity-60 cursor-not-allowed"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              Solicitud de amistad enviada
            </button>
          ) : (
            <button
              onClick={handleSendFriendRequest}
              className="rounded-full px-5 py-2 text-sm font-medium text-white transition hover:opacity-80"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              Enviar solicitud de amistad
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value); setError(''); emitTyping() }}
            onKeyDown={handleKeyDown}
            placeholder="Escribí un mensaje..."
            maxLength={300}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2.5 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-zinc-600 transition"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            className="rounded-full p-2.5 transition disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <Send size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
