import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { socket } from '../lib/socket'
import { spring } from '../lib/motion'
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
    const removeRequest = (data) => queryClient.setQueryData(['pendingRequests'], (old) => (old || []).filter(r => r.id !== data.id))
    socket.on('friend_request_updated', removeRequest); socket.on('friend_request_cancelled', removeRequest)
    return () => { socket.off('friend_request_updated', removeRequest); socket.off('friend_request_cancelled', removeRequest) }
  }, [queryClient])

  const cancelMutation = useMutation({
    mutationFn: async (request) => {
      const res = await api(`/api/friends/request/${request.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al cancelar solicitud')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRequestsCount'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const handleCancel = () => {
    if (!confirming || cancelMutation.isPending) return
    cancelMutation.mutate(confirming, { onSettled: () => setConfirming(null) })
  }

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-center text-zinc-200 text-[17px] font-semibold tracking-[-0.015em] mb-6">Solicitudes enviadas</h2>
      {isLoading ? (
        <ul className="space-y-1.5">
          {[1,2,3,4].map(i => (
            <li key={i} className="material-thin rounded-2xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3"><SkeletonAvatar size={32} /><SkeletonBox className="h-4 w-24" /></div>
              <SkeletonBox className="h-4 w-4" />
            </li>
          ))}
        </ul>
      ) : requests.length === 0 ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-zinc-500 text-sm text-center">No hay nadie por aca.</p></div>
      ) : (
        <ul className="space-y-1.5">
          {requests.map(r => (
            <li key={r.id} className="material-thin rounded-2xl px-4 py-3 flex items-center justify-between">
              <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate(`/${r.receiver.username}`)} className="flex items-center gap-3 tap-highlight">
                <Avatar src={r.receiver.avatar_url} size={32} />
                <span className="text-zinc-100 text-sm font-medium tracking-[-0.011em]">{r.receiver.username}</span>
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => setConfirming(r)} className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-white/[0.08] transition-colors tap-highlight"><X size={16} /></motion.button>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {confirming && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setConfirming(null)}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
            <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={spring.default} className="relative bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-2xl px-6 py-5 w-full max-w-xs shadow-[0_24px_64px_rgba(0,0,0,0.5)] will-change-transform" onClick={e => e.stopPropagation()}>
              <p className="text-zinc-100 text-sm tracking-[-0.011em] mb-4">¿Cancelar solicitud a {confirming.receiver.username}?</p>
              <div className="flex gap-2 justify-end">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirming(null)} className="bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 rounded-xl px-4 py-2 text-sm font-medium transition-colors">Cancelar</motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleCancel} disabled={cancelMutation.isPending} className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm">{cancelMutation.isPending ? 'Cancelando...' : 'Aceptar'}</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
