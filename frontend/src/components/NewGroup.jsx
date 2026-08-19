import { useEffect, useState, useRef } from 'react'
import { Check, ChevronLeft, Users, X } from 'lucide-react'
import { api } from '../lib/api'
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
    api('/api/friends')
      .then(res => res.json())
      .then(data => {
        if (data.friends) setFriends(data.friends)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleFriend = (friend) => {
    setError('')
    setSelected(prev => {
      if (prev.some(f => f.id === friend.id)) {
        return prev.filter(f => f.id !== friend.id)
      }
      if (prev.length >= MAX_MEMBERS) return prev
      return [...prev, friend]
    })
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Formato no soportado. Usá PNG, JPG, GIF o WebP.')
      return
    }
    setError('')
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const size = 200
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        const minSide = Math.min(img.naturalWidth, img.naturalHeight)
        const sx = (img.naturalWidth - minSide) / 2
        const sy = (img.naturalHeight - minSide) / 2
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size)
        setIconBase64(canvas.toDataURL('image/jpeg', 0.9))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    setError('')
    try {
      const res = await api('/api/chats/group', {
        method: 'POST',
        body: JSON.stringify({
          userIds: selected.map(f => f.id),
          name: groupName.trim() || null,
          icon: iconBase64 || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al crear el grupo')
        return
      }
      onCreateGroup(data.chat)
    } catch (err) {
      console.error(err)
      setError('Error al crear el grupo')
    } finally {
      setCreating(false)
    }
  }

  const filtered = search.trim()
    ? friends.filter(f => f.username.toLowerCase().includes(search.trim().toLowerCase()))
    : friends

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-100 transition">
          <ChevronLeft size={24} />
        </button>
        <span className="text-zinc-100 text-sm font-medium">Nuevo grupo</span>
      </div>

      {!loading && friends.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar amigos..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-zinc-600 transition"
          />
        </div>
      )}

      {selected.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-zinc-500 text-xs">
            {selected.length} de {MAX_MEMBERS} seleccionados
          </span>
          <button
            onClick={() => setShowDetails(true)}
            disabled={selected.length === 0}
            className="px-4 py-2 rounded-lg text-sm text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            Crear grupo
          </button>
        </div>
      )}

      {error && <p className="text-red-400 text-xs mb-2 text-center">{error}</p>}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">Cargando...</p>
        </div>
      ) : friends.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">No tenés amigos para agregar.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {filtered.map(f => {
            const isSelected = selected.some(s => s.id === f.id)
            const disabled = !isSelected && selected.length >= MAX_MEMBERS
            return (
              <li key={f.id}>
                <button
                  onClick={() => toggleFriend(f)}
                  disabled={disabled}
                  className={`w-full bg-zinc-900 rounded-lg px-4 py-3 flex items-center gap-3 transition ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800'}`}
                >
                  <Avatar src={f.avatar_url} size={40} />
                  <span className="flex-1 text-left text-zinc-100 text-sm">{f.username}</span>
                  <span
                    className={`w-6 h-6 rounded-full border flex items-center justify-center transition shrink-0 ${
                      isSelected ? 'text-white' : 'border-zinc-600 text-transparent'
                    }`}
                    style={isSelected ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : {}}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                </button>
              </li>
            )
          })}
          {filtered.length === 0 && (
            <div className="flex-1 flex items-center justify-center pt-8">
              <p className="text-zinc-600 text-sm">No se encontraron amigos.</p>
            </div>
          )}
        </ul>
      )}

      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60" onClick={() => setShowDetails(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center p-4 border-b border-zinc-800 relative">
              <h2 className="text-zinc-100 font-semibold text-lg">Detalles del grupo</h2>
              <button onClick={() => setShowDetails(false)} className="absolute right-4 text-zinc-400 hover:text-zinc-200 transition p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs text-zinc-500 mb-2 text-center">Icono del grupo (opcional)</p>
                <div className="flex justify-center">
                  <div className="relative">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-16 h-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition overflow-hidden"
                      title="Icono del grupo"
                    >
                      {iconBase64 ? <img src={iconBase64} alt="Icono" className="w-full h-full object-cover" /> : <Users size={32} className="text-zinc-400" />}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-2">Nombre del grupo (opcional)</p>
                <input
                  type="text"
                  value={groupName}
                  onChange={e => { setGroupName(e.target.value); setError('') }}
                  maxLength={60}
                  placeholder="Nombre del grupo"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-600 text-sm outline-none focus:border-zinc-500 transition"
                />
              </div>
              <p className="text-xs text-zinc-600 text-center">
                {selected.map(f => f.username).join(', ')} · sin nombre se usan los nombres de los participantes
              </p>
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="px-4 py-2 rounded-lg text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                >
                  {creating ? 'Creando...' : 'Crear grupo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

