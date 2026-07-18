import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { socket } from '../lib/socket'
import Avatar from './Avatar'
import { SkeletonBox, SkeletonAvatar } from './Skeleton'

export default function PendingRequests() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(null)

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['pendingRequests'],
    queryFn: async () => {
      const res = await api('/api/friends/pending')
      const data = await res.json()
      return data.requests || []
    },
  })

  useEffect(() => {
    const removeRequest = (data) => {
      queryClient.setQueryData(['pendingRequests'], (old) =>
        (old || []).filter(r => r.id !== data.id)
      )
    }
    socket.on('friend_request_updated', removeRequest)
    socket.on('friend_request_cancelled', removeRequest)
    return () => {
      socket.off('friend_request_updated', removeRequest)
      socket.off('friend_request_cancelled', removeRequest)
    }
  }, [queryClient])

  const cancelMutation = useMutation({
    mutationFn: async (request) => {
      const res = await api(`/api/friends/request/${request.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al cancelar solicitud')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRequestsCount'] })
    },
  })

  const handleCancel = () => {
    if (!confirming || cancelMutation.isPending) return
    cancelMutation.mutate(confirming, {
      onSettled: () => setConfirming(null),
    })
  }

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-center text-zinc-300 text-lg font-semibold mb-6">Solicitudes enviadas</h2>
      {isLoading ? (
        <ul className="space-y-1">
          {[1,2,3,4].map(i => (
            <li key={i} className="bg-zinc-900 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SkeletonAvatar size={32} />
                <SkeletonBox className="h-4 w-24" />
              </div>
              <SkeletonBox className="h-4 w-4" />
            </li>
          ))}
        </ul>
      ) : requests.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-600 text-sm text-center">No hay nadie por aca.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {requests.map(r => (
            <li key={r.id} className="bg-zinc-900 rounded-lg px-4 py-3 flex items-center justify-between">
              <button onClick={() => navigate(`/${r.receiver.username}`)} className="flex items-center gap-3 hover:opacity-80 transition">
                <Avatar src={r.receiver.avatar_url} size={32} />
                <span className="text-zinc-100 text-sm">{r.receiver.username}</span>
              </button>
              <button
                onClick={() => setConfirming(r)}
                    className="text-zinc-600 hover:text-red-400 transition"
                  >
                    <X size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirming(null)} />
          <div className="relative bg-zinc-900 rounded-xl px-6 py-5 w-full max-w-xs">
            <p className="text-zinc-100 text-sm mb-4">
              ¿Cancelar solicitud a {confirming.receiver.username}?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm transition disabled:opacity-50"
              >
                {cancelMutation.isPending ? 'Cancelando...' : 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
