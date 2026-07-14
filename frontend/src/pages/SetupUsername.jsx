import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import Avatar from '../components/Avatar'

export default function SetupUsername() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = location.state?.email || ''
  const [username, setUsername] = useState('')
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)

  const handleUsernameChange = (e) => {
    setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))
    setError(null)
  }

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Formato no soportado. Usá PNG, JPG, GIF o WebP.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAvatarPreview(reader.result)
      setAvatarFile(file)
      setError(null)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveAvatar = () => {
    setAvatarPreview(null)
    setAvatarFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const fullUsername = '@' + username
    if (fullUsername.length < 2 || fullUsername.length > 21 || !/^@(?=.*[a-zA-Z])[a-zA-Z0-9_.]+$/.test(fullUsername)) {
      setError('Elegí un nombre de usuario válido (de 1 a 20 caracteres, al menos 1 letra, solo letras, números, guión bajo y punto)')
      return
    }

    setLoading(true)

    try {
      const body = { username: fullUsername }
      if (avatarPreview) body.avatar = avatarPreview

      const res = await api('/api/auth/setup-username', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        setLoading(false)
        return
      }

      navigate('/')
    } catch (err) {
      console.error(err)
      setError('Error de conexión con el servidor')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-zinc-100 mb-2 text-center">Elegí tu nombre de usuario</h1>
        <p className="text-zinc-500 text-sm text-center mb-8">{email}</p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative group"
            >
              <Avatar src={avatarPreview} size={80} className="ring-2 ring-zinc-700 group-hover:ring-zinc-500 transition" />
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <span className="text-xs text-zinc-200 font-medium">{avatarPreview ? 'Cambiar' : 'Subir'}</span>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleAvatarSelect}
              className="hidden"
            />
            {avatarPreview && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition"
              >
                Quitar foto
              </button>
            )}
            {!avatarPreview && (
              <p className="text-xs text-zinc-500">Foto de perfil (opcional)</p>
            )}
          </div>

          <div>
            <label htmlFor="username" className="block text-sm text-zinc-400 mb-1">Nombre de usuario</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none select-none">@</span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={handleUsernameChange}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition"
                placeholder="usuario"
                autoFocus
                required
              />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zinc-100 text-zinc-950 rounded-lg py-2 font-medium hover:bg-zinc-300 transition disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}
