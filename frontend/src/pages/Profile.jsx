import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Avatar from '../components/Avatar'
import FollowersList from '../components/FollowersList'
import FriendsListModal from '../components/FriendsListModal'

export default function Profile() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState(null)
  const [bio, setBio] = useState('')
  const [editingBio, setEditingBio] = useState(false)
  const [showFollowers, setShowFollowers] = useState(false)
  const [showFriends, setShowFriends] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    api('/api/auth/me')
      .then(res => {
        if (!res.ok) throw new Error('No autenticado')
        return res.json()
      })
      .then(data => {
        if (!data.profile) throw new Error('Perfil no encontrado')
        setProfile(data.profile)
        setBio(data.profile.bio || '')
      })
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false))
  }, [navigate])

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Formato no soportado. Usá PNG, JPG, GIF o WebP.')
      return
    }

    setError(null)
    setUpdating(true)

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const res = await api('/api/avatar', {
          method: 'POST',
          body: JSON.stringify({ avatar: reader.result }),
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error)
        } else {
          setProfile(data.profile)
        }
      } catch {
        setError('Error de conexión con el servidor')
      } finally {
        setUpdating(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSaveBio = async () => {
    setUpdating(true)
    setError(null)

    try {
      const res = await api('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ bio: bio.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
      } else {
        setProfile(data.profile)
        setBio(data.profile.bio || '')
        setEditingBio(false)
      }
    } catch {
      setError('Error de conexión con el servidor')
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <p className="text-zinc-400">Cargando...</p>
      </div>
    )
  }

  if (!profile) return null

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
          <div className="relative group">
            <Avatar src={profile.avatar_url} size={96} className="ring-2 ring-zinc-800" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={updating}
              className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
            >
              <svg className="w-6 h-6 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="text-center">
            <h1 className="text-xl font-semibold">{profile.username}</h1>
            <p className="text-zinc-500 text-sm mt-1">{profile.email}</p>
            {profile.created_at && (
              <p className="text-zinc-600 text-xs mt-2">
                Miembro desde el {new Date(profile.created_at).getDate()} de {['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][new Date(profile.created_at).getMonth()]} del {new Date(profile.created_at).getFullYear()}
              </p>
            )}
            <div className="flex items-center justify-center gap-4 mt-3 text-sm">
              <button
                onClick={() => setShowFollowers(true)}
                className="text-zinc-400 hover:text-zinc-200 transition"
              >
                {profile.follower_count ?? 0} seguidores
              </button>
              <span className="text-zinc-600">·</span>
              <button
                onClick={() => setShowFriends(true)}
                className="text-zinc-400 hover:text-zinc-200 transition"
              >
                {profile.friend_count ?? 0} amigos
              </button>
            </div>
          </div>

          {editingBio ? (
            <div className="w-full max-w-sm">
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 100))}
                maxLength={100}
                rows={3}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 resize-none outline-none focus:border-zinc-600 transition"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-zinc-600">{bio.length}/100</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingBio(false); setBio(profile.bio || '') }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveBio}
                    disabled={updating || bio.trim() === (profile.bio || '')}
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
                  >
                    {updating ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {profile.bio && (
                <p className="text-zinc-400 text-sm text-center max-w-sm whitespace-pre-wrap">{profile.bio}</p>
              )}
              <button
                onClick={() => { setEditingBio(true); setBio(profile.bio || '') }}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition"
              >
                {profile.bio ? 'Editar biografía' : 'Agregar biografía'}
              </button>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {updating && (
            <p className="text-zinc-500 text-sm">Subiendo imagen...</p>
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
