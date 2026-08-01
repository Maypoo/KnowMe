import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import Avatar from './Avatar'

export default function BlockedList({ onClose }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(null)
  const [unblocking, setUnblocking] = useState(false)

  const { data: blocked = [], isLoading: loading, error } = useQuery({
    queryKey: ['blockedList'],
    queryFn: async () => {
      const res = await api('/api/blocks')
      if (!res.ok) throw new Error('Error al cargar bloqueados')
      const data = await res.json()
      return data.users || []
    },
  })

  const handleUnblock = async (user) => {
    if (unblocking) return
    setUnblocking(true)
    try {
      const res = await api(`/api/blocks/${encodeURIComponent(user.username)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al desbloquear')
      queryClient.invalidateQueries({ queryKey: ['blockedList'] })
    } catch (err) {
      console.error(err)
    }
    setUnblocking(false)
    setConfirming(null)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative bg-zinc-900 rounded-xl w-full max-w-sm max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-center px-5 py-4 border-b border-zinc-800 relative">
            <h2 className="text-zinc-100 font-medium">Bloqueados</h2>
            <button onClick={onClose} className="absolute right-5 text-zinc-500 hover:text-zinc-300 transition">
              <X size={20} />
            </button>
          </div>
          <div className="overflow-y-auto p-2 flex-1">
            {loading ? (
              <p className="text-zinc-500 text-sm text-center py-8">Cargando...</p>
            ) : error ? (
              <p className="text-red-400 text-sm text-center py-8">{error}</p>
            ) : blocked.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">No hay usuarios bloqueados</p>
            ) : (
              <ul className="space-y-1">
                {blocked.map(u => (
                  <li key={u.id}>
                    <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/50 transition text-left">
                      <button
                        onClick={() => {
                          onClose()
                          navigate(`/${u.username}`)
                        }}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        <Avatar src={u.avatar_url} size={36} />
                        <span className="text-zinc-200 text-sm font-medium">{u.display_name || u.username}</span>
                      </button>
                      <button
                        onClick={() => setConfirming(u)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 text-sm transition"
                      >
                        Desbloquear
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirming(null)} />
          <div className="relative bg-zinc-900 rounded-xl px-6 py-5 w-full max-w-xs">
            <p className="text-zinc-100 text-sm mb-4">
              ¿Desbloquear a @{confirming.username.replace(/^@/, '')}?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUnblock(confirming)}
                disabled={unblocking}
                className="text-white rounded-lg px-4 py-2 text-sm transition disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                {unblocking ? 'Desbloqueando...' : 'Desbloquear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
