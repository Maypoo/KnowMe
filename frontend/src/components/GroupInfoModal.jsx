import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { Camera, Crown, UserPlus, X, Check, ChevronLeft, Settings } from 'lucide-react'
import { api } from '../lib/api'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-center p-4 border-b border-zinc-800 relative">
          <button onClick={() => setMode('view')} className={`absolute left-4 text-zinc-400 hover:text-zinc-100 transition ${mode === 'view' ? 'invisible' : ''}`}>
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-zinc-100 font-semibold text-lg">
            {mode === 'view' ? 'Información del grupo' : mode === 'edit' ? 'Editar grupo' : 'Agregar personas'}
          </h2>
          <button onClick={onClose} className="absolute right-4 text-zinc-400 hover:text-zinc-200 transition p-1">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          <div className="flex flex-col items-center gap-2 mb-4">
            {mode === 'edit' ? (
              <div className="relative group">
                <GroupAvatar iconUrl={editIconBase64 || editIconUrl || info?.icon_url} size={72} />
                <button
                  onClick={() => iconInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  title="Cambiar icono"
                >
                  <Camera size={24} className="text-zinc-200" />
                </button>
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={handleIconSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <GroupAvatar iconUrl={info?.icon_url} size={72} />
            )}
            <p className="text-zinc-100 font-medium text-center">{info?.name || 'Grupo'}</p>
            <p className="text-zinc-500 text-xs">{participants.length} miembro{participants.length !== 1 ? 's' : ''}</p>
          </div>

          {mode === 'view' && isAdmin && (
            <button
              onClick={() => { setMode('edit'); setError(''); setEditIconBase64(null); setEditIconUrl(info?.icon_url || null) }}
              className="w-full mb-4 rounded-lg px-4 py-2.5 text-sm text-white transition hover:opacity-90"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              Editar grupo
            </button>
          )}

          {mode === 'view' && isAdmin && (
            <button
              onClick={() => { setMode('add'); setError('') }}
              className="w-full mb-4 rounded-lg px-4 py-2.5 text-sm text-white transition hover:opacity-90"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              Agregar personas
            </button>
          )}

          {mode === 'view' && (
            <button
              onClick={() => { setError(''); setLeaveSuccessorId(null); setConfirmLeave(true) }}
              className="w-full mb-4 rounded-lg px-4 py-2.5 text-sm text-white bg-red-600 hover:bg-red-500 transition"
            >
              Salir del grupo
            </button>
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
                <li key={p.id} className="bg-zinc-800/50 rounded-lg px-3 py-2.5 flex items-center gap-3">
                  <Avatar src={p.avatar_url} size={36} />
                  <span className="flex-1 text-left text-zinc-100 text-sm truncate">
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
                      <button
                        onClick={(e) => {
                          if (menuMemberId === p.id) {
                            setMenuMemberId(null)
                            setMenuPos(null)
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                            setMenuMemberId(p.id)
                          }
                        }}
                        className={`p-1.5 rounded-lg transition ${menuMemberId === p.id ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'}`}
                        title="Opciones"
                      >
                        <Settings size={16} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && <p className="text-red-400 text-xs text-center mt-3">{error}</p>}
        </div>
      </div>
      <ImageCropModal
        open={showIconEditor}
        previewUrl={iconEditorPreviewUrl}
        title="Editar foto"
        onSave={handleIconEditorSave}
        onCancel={handleIconEditorCancel}
      />
      {menuMemberId && menuPos && createPortal(
        <div className="fixed z-50 w-40 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1" style={{ top: menuPos.top, right: menuPos.right }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => { setMenuMemberId(null); setMenuPos(null); setConfirmMemberId(menuMemberId) }}
            className="w-full text-left px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition"
          >
            Hacer admin
          </button>
        </div>,
        document.body
      )}
      {confirmMemberId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={e => { e.stopPropagation(); setConfirmMemberId(null) }}
          />
          <div className="relative bg-zinc-900 rounded-xl px-6 py-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <p className="text-zinc-100 text-sm mb-4">
              ¿Dar administrador a {participants.find(p => p.id === confirmMemberId)?.username}?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmMemberId(null)}
                disabled={busy}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => makeAdmin(confirmMemberId)}
                disabled={busy}
                className="text-white rounded-lg px-4 py-2 text-sm transition disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                {busy ? 'Dando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={e => { e.stopPropagation(); setConfirmLeave(false) }}
          />
          <div className="relative bg-zinc-900 rounded-xl px-6 py-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <p className="text-zinc-100 text-sm mb-3">
              {onlyAdmin
                ? 'Sos el único administrador. Elegí quién hereda el cargo antes de salir.'
                : `¿Salir del grupo ${info?.name || ''}?`}
            </p>
            {onlyAdmin && (
              <ul className="space-y-1 mb-4">
                {participants.filter(p => !p.is_admin && p.id !== profile?.id).map(p => (
                  <li key={p.id}>
                    <button
                      onClick={() => setLeaveSuccessorId(p.id)}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${leaveSuccessorId === p.id ? 'bg-zinc-700' : 'bg-zinc-800/50 hover:bg-zinc-800'}`}
                    >
                      <Avatar src={p.avatar_url} size={28} />
                      <span className="flex-1 text-left text-zinc-100 text-sm truncate">{p.username}</span>
                      {leaveSuccessorId === p.id && (
                        <Check size={16} className="shrink-0" style={{ color: 'var(--color-accent)' }} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmLeave(false)}
                disabled={busy}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleLeaveGroup}
                disabled={busy || (onlyAdmin && !leaveSuccessorId)}
                className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm transition disabled:opacity-50"
              >
                {busy ? 'Saliendo...' : 'Salir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EditGroupFields({ chat, initialName, iconBase64, busy, setBusy, setError, invalidate, onDone }) {
  const [name, setName] = useState(initialName || '')

  const handleSave = async () => {
    if (busy) return
    if (!name.trim()) {
      setError('El nombre no puede estar vacío')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = { name: name.trim() }
      if (iconBase64) body.icon = iconBase64
      const res = await api(`/api/chats/${chat.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al actualizar el grupo')
      } else {
        invalidate()
        onDone()
      }
    } catch (err) {
      console.error(err)
      setError('Error al actualizar el grupo')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-zinc-500 mb-2">Nombre del grupo</p>
        <input
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          maxLength={60}
          placeholder="Nombre del grupo"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-600 text-sm outline-none focus:border-zinc-500 transition"
        />
      </div>
      <div className="flex items-center justify-center">
        <button
          onClick={handleSave}
          disabled={busy}
          className="px-4 py-2 rounded-lg text-sm text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          {busy ? 'Guardando...' : 'Guardar'}
        </button>
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
    queryFn: async () => {
      const res = await api('/api/friends')
      const data = await res.json()
      return data.friends || []
    },
  })

  const available = friends.filter(f => !existing.includes(f.id))
  const filtered = search.trim()
    ? available.filter(f => f.username.toLowerCase().includes(search.trim().toLowerCase()))
    : available

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
    setBusy(true)
    setError('')
    try {
      const res = await api(`/api/chats/${chat.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userIds: selected.map(f => f.id) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al agregar personas')
      } else {
        queryClient.setQueryData(['messages', chat.id], (old) => {
          if (!old) return old
          const existingIds = new Set((old.participants || []).map(p => p.id))
          const toAdd = selected
            .filter(f => !existingIds.has(f.id))
            .map(f => ({
              id: f.id,
              username: f.username,
              avatar_url: f.avatar_url,
              is_admin: false,
              last_read_at: null,
            }))
          if (toAdd.length === 0) return old
          return {
            ...old,
            participants: [...(old.participants || []), ...toAdd],
          }
        })
        queryClient.setQueryData(['chats'], (chats) => {
          if (!chats) return chats
          return chats.map(c =>
            c.id === chat.id ? { ...c, memberCount: (c.memberCount || 0) + selected.length } : c
          )
        })
        invalidate()
        onDone()
      }
    } catch (err) {
      console.error(err)
      setError('Error al agregar personas')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar amigos..."
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-600 text-sm outline-none focus:border-zinc-500 transition"
      />
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
                <button
                  onClick={() => toggleFriend(f)}
                  disabled={disabled}
                  className={`w-full bg-zinc-800/50 rounded-lg px-3 py-2.5 flex items-center gap-3 transition ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800'}`}
                >
                  <Avatar src={f.avatar_url} size={36} />
                  <span className="flex-1 text-left text-zinc-100 text-sm truncate">{f.username}</span>
                  <span
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition shrink-0 ${
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
            <p className="text-zinc-500 text-sm text-center py-4">No se encontraron amigos.</p>
          )}
        </ul>
      )}
      <div className="flex items-center justify-center">
        <button
          onClick={handleAdd}
          disabled={busy || selected.length === 0}
          className="px-4 py-2 rounded-lg text-sm text-white transition hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          <UserPlus size={15} />
          {busy ? 'Agregando...' : 'Agregar'}
        </button>
      </div>
    </div>
  )
}