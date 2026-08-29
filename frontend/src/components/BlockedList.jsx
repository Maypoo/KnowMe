import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { spring } from '../lib/motion'
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
      <AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={spring.default}
            className="relative bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-[1.25rem] w-full max-w-sm max-h-[70vh] flex flex-col shadow-[0_24px_64px_rgba(0,0,0,0.5)] overflow-hidden will-change-transform"
            onClick={e => e.stopPropagation()}
            style={{ transformOrigin: 'center center' }}
          >
            <div className="flex items-center justify-center px-5 py-4 border-b border-white/[0.06] relative shrink-0">
              <h2 className="text-zinc-100 font-semibold text-[17px] tracking-[-0.015em]">Bloqueados</h2>
              <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="absolute right-3 w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors">
                <X size={16} />
              </motion.button>
            </div>
            <div className="overflow-y-auto p-2 flex-1">
              {loading ? (
                <p className="text-zinc-500 text-sm text-center py-8">Cargando...</p>
              ) : error ? (
                <p className="text-red-400 text-sm text-center py-8">{String(error.message || error)}</p>
              ) : blocked.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">No hay usuarios bloqueados</p>
              ) : (
                <ul className="space-y-1">
                  {blocked.map(u => (
                    <li key={u.id}>
                      <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors text-left">
                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          onClick={() => { onClose(); navigate(`/${u.username}`) }}
                          className="flex items-center gap-3 flex-1 text-left tap-highlight"
                        >
                          <Avatar src={u.avatar_url} size={36} />
                          <span className="text-zinc-200 text-sm font-medium tracking-[-0.011em] truncate">{u.display_name || u.username}</span>
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirming(u)} className="bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors tap-highlight shrink-0">Desbloquear</motion.button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {confirming && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={() => setConfirming(null)}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={spring.default}
              className="relative bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-2xl px-6 py-5 w-full max-w-xs shadow-[0_24px_64px_rgba(0,0,0,0.5)] will-change-transform"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-zinc-100 text-sm tracking-[-0.011em] mb-4">¿Desbloquear a @{confirming.username.replace(/^@/, '')}?</p>
              <div className="flex gap-2 justify-end">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirming(null)} className="bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 rounded-xl px-4 py-2 text-sm font-medium transition-colors">Cancelar</motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleUnblock(confirming)} disabled={unblocking} className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm">{unblocking ? 'Desbloqueando...' : 'Desbloquear'}</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
