import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import Avatar from './Avatar'
import { SkeletonBox, SkeletonAvatar } from './Skeleton'

export default function FriendRequests() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['friendRequests'],
    queryFn: async () => {
      const res = await api('/api/friends/requests')
      const data = await res.json()
      return data.requests || []
    },
  })

  const respondMutation = useMutation({
    mutationFn: async ({ requestId, action }) => {
      const res = await api('/api/friends/respond', {
        method: 'POST',
        body: JSON.stringify({ requestId, action }),
      })
      if (!res.ok) throw new Error('Error al responder')
    },
    onMutate: async ({ requestId }) => {
      await queryClient.cancelQueries({ queryKey: ['friendRequests'] })
      const prev = queryClient.getQueryData(['friendRequests'])
      queryClient.setQueryData(['friendRequests'], (old) =>
        (old || []).filter(r => r.id !== requestId)
      )
      return { prev }
    },
    onError: (_, __, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['friendRequests'], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRequestsCount'] })
    },
  })

  const handleRespond = (requestId, action) => {
    respondMutation.mutate({ requestId, action })
  }

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-center text-zinc-300 text-lg font-semibold mb-6">Solicitudes de amistad</h2>
      {isLoading ? (
        <ul className="space-y-3">
          {[1,2,3,4].map(i => (
            <li key={i} className="flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <SkeletonAvatar size={32} />
                <SkeletonBox className="h-4 w-24" />
              </div>
              <div className="flex gap-2">
                <SkeletonBox className="h-7 w-16 rounded-lg" />
                <SkeletonBox className="h-7 w-16 rounded-lg" />
              </div>
            </li>
          ))}
        </ul>
      ) : requests.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-600 text-sm text-center">No hay nadie por aca.</p>
          </div>
      ) : (
        <ul className="space-y-3">
          {requests.map(req => (
            <li key={req.id} className="flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3">
              <button onClick={() => navigate(`/${req.sender.username}`)} className="flex items-center gap-3 hover:opacity-80 transition">
                <Avatar src={req.sender.avatar_url} size={32} />
                <span className="text-zinc-100 text-sm">{req.sender.username}</span>
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRespond(req.id, 'accepted')}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                >
                  Aceptar
                </button>
                <button
                  onClick={() => handleRespond(req.id, 'rejected')}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 text-xs transition"
                >
                  Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
