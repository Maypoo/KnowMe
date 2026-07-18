import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import Avatar from './Avatar'
import { SkeletonBox, SkeletonAvatar } from './Skeleton'

export default function FriendsList() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(null)

  const { data: friends = [], isLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      const res = await api('/api/friends')
      const data = await res.json()
      return data.friends || []
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (friend) => {
      const res = await api(`/api/friends/${friend.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar amigo')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    },
  })

  const handleRemove = () => {
    if (!confirming) return
    removeMutation.mutate(confirming, {
      onSettled: () => setConfirming(null),
    })
  }

  const filtered = search.trim()
    ? friends.filter(f => f.username.toLowerCase().includes(search.trim().toLowerCase()))
    : friends

  const hasFriends = friends.length > 0
  const showList = hasFriends && filtered.length > 0

  return (
    <div className={showList || isLoading ? '' : 'flex-1 flex flex-col'}>
      <h2 className="text-center text-zinc-300 text-lg font-semibold mb-3">Buscar</h2>
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar amigos..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-zinc-600 transition"
        />
      </div>
      {isLoading ? (
        <>
          <h3 className="text-zinc-400 text-sm font-medium mb-3">Amigos</h3>
          <ul className="space-y-1">
            {[1,2,3,4,5].map(i => (
              <li key={i} className="bg-zinc-900 rounded-lg px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SkeletonAvatar size={32} />
                  <SkeletonBox className="h-4 w-24" />
                </div>
                <SkeletonBox className="h-4 w-4" />
              </li>
            ))}
          </ul>
        </>
      ) : hasFriends && (
        <>
          <h3 className="text-zinc-400 text-sm font-medium mb-3">Amigos</h3>
          {filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-zinc-600 text-sm">No se encontraron amigos.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map(f => (
                <li key={f.id} className="bg-zinc-900 rounded-lg px-4 py-3 flex items-center justify-between">
                  <button onClick={() => navigate(`/${f.username}`)} className="flex items-center gap-3 hover:opacity-80 transition">
                    <Avatar src={f.avatar_url} size={32} />
                    <span className="text-zinc-100 text-sm">{f.username}</span>
                  </button>
                  <button
                    onClick={() => setConfirming(f)}
                    className="text-zinc-600 hover:text-red-400 transition"
                  >
                    <X size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!isLoading && !hasFriends && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">No hay nadie por aca.</p>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirming(null)} />
          <div className="relative bg-zinc-900 rounded-xl px-6 py-5 w-full max-w-xs">
            <p className="text-zinc-100 text-sm mb-4">
              ¿Eliminar a {confirming.username} de tus amigos?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleRemove}
                disabled={removeMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm transition disabled:opacity-50"
              >
                {removeMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
