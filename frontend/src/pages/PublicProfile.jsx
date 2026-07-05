import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Avatar from '../components/Avatar'
import FollowersList from '../components/FollowersList'
import FriendsListModal from '../components/FriendsListModal'

export default function PublicProfile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showFollowers, setShowFollowers] = useState(false)
  const [showFriends, setShowFriends] = useState(false)

  useEffect(() => {
    if (!username.startsWith('@')) {
      setError('Usuario no encontrado')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    api(`/api/profile/${encodeURIComponent(username)}`)
      .then(async res => {
        if (!res.ok) {
          if (res.status === 404) throw new Error('Usuario no encontrado')
          throw new Error('Error al cargar perfil')
        }
        const data = await res.json()
        setProfile(data.profile)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [username])

  const handleFollow = async () => {
    setActionLoading(true)
    try {
      const res = await api(`/api/follow/${encodeURIComponent(username)}`, { method: 'POST' })
      if (res.ok) {
        setProfile(prev => ({ ...prev, is_following: true, follower_count: prev.follower_count + 1 }))
      }
    } catch {
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnfollow = async () => {
    setActionLoading(true)
    try {
      const res = await api(`/api/follow/${encodeURIComponent(username)}`, { method: 'DELETE' })
      if (res.ok) {
        setProfile(prev => ({ ...prev, is_following: false, follower_count: prev.follower_count - 1 }))
      }
    } catch {
    } finally {
      setActionLoading(false)
    }
  }

  const handleSendRequest = async () => {
    setActionLoading(true)
    try {
      const res = await api('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      })
      if (res.ok) {
        setProfile(prev => ({ ...prev, friend_request_status: 'pending' }))
      } else {
        const data = await res.json()
        if (data.error) setError(data.error)
      }
    } catch {
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <p className="text-zinc-400">Cargando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-100 mb-2">{error}</h1>
          <button
            onClick={() => navigate('/')}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition"
          >
            ← Volver al inicio
          </button>
        </div>
      </div>
    )
  }

  const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-lg mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/')}
          className="text-zinc-500 hover:text-zinc-300 text-sm transition mb-8"
        >
          ← Volver
        </button>
        <div className="flex flex-col items-center gap-6">
          <Avatar src={profile.avatar_url} size={96} className="ring-2 ring-zinc-800" />

          <div className="text-center">
            <h1 className="text-xl font-semibold">{profile.username}</h1>
            {profile.bio && (
              <p className="text-zinc-400 text-sm text-center max-w-sm mt-2 whitespace-pre-wrap">{profile.bio}</p>
            )}
            {profile.created_at && (
              <p className="text-zinc-600 text-xs mt-4">
                Miembro desde el {new Date(profile.created_at).getDate()} de {MONTHS[new Date(profile.created_at).getMonth()]} del {new Date(profile.created_at).getFullYear()}
              </p>
            )}
            <div className="flex items-center justify-center gap-4 mt-3 text-sm">
              <button
                onClick={() => setShowFollowers(true)}
                className="text-zinc-400 hover:text-zinc-200 transition"
              >
                {profile.follower_count} seguidores
              </button>
              <span className="text-zinc-600">·</span>
              <button
                onClick={() => setShowFriends(true)}
                className="text-zinc-400 hover:text-zinc-200 transition"
              >
                {profile.friend_count} amigos
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            {profile.is_following ? (
              <button
                onClick={handleUnfollow}
                disabled={actionLoading}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-5 py-2 text-sm transition disabled:opacity-50"
              >
                {actionLoading ? '...' : 'Dejar de seguir'}
              </button>
            ) : (
              <button
                onClick={handleFollow}
                disabled={actionLoading}
                className="rounded-lg px-5 py-2 text-sm font-medium text-white transition disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: '#6659ff' }}
              >
                {actionLoading ? '...' : 'Seguir'}
              </button>
            )}
            {!profile.friend_request_status && (
              <button
                onClick={handleSendRequest}
                disabled={actionLoading}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-5 py-2 text-sm transition disabled:opacity-50"
              >
                {actionLoading ? '...' : 'Enviar solicitud'}
              </button>
            )}
            {profile.friend_request_status === 'pending' && (
              <span className="bg-zinc-800 text-zinc-500 rounded-lg px-5 py-2 text-sm">
                Solicitud enviada
              </span>
            )}
            {profile.friend_request_status === 'accepted' && (
              <span className="bg-zinc-800 text-zinc-500 rounded-lg px-5 py-2 text-sm">
                Amigos
              </span>
            )}
            {profile.friend_request_status === 'rejected' && (
              <button
                onClick={handleSendRequest}
                disabled={actionLoading}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-5 py-2 text-sm transition disabled:opacity-50"
              >
                {actionLoading ? '...' : 'Enviar solicitud'}
              </button>
            )}
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
        </div>
      </div>
      {showFollowers && (
        <FollowersList username={profile.username} onClose={() => setShowFollowers(false)} />
      )}
      {showFriends && (
        <FriendsListModal username={profile.username} onClose={() => setShowFriends(false)} />
      )}
    </div>
  )
}
