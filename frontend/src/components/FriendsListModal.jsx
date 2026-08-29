import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { spring } from '../lib/motion'
import Avatar from './Avatar'

export default function FriendsListModal({ username, onClose }) {
  const navigate = useNavigate()

  const { data: friends = [], isLoading: loading, error } = useQuery({
    queryKey: ['friendsModal', username],
    queryFn: async () => {
      const res = await api(`/api/friends/${encodeURIComponent(username)}`)
      if (!res.ok) throw new Error('Error al cargar amigos')
      const data = await res.json()
      return data.friends || []
    },
  })

  return (
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
            <h2 className="text-zinc-100 font-semibold text-[17px] tracking-[-0.015em]">Amigos</h2>
            <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="absolute right-3 w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors">
              <X size={16} />
            </motion.button>
          </div>
          <div className="overflow-y-auto p-2 flex-1">
            {loading ? (
              <p className="text-zinc-500 text-sm text-center py-8">Cargando...</p>
            ) : error ? (
              <p className="text-red-400 text-sm text-center py-8">{String(error.message || error)}</p>
            ) : friends.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">No tiene amigos</p>
            ) : (
              <ul className="space-y-1">
                {friends.map(f => (
                  <li key={f.id}>
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { onClose(); navigate(`/${f.username}`) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left tap-highlight"
                    >
                      <Avatar src={f.avatar_url} size={36} />
                      <span className="text-zinc-200 text-sm font-medium tracking-[-0.011em]">{f.username}</span>
                    </motion.button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
