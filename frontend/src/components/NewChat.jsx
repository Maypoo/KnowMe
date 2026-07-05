import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import Avatar from './Avatar'

export default function NewChat({ onSelectFriend, onBack }) {
  const [friends, setFriends] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/friends')
      .then(res => res.json())
      .then(data => {
        if (data.friends) setFriends(data.friends)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-100 transition">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-zinc-100 text-sm font-medium">Nuevo chat</span>
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
          {(search.trim()
            ? friends.filter(f => f.username.toLowerCase().includes(search.trim().toLowerCase()))
            : friends
          ).map(f => (
            <li key={f.id}>
              <button
                onClick={() => onSelectFriend(f)}
                className="w-full bg-zinc-900 rounded-lg px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition"
              >
                <Avatar src={f.avatar_url} size={40} />
                <span className="text-zinc-100 text-sm">{f.username}</span>
              </button>
            </li>
          ))}
          {search.trim() && friends.filter(f => f.username.toLowerCase().includes(search.trim().toLowerCase())).length === 0 && (
            <div className="flex-1 flex items-center justify-center pt-8">
              <p className="text-zinc-600 text-sm">No se encontraron amigos.</p>
            </div>
          )}
        </ul>
      )}
    </div>
  )
}
