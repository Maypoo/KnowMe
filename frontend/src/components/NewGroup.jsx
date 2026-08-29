import { useEffect, useState, useRef } from 'react'
import { Check, ChevronLeft, Users, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/api'
import { spring } from '../lib/motion'
import Avatar from './Avatar'

const MAX_MEMBERS = 3

export default function NewGroup({ onBack, onCreateGroup }) {
  const [friends, setFriends] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [showDetails, setShowDetails] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [iconBase64, setIconBase64] = useState(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    api('/api/friends').then(res => res.json()).then(data => { if (data.friends) setFriends(data.friends) }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const toggleFriend = (friend) => {
    setError('')
    setSelected(prev => {
      if (prev.some(f => f.id === friend.id)) return prev.filter(f => f.id !== friend.id)
      if (prev.length >= MAX_MEMBERS) return prev
      return [...prev, friend]
    })
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) { setError('Formato no soportado. Usá PNG, JPG, GIF o WebP.'); return }
    setError('')
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const size = 200; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
        const ctx = canvas.getContext('2d'); const minSide = Math.min(img.naturalWidth, img.naturalHeight)
        const sx = (img.naturalWidth - minSide) / 2; const sy = (img.naturalHeight - minSide) / 2
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size)
        setIconBase64(canvas.toDataURL('image/jpeg', 0.9))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  const handleCreate = async () => {
    if (creating) return
    setCreating(true); setError('')
    try {
      const res = await api('/api/chats/group', { method: 'POST', body: JSON.stringify({ userIds: selected.map(f => f.id), name: groupName.trim() || null, icon: iconBase64 || null }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error al crear el grupo'); return }
      onCreateGroup(data.chat)
    } catch (err) { console.error(err); setError('Error al crear el grupo') }
    finally { setCreating(false) }
  }

  const filtered = search.trim() ? friends.filter(f => f.username.toLowerCase().includes(search.trim().toLowerCase())) : friends

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors tap-highlight">
          <ChevronLeft size={16} />
        </motion.button>
        <span className="text-zinc-100 text-sm font-semibold tracking-[-0.011em]">Nuevo grupo</span>
      </div>

      {!loading && friends.length > 0 && (
        <div className="mb-4">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar amigos..." className="w-full bg-zinc-800/80 border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-zinc-100 placeholder-zinc-500 text-sm tracking-[-0.011em] focus:outline-none focus:border-[var(--color-accent)]/30 transition-colors" />
        </div>
      )}

      {selected.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-zinc-500 text-xs font-medium">{selected.length} de {MAX_MEMBERS} seleccionados</span>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowDetails(true)} disabled={selected.length === 0} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors shadow-sm tap-highlight">Crear grupo</motion.button>
        </div>
      )}

      {error && <p className="text-red-400 text-xs mb-2 text-center">{error}</p>}

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-zinc-500 text-sm">Cargando...</p></div>
      ) : friends.length === 0 ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-zinc-500 text-sm">No tenés amigos para agregar.</p></div>
      ) : (
        <ul className="space-y-1">
          {filtered.map(f => {
            const isSelected = selected.some(s => s.id === f.id)
            const disabled = !isSelected && selected.length >= MAX_MEMBERS
            return (
              <li key={f.id}>
                <motion.button
                  whileTap={{ scale: disabled ? 1 : 0.98 }}
                  onClick={() => toggleFriend(f)}
                  disabled={disabled}
                  className={`w-full rounded-2xl px-4 py-3 flex items-center gap-3 border transition-colors tap-highlight ${isSelected ? 'material-regular border-white/[0.06]' : 'material-thin hover:bg-white/[0.06]'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <Avatar src={f.avatar_url} size={36} />
                  <span className="flex-1 text-left text-zinc-100 text-sm font-medium tracking-[-0.011em]">{f.username}</span>
                  <span className={`w-6 h-6 rounded-full border flex items-center justify-center transition shrink-0 ${isSelected ? 'text-white' : 'border-white/20 text-transparent'}`} style={isSelected ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : {}}><Check size={12} strokeWidth={3} /></span>
                </motion.button>
              </li>
            )
          })}
          {filtered.length === 0 && <div className="flex-1 flex items-center justify-center pt-8"><p className="text-zinc-500 text-sm">No se encontraron amigos.</p></div>}
        </ul>
      )}

      <AnimatePresence>
        {showDetails && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowDetails(false)}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
            <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={spring.default} className="relative bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-[1.25rem] w-full max-w-md shadow-[0_24px_64px_rgba(0,0,0,0.5)] overflow-hidden will-change-transform" onClick={e => e.stopPropagation()} style={{ transformOrigin: 'center center' }}>
              <div className="flex items-center justify-center p-4 border-b border-white/[0.06] relative">
                <h2 className="text-zinc-100 font-semibold text-[17px] tracking-[-0.015em]">Detalles del grupo</h2>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowDetails(false)} className="absolute right-3 w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"><X size={16} /></motion.button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-2 text-center tracking-[-0.011em]">Icono del grupo (opcional)</p>
                  <div className="flex justify-center">
                    <div className="relative">
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-full bg-zinc-800 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:border-white/15 transition-colors overflow-hidden tap-highlight">
                        {iconBase64 ? <img src={iconBase64} alt="Icono" className="w-full h-full object-cover" /> : <Users size={28} className="text-zinc-500" />}
                      </motion.button>
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleFileSelect} className="hidden" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-2 tracking-[-0.011em]">Nombre del grupo (opcional)</p>
                  <input type="text" value={groupName} onChange={e => { setGroupName(e.target.value); setError('') }} maxLength={60} placeholder="Nombre del grupo" className="w-full bg-zinc-800/80 border border-white/[0.06] rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-500 text-sm tracking-[-0.011em] outline-none focus:border-[var(--color-accent)]/30 transition-colors" />
                </div>
                <p className="text-xs text-zinc-500 text-center leading-relaxed">{selected.map(f => f.username).join(', ')} · sin nombre se usan los nombres de los participantes</p>
                <div className="flex justify-center pt-2">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleCreate} disabled={creating} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors shadow-sm tap-highlight">{creating ? 'Creando...' : 'Crear grupo'}</motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
