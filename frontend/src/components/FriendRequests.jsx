import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
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
      const res = await api('/api/friends/respond', { method: 'POST', body: JSON.stringify({ requestId, action }) })
      if (!res.ok) throw new Error('Error al responder')
    },
    onMutate: async ({ requestId }) => {
      await queryClient.cancelQueries({ queryKey: ['friendRequests'] })
      const prev = queryClient.getQueryData(['friendRequests'])
      queryClient.setQueryData(['friendRequests'], (old) => (old || []).filter(r => r.id !== requestId))
      return { prev }
    },
    onError: (_, __, context) => { if (context?.prev) queryClient.setQueryData(['friendRequests'], context.prev) },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRequestsCount'] })
    },
  })

  const handleRespond = (requestId, action) => respondMutation.mutate({ requestId, action })

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-center text-zinc-200 text-[17px] font-semibold tracking-[-0.015em] mb-6">Solicitudes de amistad</h2>
      {isLoading ? (
        <ul className="space-y-1.5">
          {[1,2,3,4].map(i => (
            <li key={i} className="flex items-center justify-between material-thin rounded-2xl px-4 py-3">
              <div className="flex items-center gap-3"><SkeletonAvatar size={32} /><SkeletonBox className="h-4 w-24" /></div>
              <div className="flex gap-2"><SkeletonBox className="h-7 w-16 rounded-xl" /><SkeletonBox className="h-7 w-16 rounded-xl" /></div>
            </li>
          ))}
        </ul>
      ) : requests.length === 0 ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-zinc-500 text-sm text-center">No hay nadie por aca.</p></div>
      ) : (
        <ul className="space-y-1.5">
          {requests.map(req => (
            <li key={req.id} className="flex items-center justify-between material-thin rounded-2xl px-4 py-3">
              <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate(`/${req.sender.username}`)} className="flex items-center gap-3 tap-highlight">
                <Avatar src={req.sender.avatar_url} size={32} />
                <span className="text-zinc-100 text-sm font-medium tracking-[-0.011em]">{req.sender.username}</span>
              </motion.button>
              <div className="flex gap-2">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleRespond(req.id, 'accepted')} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-colors shadow-sm tap-highlight">Aceptar</motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleRespond(req.id, 'rejected')} className="bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors tap-highlight">Rechazar</motion.button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
