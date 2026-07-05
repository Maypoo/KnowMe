import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Avatar from './Avatar'

export default function FriendsList({ refreshTrigger, onUpdate }) {
  const navigate = useNavigate()
  const [friends, setFriends] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(null)
  const [removing, setRemoving] = useState(false)

  const fetchFriends = useCallback(async () => {
    try {
      const res = await api('/api/friends')
      const data = await res.json()
      if (res.ok) {
        setFriends(data.friends)
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFriends()
  }, [fetchFriends, refreshTrigger])

  const handleRemove = async () => {
    if (!confirming) return
    setRemoving(true)
    try {
      const res = await api(`/api/friends/${confirming.id}`, { method: 'DELETE' })
      if (res.ok) {
        setFriends(prev => prev.filter(f => f.id !== confirming.id))
        if (onUpdate) onUpdate()
      }
    } catch {
    } finally {
      setRemoving(false)
      setConfirming(null)
    }
  }

  const filtered = search.trim()
    ? friends.filter(f => f.username.toLowerCase().includes(search.trim().toLowerCase()))
    : friends

  if (loading) return null

  const hasFriends = friends.length > 0
  const showList = hasFriends && filtered.length > 0

  return (
    <div className={showList ? '' : 'flex-1 flex flex-col'}>
      <h2 className="text-center text-zinc-300 text-lg font-semibold mb-3">Buscar</h2>
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar amigos..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-zinc-600 transition"
        />
      </div>
      {hasFriends && (
        <>
          <h3 className="text-zinc-400 text-sm font-medium mb-3">Amigos</h3>
          {filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-zinc-600 text-sm">No se encontraron amigos.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map(f => (
                <li key={f.id} className="bg-zinc-900 rounded-lg px-4 py-3 flex items-center justify-between">
                  <button onClick={() => navigate(`/${f.username}`)} className="flex items-center gap-3 hover:opacity-80 transition">
                    <Avatar src={f.avatar_url} size={32} />
                    <span className="text-zinc-100 text-sm">{f.username}</span>
                  </button>
                  <button
                    onClick={() => setConfirming(f)}
                    className="text-zinc-600 hover:text-red-400 transition text-lg leading-none"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!hasFriends && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">No hay nadie por aca.</p>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirming(null)} />
          <div className="relative bg-zinc-900 rounded-xl px-6 py-5 w-full max-w-xs">
            <p className="text-zinc-100 text-sm mb-4">
              ¿Eliminar a {confirming.username} de tus amigos?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm transition disabled:opacity-50"
              >
                {removing ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
