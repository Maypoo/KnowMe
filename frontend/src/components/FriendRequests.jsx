import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Avatar from './Avatar'

export default function FriendRequests({ refreshTrigger, onRespond }) {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchRequests = useCallback(async () => {
    try {
      const res = await api('/api/friends/requests')
      const data = await res.json()
      if (res.ok) {
        setRequests(data.requests)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests, refreshTrigger])

  const handleRespond = async (requestId, action) => {
    const prev = requests.find(r => r.id === requestId)
    setRequests(prev => prev.filter(r => r.id !== requestId))

    const res = await api('/api/friends/respond', {
      method: 'POST',
      body: JSON.stringify({ requestId, action }),
    })

    if (res.ok) {
      onRespond?.()
    } else {
      if (prev) setRequests(p => [...p, prev])
    }
  }

  if (loading) return null

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-center text-zinc-300 text-lg font-semibold mb-6">Solicitudes de amistad</h2>
      {requests.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-600 text-sm text-center">No hay nadie por aca.</p>
          </div>
      ) : (
        <ul className="space-y-3">
          {requests.map(req => (
            <li key={req.id} className="flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3">
              <button onClick={() => navigate(`/${req.sender.username}`)} className="flex items-center gap-3 hover:opacity-80 transition">
                <Avatar src={req.sender.avatar_url} size={32} />
                <span className="text-zinc-100 text-sm">{req.sender.username}</span>
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRespond(req.id, 'accepted')}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                  style={{ backgroundColor: '#6659ff' }}
                >
                  Aceptar
                </button>
                <button
                  onClick={() => handleRespond(req.id, 'rejected')}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 text-xs transition"
                >
                  Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
