import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Crown, UserPlus, X, Check, ChevronLeft, Settings } from 'lucide-react'
import { api } from '../lib/api'
import { spring } from '../lib/motion'
import Avatar from './Avatar'
import GroupAvatar from './GroupAvatar'
import ImageCropModal from './ImageCropModal'

export default function GroupInfoModal({ chat, info, profile, onClose, onLeft }) {
  const queryClient = useQueryClient()
  const isAdmin = !!info?.isAdmin
  const [mode, setMode] = useState('view')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editIconBase64, setEditIconBase64] = useState(null)
  const [editIconUrl, setEditIconUrl] = useState(null)
  const [showIconEditor, setShowIconEditor] = useState(false)
  const [iconEditorPreviewUrl, setIconEditorPreviewUrl] = useState(null)
  const [menuMemberId, setMenuMemberId] = useState(null)
  const [menuPos, setMenuPos] = useState(null)
  const [confirmMemberId, setConfirmMemberId] = useState(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaveSuccessorId, setLeaveSuccessorId] = useState(null)
  const iconInputRef = useRef(null)

  useEffect(() => {
    setMode('view')
    setError('')
    setEditIconBase64(null)
    setEditIconUrl(null)
    setShowIconEditor(false)
    setIconEditorPreviewUrl(null)
    setMenuMemberId(null)
    setMenuPos(null)
    setConfirmMemberId(null)
    setConfirmLeave(false)
    setLeaveSuccessorId(null)
  }, [chat?.id])

  if (!chat) return null

  const participants = info?.participants || []
  const onlyAdmin = isAdmin && participants.filter(p => p.is_admin).length === 1 && participants.length > 1

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['messages', chat.id] })
    queryClient.invalidateQueries({ queryKey: ['chats'] })
  }

  const makeAdmin = async (memberId) => {
    setBusy(true)
    setError('')
    try {
      const res = await api(`/api/chats/${chat.id}/admins`, {
        method: 'POST',
        body: JSON.stringify({ userId: memberId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al dar administrador')
      } else {
        queryClient.setQueryData(['messages', chat.id], (old) => {
          if (!old) return old
          return {
            ...old,
            participants: (old.participants || []).map(p =>
              p.id === memberId ? { ...p, is_admin: true } : p
            ),
          }
        })
        invalidate()
      }
    } catch (err) {
      console.error(err)
      setError('Error al dar administrador')
    }
    setBusy(false)
    setConfirmMemberId(null)
  }

  const handleLeaveGroup = async () => {
    setBusy(true)
    setError('')
    try {
      const body = {}
      if (leaveSuccessorId) body.successorId = leaveSuccessorId
      const res = await api(`/api/chats/${chat.id}/leave`, { method: 'DELETE', body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al salir del grupo')
      } else {
        queryClient.removeQueries({ queryKey: ['messages', chat.id] })
        queryClient.setQueryData(['chats'], (chats) => {
          if (!chats) return chats
          const removed = chats.find(c => c.id === chat.id)
          const remaining = chats.filter(c => c.id !== chat.id)
          if (removed?.unreadCount) {
            queryClient.setQueryData(['chatsUnread'], (total) =>
              Math.max(0, (total || 0) - (removed.unreadCount || 0))
            )
          }
          return remaining
        })
        queryClient.invalidateQueries({ queryKey: ['chats'] })
        setConfirmLeave(false)
        onClose()
        onLeft?.()
      }
    } catch (err) {
      console.error(err)
      setError('Error al salir del grupo')
    }
    setBusy(false)
  }

  const handleIconSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Formato no soportado. Usá PNG, JPG, GIF o WebP.')
      return
    }
    setError('')
    const url = URL.createObjectURL(file)
    setIconEditorPreviewUrl(url)
    setShowIconEditor(true)
  }

  const handleIconEditorSave = (base64) => {
    setShowIconEditor(false)
    setEditIconBase64(base64)
    setEditIconUrl(null)
    if (iconEditorPreviewUrl) URL.revokeObjectURL(iconEditorPreviewUrl)
    setIconEditorPreviewUrl(null)
  }

  const handleIconEditorCancel = () => {
    setShowIconEditor(false)
    if (iconEditorPreviewUrl) URL.revokeObjectURL(iconEditorPreviewUrl)
    setIconEditorPreviewUrl(null)
    if (iconInputRef.current) iconInputRef.current.value = ''
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={spring.default}
          className="relative bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-[1.25rem] w-full max-w-md max-h-[85vh] flex flex-col shadow-[0_24px_64px_rgba(0,0,0,0.5)] overflow-hidden will-change-transform"
          onClick={e => e.stopPropagation()}
          style={{ transformOrigin: 'center center' }}
        >
          <div className="flex items-center justify-center p-4 border-b border-white/[0.06] relative shrink-0">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setMode('view')} className={`absolute left-3 w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors ${mode === 'view' ? 'invisible pointer-events-none' : ''}`}>
              <ChevronLeft size={16} />
            </motion.button>
            <h2 className="text-zinc-100 font-semibold text-[17px] tracking-[-0.015em]">
              {mode === 'view' ? 'Información del grupo' : mode === 'edit' ? 'Editar grupo' : 'Agregar personas'}
            </h2>
            <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="absolute right-3 w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors">
              <X size={16} />
            </motion.button>
          </div>

          <div className="overflow-y-auto p-4 flex-1">
            <div className="flex flex-col items-center gap-2 mb-4">
              {mode === 'edit' ? (
                <div className="relative group">
                  <GroupAvatar iconUrl={editIconBase64 || editIconUrl || info?.icon_url} size={72} />
                  <button onClick={() => iconInputRef.current?.click()} className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition" title="Cambiar icono">
                    <Camera size={24} className="text-zinc-200" />
                  </button>
                  <input ref={iconInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleIconSelect} className="hidden" />
                </div>
              ) : (
                <GroupAvatar iconUrl={info?.icon_url} size={72} />
              )}
              <p className="text-zinc-100 font-medium text-center tracking-[-0.011em]">{info?.name || 'Grupo'}</p>
              <p className="text-zinc-500 text-xs">{participants.length} miembro{participants.length !== 1 ? 's' : ''}</p>
            </div>

            {mode === 'view' && isAdmin && (
              <motion.button whileTap={{ scale: 0.98 }} onClick={() => { setMode('edit'); setError(''); setEditIconBase64(null); setEditIconUrl(info?.icon_url || null) }} className="w-full mb-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-colors tap-highlight shadow-sm">Editar grupo</motion.button>
            )}

            {mode === 'view' && isAdmin && (
              <motion.button whileTap={{ scale: 0.98 }} onClick={() => { setMode('add'); setError('') }} className="w-full mb-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-colors tap-highlight shadow-sm">Agregar personas</motion.button>
            )}

            {mode === 'view' && (
              <motion.button whileTap={{ scale: 0.98 }} onClick={() => { setError(''); setLeaveSuccessorId(null); setConfirmLeave(true) }} className="w-full mb-4 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors tap-highlight shadow-sm">Salir del grupo</motion.button>
            )}

            {mode === 'edit' ? (
              <EditGroupFields chat={chat} initialName={info?.name} iconBase64={editIconBase64} busy={busy} setBusy={setBusy} setError={setError} invalidate={invalidate} onDone={() => setMode('view')} />
            ) : mode === 'add' ? (
              <AddMembersFields chat={chat} existing={participants.map(p => p.id)} busy={busy} setBusy={setBusy} setError={setError} invalidate={invalidate} onDone={() => setMode('view')} />
            ) : (
              <ul className="space-y-1">
                {[...participants].sort((a, b) => {
                  if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1
                  if (a.id === profile?.id) return -1
                  if (b.id === profile?.id) return 1
                  return 0
                }).map(p => (
                  <li key={p.id} className="bg-white/[0.04] border border-white/[0.04] rounded-xl px-3 py-2.5 flex items-center gap-3">
                    <Avatar src={p.avatar_url} size={36} />
                    <span className="flex-1 text-left text-zinc-100 text-sm truncate tracking-[-0.011em]">
                      {p.username}
                      {p.id === profile?.id && <span className="text-zinc-500"> (yo)</span>}
                    </span>
                    {p.is_admin && (
                      <span title="Administrador" className="p-1.5 flex items-center justify-center shrink-0 text-amber-400">
                        <Crown size={16} />
                      </span>
                    )}
                    {isAdmin && !p.is_admin && p.id !== profile?.id && (
                      <div className="shrink-0">
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            if (menuMemberId === p.id) { setMenuMemberId(null); setMenuPos(null) }
                            else { const rect = e.currentTarget.getBoundingClientRect(); setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right }); setMenuMemberId(p.id) }
                          }}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${menuMemberId === p.id ? 'bg-white/[0.1] text-zinc-200' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]'}`}
                          title="Opciones"
                        >
                          <Settings size={14} />
                        </motion.button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {error && <p className="text-red-400 text-xs text-center mt-3">{error}</p>}
          </div>
        </motion.div>
        <ImageCropModal open={showIconEditor} previewUrl={iconEditorPreviewUrl} title="Editar foto" onSave={handleIconEditorSave} onCancel={handleIconEditorCancel} />
        {menuMemberId && menuPos && createPortal(
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring.snappy} className="fixed z-50 w-40 material-regular rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.5)] py-1.5 overflow-hidden will-change-transform" style={{ top: menuPos.top, right: menuPos.right, transformOrigin: 'top right' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { setMenuMemberId(null); setMenuPos(null); setConfirmMemberId(menuMemberId) }} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06] transition-colors">Hacer admin</button>
          </motion.div>,
          document.body
        )}
        <AnimatePresence>
          {confirmMemberId && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={e => { e.stopPropagation(); setConfirmMemberId(null) }}>
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
              <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={spring.default} className="relative bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-2xl px-6 py-5 w-full max-w-xs shadow-[0_24px_64px_rgba(0,0,0,0.5)] will-change-transform" onClick={e => e.stopPropagation()}>
                <p className="text-zinc-100 text-sm tracking-[-0.011em] mb-4">¿Dar administrador a {participants.find(p => p.id === confirmMemberId)?.username}?</p>
                <div className="flex gap-2 justify-end">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirmMemberId(null)} disabled={busy} className="bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">Cancelar</motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => makeAdmin(confirmMemberId)} disabled={busy} className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm">{busy ? 'Dando...' : 'Confirmar'}</motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {confirmLeave && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={e => { e.stopPropagation(); setConfirmLeave(false) }}>
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
              <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={spring.default} className="relative bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-2xl px-6 py-5 w-full max-w-xs shadow-[0_24px_64px_rgba(0,0,0,0.5)] will-change-transform" onClick={e => e.stopPropagation()}>
                <p className="text-zinc-100 text-sm tracking-[-0.011em] mb-3">{onlyAdmin ? 'Sos el único administrador. Elegí quién hereda el cargo antes de salir.' : `¿Salir del grupo ${info?.name || ''}?`}</p>
                {onlyAdmin && (
                  <ul className="space-y-1 mb-4">
                    {participants.filter(p => !p.is_admin && p.id !== profile?.id).map(p => (
                      <li key={p.id}>
                        <motion.button whileTap={{ scale: 0.98 }} onClick={() => setLeaveSuccessorId(p.id)} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${leaveSuccessorId === p.id ? 'bg-white/[0.08] border border-white/[0.06]' : 'bg-white/[0.04] hover:bg-white/[0.06] border border-transparent'}`}>
                          <Avatar src={p.avatar_url} size={28} />
                          <span className="flex-1 text-left text-zinc-100 text-sm truncate tracking-[-0.011em]">{p.username}</span>
                          {leaveSuccessorId === p.id && <Check size={16} className="shrink-0" style={{ color: 'var(--color-accent)' }} />}
                        </motion.button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 justify-end">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirmLeave(false)} disabled={busy} className="bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">Cancelar</motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleLeaveGroup} disabled={busy || (onlyAdmin && !leaveSuccessorId)} className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm">{busy ? 'Saliendo...' : 'Salir'}</motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}

function EditGroupFields({ chat, initialName, iconBase64, busy, setBusy, setError, invalidate, onDone }) {
  const [name, setName] = useState(initialName || '')
  const handleSave = async () => {
    if (busy) return
    if (!name.trim()) { setError('El nombre no puede estar vacío'); return }
    setBusy(true); setError('')
    try {
      const body = { name: name.trim() }
      if (iconBase64) body.icon = iconBase64
      const res = await api(`/api/chats/${chat.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Error al actualizar el grupo')
      else { invalidate(); onDone() }
    } catch (err) { console.error(err); setError('Error al actualizar el grupo') }
    setBusy(false)
  }
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-zinc-500 mb-2 tracking-[-0.011em]">Nombre del grupo</p>
        <input type="text" value={name} onChange={e => { setName(e.target.value); setError('') }} maxLength={60} placeholder="Nombre del grupo" className="w-full bg-zinc-800/80 border border-white/[0.06] rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-500 text-sm outline-none focus:border-[var(--color-accent)]/30 transition-colors" />
      </div>
      <div className="flex items-center justify-center">
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={busy} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 shadow-sm tap-highlight">{busy ? 'Guardando...' : 'Guardar'}</motion.button>
      </div>
    </div>
  )
}

function AddMembersFields({ chat, existing, busy, setBusy, setError, invalidate, onDone }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const queryClient = useQueryClient()
  const { data: friends = [], isLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => { const res = await api('/api/friends'); const data = await res.json(); return data.friends || [] },
  })
  const available = friends.filter(f => !existing.includes(f.id))
  const filtered = search.trim() ? available.filter(f => f.username.toLowerCase().includes(search.trim().toLowerCase())) : available
  const toggleFriend = (friend) => {
    setError('')
    setSelected(prev => {
      if (prev.some(s => s.id === friend.id)) return prev.filter(s => s.id !== friend.id)
      if (prev.length >= 3) return prev
      return [...prev, friend]
    })
  }
  const handleAdd = async () => {
    if (busy || selected.length === 0) return
    setBusy(true); setError('')
    try {
      const res = await api(`/api/chats/${chat.id}/members`, { method: 'POST', body: JSON.stringify({ userIds: selected.map(f => f.id) }) })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Error al agregar personas')
      else {
        queryClient.setQueryData(['messages', chat.id], (old) => {
          if (!old) return old
          const existingIds = new Set((old.participants || []).map(p => p.id))
          const toAdd = selected.filter(f => !existingIds.has(f.id)).map(f => ({ id: f.id, username: f.username, avatar_url: f.avatar_url, is_admin: false, last_read_at: null }))
          if (toAdd.length === 0) return old
          return { ...old, participants: [...(old.participants || []), ...toAdd] }
        })
        queryClient.setQueryData(['chats'], (chats) => chats ? chats.map(c => c.id === chat.id ? { ...c, memberCount: (c.memberCount || 0) + selected.length } : c) : chats)
        invalidate(); onDone()
      }
    } catch (err) { console.error(err); setError('Error al agregar personas') }
    setBusy(false)
  }
  return (
    <div className="space-y-3">
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar amigos..." className="w-full bg-zinc-800/80 border border-white/[0.06] rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-500 text-sm outline-none focus:border-[var(--color-accent)]/30 transition-colors" />
      {isLoading ? (
        <p className="text-zinc-500 text-sm text-center py-6">Cargando...</p>
      ) : available.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-6">No tenés amigos para agregar.</p>
      ) : (
        <ul className="space-y-1">
          {filtered.map(f => {
            const isSelected = selected.some(s => s.id === f.id)
            const disabled = !isSelected && selected.length >= 3
            return (
              <li key={f.id}>
                <motion.button
                  whileTap={{ scale: disabled ? 1 : 0.98 }}
                  onClick={() => toggleFriend(f)}
                  disabled={disabled}
                  className={`w-full rounded-xl px-3 py-2.5 flex items-center gap-3 border transition-colors tap-highlight ${isSelected ? 'bg-white/[0.06] border-white/[0.06]' : 'bg-white/[0.04] border-transparent hover:bg-white/[0.06]'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <Avatar src={f.avatar_url} size={36} />
                  <span className="flex-1 text-left text-zinc-100 text-sm truncate tracking-[-0.011em]">{f.username}</span>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center transition shrink-0 ${isSelected ? 'text-white' : 'border-white/20 text-transparent'}`} style={isSelected ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : {}}><Check size={12} strokeWidth={3} /></span>
                </motion.button>
              </li>
            )
          })}
          {filtered.length === 0 && <p className="text-zinc-500 text-sm text-center py-4">No se encontraron amigos.</p>}
        </ul>
      )}
      <div className="flex items-center justify-center">
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleAdd} disabled={busy || selected.length === 0} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm tap-highlight">{<><UserPlus size={15} />{busy ? 'Agregando...' : 'Agregar'}</>}</motion.button>
      </div>
    </div>
  )
}
