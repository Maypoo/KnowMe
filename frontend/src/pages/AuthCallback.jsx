import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

const SLOW_MS = 20000

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [slow, setSlow] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    let slowTimer

    const handleCallback = async () => {
      setSlow(false)

      const searchParams = new URLSearchParams(window.location.search)
      const isDelete = searchParams.get('action') === 'delete'

      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))
      const accessToken = hashParams.get('access_token') || hashParams.get('provider_access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken && refreshToken) {
        try {
          if (isDelete) {
            const res = await api('/api/auth/delete-account', {
              method: 'POST',
              body: JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken,
              }),
            })

            if (cancelled) return

            if (!res.ok) {
              const data = await res.json()
              setError(data.error)
              return
            }

            navigate('/login', { state: { deleted: true } })
            return
          }

          const res = await api('/api/auth/google', {
            method: 'POST',
            body: JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken,
            }),
          })

          if (cancelled) return

          const data = await res.json()

          if (!res.ok) {
            setError(data.error)
            return
          }

          if (data.needsUsername) {
            navigate('/setup-username', { state: { email: data.user.email, accessToken } })
          } else {
            navigate('/')
          }
          return
        } catch (err) {
          console.error(err)
          if (!cancelled) {
            setError('Error de conexión. Intenta de nuevo.')
          }
          return
        }
      }

      if (isDelete) {
        setError('No se pudo reautenticar con Google')
        return
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (cancelled) return

      if (sessionError || !session) {
        setError('Error al iniciar sesión con Google')
        return
      }

      try {
        const res = await api('/api/auth/google', {
          method: 'POST',
          body: JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
        })

        if (cancelled) return

        const data = await res.json()

        if (!res.ok) {
          setError(data.error)
          return
        }

        if (data.needsUsername) {
          navigate('/setup-username', { state: { email: data.user.email, accessToken: session.access_token } })
        } else {
          navigate('/')
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError('Error de conexión. Intenta de nuevo.')
        }
      }
    }

    handleCallback()

    slowTimer = setTimeout(() => {
      if (!cancelled) {
        setSlow(true)
      }
    }, SLOW_MS)

    return () => {
      cancelled = true
      clearTimeout(slowTimer)
    }
  }, [navigate, retryKey])

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={() => { setError(null); setRetryKey(k => k + 1) }}
            className="text-zinc-300 hover:text-zinc-100 underline bg-transparent border-none cursor-pointer mr-4"
          >
            Reintentar
          </button>
          <button
            onClick={() => navigate('/login')}
            className="text-zinc-500 hover:text-zinc-300 underline bg-transparent border-none cursor-pointer"
          >
            Volver a iniciar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-zinc-400">
          {slow ? 'Aún estamos procesando tu inicio de sesión...' : 'Completando inicio de sesión...'}
        </p>
        {slow && (
          <button
            onClick={() => navigate('/login')}
            className="mt-4 text-zinc-500 hover:text-zinc-300 underline bg-transparent border-none cursor-pointer text-sm"
          >
            Volver a iniciar sesión
          </button>
        )}
      </div>
    </div>
  )
}
