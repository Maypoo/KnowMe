import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import Avatar from './Avatar'
import { SkeletonBox, SkeletonAvatar } from './Skeleton'

export default function ChatsList({ onSelectChat }) {
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
