import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { socket } from '../lib/socket'
import Avatar from './Avatar'

export default function PendingRequests({ refreshTrigger }) {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  const fetchPending = useCallback(async () => {
    try {
      const res = await api('/api/friends/pending')
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
    fetchPending()
  }, [fetchPending, refreshTrigger])

  useEffect(() => {
    const removeRequest = (data) => {
      setRequests(prev => prev.filter(r => r.id !== data.id))
    }
    socket.on('friend_request_updated', removeRequest)
    socket.on('friend_request_cancelled', removeRequest)
    return () => {
      socket.off('friend_request_updated', removeRequest)
      socket.off('friend_request_cancelled', removeRequest)
    }
  }, [])

  const handleCancel = async () => {
    if (!confirming) return
    setCancelling(true)
    try {
      const res = await api(`/api/friends/request/${confirming.id}`, { method: 'DELETE' })
      if (res.ok) {
        setRequests(prev => prev.filter(r => r.id !== confirming.id))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setCancelling(false)
      setConfirming(null)
    }
  }

  if (loading) return null

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-center text-zinc-300 text-lg font-semibold mb-6">Solicitudes enviadas</h2>
      {requests.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-600 text-sm text-center">No hay nadie por aca.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {requests.map(r => (
            <li key={r.id} className="bg-zinc-900 rounded-lg px-4 py-3 flex items-center justify-between">
              <button onClick={() => navigate(`/${r.receiver.username}`)} className="flex items-center gap-3 hover:opacity-80 transition">
                <Avatar src={r.receiver.avatar_url} size={32} />
                <span className="text-zinc-100 text-sm">{r.receiver.username}</span>
              </button>
              <button
                onClick={() => setConfirming(r)}
                    className="text-zinc-600 hover:text-red-400 transition"
                  >
                    <X size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirming(null)} />
          <div className="relative bg-zinc-900 rounded-xl px-6 py-5 w-full max-w-xs">
            <p className="text-zinc-100 text-sm mb-4">
              ¿Cancelar solicitud a {confirming.receiver.username}?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm transition disabled:opacity-50"
              >
                {cancelling ? 'Cancelando...' : 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
