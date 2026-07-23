import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import Avatar from './Avatar'

export default function FollowersList({ username, onClose }) {
  const navigate = useNavigate()

  const { data: followers = [], isLoading: loading, error } = useQuery({
    queryKey: ['followers', username],
    queryFn: async () => {
      const res = await api(`/api/followers/${encodeURIComponent(username)}`)
      if (!res.ok) throw new Error('Error al cargar seguidores')
      const data = await res.json()
      return data.followers || []
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 rounded-xl w-full max-w-sm max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-center px-5 py-4 border-b border-zinc-800 relative">
          <h2 className="text-zinc-100 font-medium">Seguidores</h2>
          <button onClick={onClose} className="absolute right-5 text-zinc-500 hover:text-zinc-300 transition">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-2 flex-1">
          {loading ? (
            <p className="text-zinc-500 text-sm text-center py-8">Cargando...</p>
          ) : error ? (
            <p className="text-red-400 text-sm text-center py-8">{error}</p>
          ) : followers.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">No tiene seguidores</p>
          ) : (
            <ul className="space-y-1">
              {followers.map(f => (
                <li key={f.id}>
                  <button
                    onClick={() => {
                      onClose()
                      navigate(`/${f.username}`)
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/50 transition text-left"
                  >
                    <Avatar src={f.avatar_url} size={36} />
                    <span className="text-zinc-200 text-sm font-medium">{f.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
