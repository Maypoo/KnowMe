import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera } from 'lucide-react'
import { api } from '../lib/api'
import { startOAuth, onOAuthTokens } from '../lib/oauth'
import Avatar from '../components/Avatar'
import DatePicker from '../components/DatePicker'
import CountrySelect from '../components/CountrySelect'
import ImageCropModal from '../components/ImageCropModal'
import Logo from '../components/Logo'

export default function EditProfile() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [updatingAvatar, setUpdatingAvatar] = useState(false)
  const [updatingUsername, setUpdatingUsername] = useState(false)
  const [updatingDisplayName, setUpdatingDisplayName] = useState(false)
  const [updatingBio, setUpdatingBio] = useState(false)
  const [updatingBirth, setUpdatingBirth] = useState(false)
  const [error, setError] = useState(null)
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [bio, setBio] = useState('')
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState(null)
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [usernameLimits, setUsernameLimits] = useState(null)
  const [birthDate, setBirthDate] = useState('')
  const [showAge, setShowAge] = useState(false)
  const [country, setCountry] = useState(null)
  const [showCountry, setShowCountry] = useState(false)
  const [updatingCountry, setUpdatingCountry] = useState(false)
  const [showActivity, setShowActivity] = useState(true)
  const [initialActivity, setInitialActivity] = useState(true)
  const [updatingActivity, setUpdatingActivity] = useState(false)
  const checkTimerRef = useRef(null)
  const fileInputRef = useRef(null)

  const [showEditor, setShowEditor] = useState(false)
  const [editorPreviewUrl, setEditorPreviewUrl] = useState(null)

  const { data: profileData, isLoading } = useQuery({
    queryKey: ['editProfile'],
    queryFn: async () => {
      const res = await api('/api/auth/me')
      if (!res.ok) throw new Error('No autenticado')
      const data = await res.json()
      if (!data.profile) throw new Error('Perfil no encontrado')
      return data
    },
  })

  const profile = profileData?.profile ?? null

  useEffect(() => {
    if (profileData) {
      setDisplayNameInput(profileData.profile.username.replace(/^@/, ''))
      setUsernameInput(profileData.profile.username.replace(/^@/, ''))
      setBio(profileData.profile.bio || '')
      setBirthDate(profileData.profile.birth_date || '')
      setShowAge(profileData.profile.show_age || false)
      setCountry(profileData.profile.country || null)
      setShowCountry(profileData.profile.show_country || false)
      const activity = profileData.profile.show_activity !== false
      setShowActivity(activity)
      setInitialActivity(activity)
      setUsernameLimits(profileData.limits || null)
    }
  }, [profileData])

  useEffect(() => {
    if (profile === null && !isLoading) {
      navigate('/login')
    }
  }, [profile, isLoading, navigate])

  useEffect(() => {
    return onOAuthTokens(async (tokens) => {
      if (!tokens?.deleteAccount || !tokens?.access_token || !tokens?.refresh_token) return
      try {
        const res = await api('/api/auth/delete-account', {
          method: 'POST',
          body: JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        navigate('/login', { state: { deleted: true } })
      } catch (err) {
        console.error(err)
        setError(err.message || 'Error al eliminar la cuenta')
      }
    })
  }, [])

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Formato no soportado. Usá PNG, JPG, GIF o WebP.')
      return
    }

    setError(null)
    const url = URL.createObjectURL(file)
    setEditorPreviewUrl(url)
    setShowEditor(true)
  }

  const handleSaveAvatar = async (base64) => {
    setShowEditor(false)
    setUpdatingAvatar(true)

    try {
      const res = await api('/api/avatar', {
        method: 'POST',
        body: JSON.stringify({ avatar: base64 }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
      } else {
        await queryClient.refetchQueries({ queryKey: ['editProfile'] })
      }
    } catch (err) {
      console.error(err)
      setError('Error de conexión con el servidor')
    } finally {
      setUpdatingAvatar(false)
      if (editorPreviewUrl) URL.revokeObjectURL(editorPreviewUrl)
      setEditorPreviewUrl(null)
    }
  }

  const handleCancelEditor = () => {
    setShowEditor(false)
    if (editorPreviewUrl) URL.revokeObjectURL(editorPreviewUrl)
    setEditorPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSaveDisplayName = async () => {
    setUpdatingDisplayName(true)
    setError(null)

    try {
      const res = await api('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ display_name: '@' + displayNameInput }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
      } else {
        queryClient.setQueryData(['editProfile'], old => old ? { ...old, profile: data.profile } : old)
        setDisplayNameInput(data.profile.username.replace(/^@/, ''))
      }
    } catch (err) {
      console.error(err)
      setError('Error de conexión con el servidor')
    } finally {
      setUpdatingDisplayName(false)
    }
  }

  const checkUsernameAvailability = async (username) => {
    if (!/^@(?=.*[a-zA-Z])[a-zA-Z0-9_.]+$/.test(username) || username.length < 2 || username.length > 21) {
      setUsernameAvailable(false)
      setUsernameError('Debe tener al menos 1 letra, solo letras, números, guión bajo y punto (de 1 a 20 caracteres, sin contar el @)')
      return
    }

    try {
      const res = await api(`/api/username/check?q=${encodeURIComponent(username)}`)
      const data = await res.json()
      setUsernameAvailable(data.available)
      if (!data.available) setUsernameError(data.error)
    } catch (err) {
      console.error(err)
      setUsernameError('Error al verificar disponibilidad')
    }
  }

  const handleUsernameChange = (e) => {
    const value = e.target.value.replace(/[^a-zA-Z0-9_.]/g, '')
    setUsernameInput(value)

    setUsernameError(null)
    setUsernameAvailable(null)

    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)

    if (value) {
      checkTimerRef.current = setTimeout(() => checkUsernameAvailability('@' + value), 500)
    }
  }

  const handleSaveUsername = async () => {
    setUpdatingUsername(true)
    setError(null)

    try {
      const res = await api('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ username: '@' + usernameInput }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        if (data.limits) setUsernameLimits(data.limits)
      } else {
        queryClient.setQueryData(['editProfile'], old => old ? { ...old, profile: data.profile, limits: data.limits } : old)
        setDisplayNameInput(data.profile.username.replace(/^@/, ''))
        setUsernameInput(data.profile.username.replace(/^@/, ''))
        setUsernameAvailable(null)
        setUsernameError(null)
        setUsernameLimits(data.limits || null)
      }
    } catch (err) {
      console.error(err)
      setError('Error de conexión con el servidor')
    } finally {
      setUpdatingUsername(false)
    }
  }

  const handleSaveBio = async () => {
    setUpdatingBio(true)
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
        queryClient.setQueryData(['editProfile'], old => old ? { ...old, profile: data.profile } : old)
        setBio(data.profile.bio || '')
      }
    } catch (err) {
      console.error(err)
      setError('Error de conexión con el servidor')
    } finally {
      setUpdatingBio(false)
    }
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const hasBirthDateChanged = birthDate !== (profile?.birth_date || '')
  const hasShowAgeChanged = showAge !== (profile?.show_age || false)

  const handleSaveBirth = async () => {
    setUpdatingBirth(true)
    setError(null)

    try {
      const res = await api('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ birth_date: birthDate || null, show_age: showAge }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
      } else {
        queryClient.setQueryData(['editProfile'], old => old ? { ...old, profile: data.profile } : old)
        setBirthDate(data.profile.birth_date || '')
        setShowAge(data.profile.show_age || false)
      }
    } catch (err) {
      console.error(err)
      setError('Error de conexión con el servidor')
    } finally {
      setUpdatingBirth(false)
    }
  }

  const hasCountryChanged = country !== (profile?.country || null)
  const hasShowCountryChanged = showCountry !== (profile?.show_country || false)

  const handleSaveCountry = async () => {
    setUpdatingCountry(true)
    setError(null)

    try {
      const res = await api('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ country: country || null, show_country: showCountry }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
      } else {
        queryClient.setQueryData(['editProfile'], old => old ? { ...old, profile: data.profile } : old)
        setCountry(data.profile.country || null)
        setShowCountry(data.profile.show_country || false)
      }
    } catch (err) {
      console.error(err)
      setError('Error de conexión con el servidor')
    } finally {
      setUpdatingCountry(false)
    }
  }

  const handleSaveActivity = async () => {
    setUpdatingActivity(true)
    setError(null)

    try {
      const res = await api('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ show_activity: showActivity }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error)
      } else {
        setInitialActivity(showActivity)
        queryClient.invalidateQueries({ queryKey: ['editProfile'] })
      }
    } catch (err) {
      console.error(err)
      setError('Error de conexión con el servidor')
    } finally {
      setUpdatingActivity(false)
    }
  }

  const handleDeleteAccount = async () => {
    try {
      await startOAuth({ deleteAccount: true })
    } catch (err) {
      console.error(err)
      setError('Error al iniciar reautenticación con Google')
    }
  }

  const hasUnsavedName = ('@' + displayNameInput) !== profile?.username
  const hasUnsavedBio = bio.trim() !== (profile?.bio || '')

  if (isLoading) {
    return (
      <div className="min-h-full bg-zinc-950 flex items-center justify-center px-4">
        <Logo size={56} monochrome className="text-zinc-400 animate-spin-slow" />
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 py-8 lg:min-h-screen lg:flex lg:flex-col">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition mb-8"
          title="Volver"
        >
          <ArrowLeft size={20} />
        </button>

        <h1 className="text-xl font-semibold mb-8 text-center lg:hidden">Editar perfil</h1>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 items-start lg:items-center lg:flex-1">
          <div className="flex flex-col items-center gap-8">
            <div className="relative group">
              <Avatar src={profile.avatar_url} size={96} className="ring-2 ring-zinc-800" />
              {updatingAvatar ? (
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-zinc-300 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                >
                  <Camera size={24} className="text-zinc-200" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <div className="w-full max-w-sm space-y-2">
              <label className="text-sm text-zinc-500">Nombre de usuario</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none select-none text-sm">@</span>
                  <input
                    value={usernameInput}
                    onChange={handleUsernameChange}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 transition"
                  />
                </div>
                <button
                  onClick={handleSaveUsername}
                  disabled={updatingUsername || !usernameInput || ('@' + usernameInput) === profile?.username || !usernameAvailable || (usernameLimits && usernameLimits.remaining === 0)}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 transition disabled:opacity-50"
                >
                  {updatingUsername ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
              {usernameError && (
                <p className="text-xs text-red-400">{usernameError}</p>
              )}
              {usernameAvailable && (
                <p className="text-xs text-green-400">El usuario está disponible</p>
              )}
              {usernameLimits && usernameLimits.remaining > 0 && (
                <p className="text-xs text-zinc-600">Te quedan {usernameLimits.remaining} cambio{usernameLimits.remaining !== 1 ? 's' : ''} en los próximos 14 días</p>
              )}
              {usernameLimits && usernameLimits.remaining === 0 && usernameLimits.nextAvailable && (
                <p className="text-xs text-amber-400">Límite alcanzado. Podrás cambiar tu nombre de usuario nuevamente a partir del {new Date(usernameLimits.nextAvailable).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              )}
            </div>

            <div className="w-full max-w-sm space-y-2">
              <label className="text-sm text-zinc-500">Mayúsculas</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none select-none text-sm">@</span>
                  <input
                    value={displayNameInput}
                    onChange={e => setDisplayNameInput(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 transition"
                  />
                </div>
                <button
                  onClick={handleSaveDisplayName}
                  disabled={updatingDisplayName || !hasUnsavedName}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 transition disabled:opacity-50"
                >
                  {updatingDisplayName ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
              <p className="text-xs text-zinc-600">Solo podés cambiar las mayúsculas</p>
            </div>

            <div className="w-full max-w-sm space-y-2">
              <label className="text-sm text-zinc-500">Biografía</label>
              <textarea
                value={bio}
                onChange={e => {
                  let value = e.target.value.replace(/\r\n?/g, '\n')
                  const lines = value.split('\n')
                  if (lines.length > 5) value = lines.slice(0, 5).join('\n')
                  value = value.replace(/\n{3,}/g, '\n\n')
                  setBio(value.slice(0, 100))
                }}
                maxLength={100}
                rows={3}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 resize-none outline-none focus:border-zinc-600 transition"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-600">{bio.length}/100</span>
                <button
                  onClick={handleSaveBio}
                  disabled={updatingBio || !hasUnsavedBio}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
                >
                  {updatingBio ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-8">
            <div className="w-full max-w-sm space-y-2">
              <label className="text-sm text-zinc-500">Correo electrónico</label>
              <input
                value={profile.email}
                readOnly
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 outline-none cursor-not-allowed"
              />
              <p className="text-xs text-zinc-600">Correo verificado por Google</p>
            </div>

            <div className="w-full max-w-sm space-y-2">
              <label className="text-sm text-zinc-500">Fecha de nacimiento</label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <DatePicker value={birthDate} onChange={setBirthDate} />
                </div>
                <button
                  onClick={handleSaveBirth}
                  disabled={updatingBirth || (!hasBirthDateChanged && !hasShowAgeChanged)}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 transition disabled:opacity-50"
                >
                  {updatingBirth ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAge}
                  onChange={e => setShowAge(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-accent focus:ring-accent focus:ring-offset-0 [color-scheme:dark]"
                />
                <span className="text-sm text-zinc-400">Mostrar edad en el perfil</span>
              </label>
            </div>

            <div className="w-full max-w-sm space-y-2">
              <label className="text-sm text-zinc-500">País</label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <CountrySelect value={country} onChange={setCountry} />
                </div>
                <button
                  onClick={handleSaveCountry}
                  disabled={updatingCountry || (!hasCountryChanged && !hasShowCountryChanged)}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 transition disabled:opacity-50"
                >
                  {updatingCountry ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCountry}
                  onChange={e => setShowCountry(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-accent focus:ring-accent focus:ring-offset-0 [color-scheme:dark]"
                />
                <span className="text-sm text-zinc-400">Mostrar país en el perfil</span>
              </label>
            </div>

            <div className="w-full max-w-sm space-y-2">
              <label className="text-sm text-zinc-500">Privacidad</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showActivity}
                  onChange={e => setShowActivity(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-accent focus:ring-accent focus:ring-offset-0 [color-scheme:dark]"
                />
                <span className="text-sm text-zinc-400">Mostrar actividad a mis amigos</span>
                <button
                  onClick={handleSaveActivity}
                  disabled={updatingActivity || showActivity === initialActivity}
                  className="ml-auto text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
                >
                  {updatingActivity ? 'Guardando...' : 'Guardar'}
                </button>
              </label>
            </div>

            <div className="w-full max-w-sm pt-4 border-t border-zinc-800 lg:border-t-0">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full text-sm text-white bg-red-600 hover:bg-red-500 rounded-lg px-3 py-2 transition"
              >
                Eliminar perfil
              </button>
            </div>
          </div>
        </div>

        {showEditor && (
          <ImageCropModal
            open={showEditor}
            previewUrl={editorPreviewUrl}
            title="Editar foto"
            onSave={handleSaveAvatar}
            onCancel={handleCancelEditor}
          />
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60">
            <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-4">
              <p className="text-sm text-zinc-300">
                Para eliminar tu perfil necesitamos que inicies sesión con Google para confirmar tu identidad.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-sm text-zinc-500 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg px-4 py-2 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="text-sm text-white bg-red-600 hover:bg-red-500 rounded-lg px-4 py-2 transition"
                >
                  Iniciar sesión con Google
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
