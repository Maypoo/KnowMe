import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import Avatar from './Avatar'

export default function NewChat({ onSelectFriend, onBack }) {
  const [friends, setFriends] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/friends')
      .then(res => res.json())
      .then(data => { if (data.friends) setFriends(data.friends) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors tap-highlight">
          <ChevronLeft size={16} />
        </motion.button>
        <span className="text-zinc-100 text-sm font-semibold tracking-[-0.011em]">Nuevo chat</span>
      </div>

      {!loading && friends.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar amigos..."
            className="w-full bg-zinc-800/80 border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-zinc-100 placeholder-zinc-500 text-sm tracking-[-0.011em] focus:outline-none focus:border-[var(--color-accent)]/30 transition-colors"
          />
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-zinc-500 text-sm">Cargando...</p></div>
      ) : friends.length === 0 ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-zinc-500 text-sm">No tenés amigos para agregar.</p></div>
      ) : (
        <ul className="space-y-1">
          {(search.trim() ? friends.filter(f => f.username.toLowerCase().includes(search.trim().toLowerCase())) : friends).map(f => (
            <li key={f.id}>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectFriend(f)}
                className="w-full material-thin rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-white/[0.06] transition-colors tap-highlight text-left will-change-transform"
              >
                <Avatar src={f.avatar_url} size={36} />
                <span className="text-zinc-100 text-sm font-medium tracking-[-0.011em]">{f.username}</span>
              </motion.button>
            </li>
          ))}
          {search.trim() && friends.filter(f => f.username.toLowerCase().includes(search.trim().toLowerCase())).length === 0 && (
            <div className="flex-1 flex items-center justify-center pt-8"><p className="text-zinc-500 text-sm">No se encontraron amigos.</p></div>
          )}
        </ul>
      )}
    </div>
  )
}
