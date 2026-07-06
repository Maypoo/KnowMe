import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { socket } from '../lib/socket'
import Avatar from './Avatar'

export default function ChatConversation({ chat, onBack, profile }) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!chat?.id) return
    setLoading(true)
    setMessages([])

    api(`/api/chats/${chat.id}/messages`)
      .then(res => res.json())
      .then(data => {
        if (data.messages) setMessages(data.messages)
      })
      .finally(() => setLoading(false))

    api(`/api/chats/${chat.id}/read`, { method: 'POST' }).catch(() => {})
  }, [chat?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const handleNewMessage = (data) => {
      if (data.chatId === chat.id) {
        setMessages(prev => {
          if (prev.some(m => m.id === data.message.id)) return prev
          return [...prev, data.message]
        })
      }
    }

    socket.on('new_message', handleNewMessage)
    return () => socket.off('new_message', handleNewMessage)
  }, [chat.id])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    if (text.length > 300) {
      setError('El mensaje no puede superar los 300 caracteres')
      return
    }

    setError('')
    setSending(true)
    setInput('')
    try {
      const res = await api(`/api/chats/${chat.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessages(prev => [...prev, data.message])
      } else {
        setError(data.error || 'Error al enviar el mensaje')
      }
    } catch {
      setError('Error al enviar el mensaje')
    } finally {
      setSending(false)
    }
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-100 transition">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button onClick={handleOpenProfile} className="flex items-center gap-3 hover:opacity-80 transition">
          <Avatar src={chat.otherUser?.avatar_url} size={36} />
          <span className="text-zinc-100 text-sm font-medium">{chat.otherUser?.username}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 mb-4">
        {loading ? (
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
            return (
              <div key={msg.id}>
                {isNewDay && (
                  <p className="text-zinc-600 text-xs text-center py-2">
                    {date.getFullYear() === today.getFullYear()
                      ? date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
                      : date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
                <div className={`flex ${msg.sender_id === profile.id ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] min-w-[100px] rounded-2xl px-4 py-3 break-words ${
                      msg.sender_id === profile.id ? 'rounded-br-md' : 'rounded-bl-md'
                    }`}
                    style={{
                      backgroundColor: msg.sender_id === profile.id ? '#6659ff' : '#27272a',
                    }}
                  >
                    <p className="text-zinc-100 text-sm">{msg.content}</p>
                    <p className="text-zinc-400 text-[10px] text-right mt-1">
                      {date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
          )})
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="text-red-400 text-xs mb-2 text-center">{error}</p>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setError('') }}
          onKeyDown={handleKeyDown}
          placeholder="Escribí un mensaje..."
          maxLength={300}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2.5 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-zinc-600 transition"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="rounded-full p-2.5 transition disabled:opacity-40"
          style={{ backgroundColor: '#6659ff' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
