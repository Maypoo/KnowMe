import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Send } from 'lucide-react'
import { api } from '../lib/api'
import Avatar from '../components/Avatar'
import { SkeletonBox, SkeletonAvatar } from '../components/Skeleton'
import countries from '../data/countries'
import FollowersList from '../components/FollowersList'
import FriendsListModal from '../components/FriendsListModal'

export default function PublicProfile() {
  const queryClient = useQueryClient()
  const { username } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentUserLoading, setCurrentUserLoading] = useState(true)
  const [error, setError] = useState(null)

  const [requestLoading, setRequestLoading] = useState(false)
  const [showFollowers, setShowFollowers] = useState(false)
  const [showFriends, setShowFriends] = useState(false)

  useEffect(() => {
    api('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => setCurrentUser(data?.profile ?? null))
      .catch((err) => { console.error(err); setCurrentUser(null) })
      .finally(() => setCurrentUserLoading(false))
  }, [])

  useEffect(() => {
    if (!username.startsWith('@')) {
      setError('Usuario no encontrado')
      setLoading(false)
      setCurrentUserLoading(false)
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

  const handleFollow = () => {
    setProfile(prev => ({ ...prev, is_following: true, follower_count: prev.follower_count + 1 }))
    api(`/api/follow/${encodeURIComponent(username)}`, { method: 'POST' }).catch(() => {
      setProfile(prev => ({ ...prev, is_following: false, follower_count: prev.follower_count - 1 }))
    })
  }

  const handleUnfollow = () => {
    setProfile(prev => ({ ...prev, is_following: false, follower_count: prev.follower_count - 1 }))
    api(`/api/follow/${encodeURIComponent(username)}`, { method: 'DELETE' }).catch(() => {
      setProfile(prev => ({ ...prev, is_following: true, follower_count: prev.follower_count + 1 }))
    })
  }

  const handleSendMessage = async () => {
    try {
      const res = await api('/api/chats', {
        method: 'POST',
        body: JSON.stringify({ userId: profile.id }),
      })
      const data = await res.json()
      if (res.ok && data.chat) {
        queryClient.invalidateQueries({ queryKey: ['chats'] })
        sessionStorage.setItem('chatReturn', JSON.stringify({ activeChat: data.chat }))
        navigate('/')
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleSendRequest = async () => {
    if (requestLoading) return
    setRequestLoading(true)
    setProfile(prev => ({ ...prev, friend_request_status: 'pending' }))
    const res = await api('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ username }),
    })
    if (!res.ok) {
      setProfile(prev => ({ ...prev, friend_request_status: null }))
      const data = await res.json()
      if (data.error) setError(data.error)
    }
    setRequestLoading(false)
  }

  if (loading || currentUserLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="max-w-lg mx-auto px-4 py-8">
          <SkeletonBox className="h-4 w-16 mb-8" />
          <div className="flex flex-col items-center gap-4">
            <SkeletonAvatar size={96} className="ring-2 ring-zinc-800" />
            <div className="text-center flex flex-col items-center gap-2">
              <SkeletonBox className="h-6 w-36" />
              <SkeletonBox className="h-4 w-56" />
              <SkeletonBox className="h-4 w-48" />
              <div className="flex items-center gap-4 mt-1">
                <SkeletonBox className="h-4 w-24" />
                <SkeletonBox className="h-4 w-4" />
                <SkeletonBox className="h-4 w-20" />
              </div>
            </div>
            <div className="flex gap-3 mt-2">
              <SkeletonBox className="h-10 w-28 rounded-lg" />
              <SkeletonBox className="h-10 w-36 rounded-lg" />
            </div>
          </div>
        </div>
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
            <ArrowLeft size={14} className="inline -mt-0.5" /> Volver al inicio
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
          <ArrowLeft size={14} className="inline -mt-0.5" /> Volver
        </button>
        <div className="flex flex-col items-center gap-4">
          <Avatar src={profile.avatar_url} size={96} className="ring-2 ring-zinc-800" />

          <div className="text-center">
            <h1 className="text-xl font-semibold">{profile.username}</h1>
            {profile.bio && (
              <p className="text-zinc-400 text-sm text-center max-w-sm mt-2 whitespace-pre-wrap">{profile.bio}</p>
            )}
            {profile.show_country && profile.country ? (
              (() => {
                const c = countries.find(c => c.code === profile.country)
                const age = profile.show_age && profile.birth_date
                  ? new Date().getFullYear() - new Date(profile.birth_date).getFullYear()
                  : null
                return age ? (
                  <p className="text-zinc-400 text-sm mt-2">
                    {age} años  <span className="text-zinc-600 mx-1.5">·</span>  <img src={`https://flagcdn.com/w20/${profile.country.toLowerCase()}.png`} alt="" className="w-4 h-auto inline-block rounded-sm mr-1.5 -mt-0.5" />
                    {c?.name || profile.country}
                  </p>
                ) : (
                  <p className="text-zinc-400 text-sm mt-2 text-center">
                    <img src={`https://flagcdn.com/w20/${profile.country.toLowerCase()}.png`} alt="" className="w-4 h-auto inline-block rounded-sm mr-1.5 -mt-0.5" />
                    {c?.name || profile.country}
                  </p>
                )
              })()
            ) : (
              profile.show_age && profile.birth_date && (
                <p className="text-zinc-400 text-sm mt-2">{new Date().getFullYear() - new Date(profile.birth_date).getFullYear()} años</p>
              )
            )}
            {profile.created_at && (
              <p className="text-zinc-600 text-xs mt-2">
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

          {currentUser?.username?.toLowerCase() === username.toLowerCase() ? (
            <button
              onClick={() => navigate('/profile/edit')}
              className="rounded-lg px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
              style={{ backgroundColor: '#6659ff' }}
            >
              Editar perfil
            </button>
          ) : (
            <>
              <div className="flex gap-3">
                {profile.is_following ? (
                  <button
                    onClick={handleUnfollow}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-5 py-2 text-sm transition"
                  >
                    Dejar de seguir
                  </button>
                ) : (
                  <button
                    onClick={handleFollow}
                    className="rounded-lg px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
                    style={{ backgroundColor: '#6659ff' }}
                  >
                    Seguir
                  </button>
                )}
                {!profile.friend_request_status && (
                  <button
                    onClick={handleSendRequest}
                    disabled={requestLoading}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-5 py-2 text-sm transition disabled:opacity-50"
                  >
                    Enviar solicitud
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
                    disabled={requestLoading}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-5 py-2 text-sm transition disabled:opacity-50"
                  >
                    Enviar solicitud
                  </button>
                )}
              </div>
              {profile.friend_request_status === 'accepted' && (
                <button
                  onClick={handleSendMessage}
                  className="rounded-lg px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  style={{ backgroundColor: '#6659ff' }}
                >
                  <Send size={16} className="inline-block mr-1.5" />
                  Enviar mensaje
                </button>
              )}
            </>
          )}

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
