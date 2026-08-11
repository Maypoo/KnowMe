import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, Users, MessageCircleMore, Earth } from 'lucide-react'
import { isTauri } from '@tauri-apps/api/core'
import { api, setAuthToken, clearAuthToken } from '../lib/api'
import { startOAuth, onOAuthTokens } from '../lib/oauth'
import Logo from '../components/Logo'


const PC_EXE_URL = 'https://github.com/Maypoo/KnowMe/releases/download/0.1.1/KnowMe-Setup-x64.exe'
const isDesktop = isTauri()


export default function Login() {
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const deleted = location.state?.deleted

  useEffect(() => {
    clearAuthToken()
  }, [])

  const completeLogin = async (accessToken, refreshToken) => {
    setError(null)
    try {
      setAuthToken(accessToken, refreshToken)
      const res = await api('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión')
      if (data.needsUsername) {
        navigate('/setup-username', { state: { email: data.user.email, accessToken, refreshToken } })
      } else {
        navigate('/')
      }
    } catch (err) {
      console.error(err)
      setError('Error de conexión. Intenta de nuevo.')
    }
    setGoogleLoading(false)
  }

  useEffect(() => {
    return onOAuthTokens(async (tokens) => {
      if (!tokens?.access_token || !tokens?.refresh_token) {
        setGoogleLoading(false)
        return
      }
      await completeLogin(tokens.access_token, tokens.refresh_token)
    })
  }, [])

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError(null)
    try {
      await startOAuth()
    } catch (err) {
      console.error(err)
      setError('Error al iniciar sesión con Google')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="relative min-h-full flex flex-col bg-[#050714] overflow-hidden">

      <div
        className="pointer-events-none absolute -top-[50vh] right-[40%] h-[200vh] w-[20%] origin-top-right -rotate-[35deg] bg-[#4c36ed]/70 blur-3xl shadow-[0_0_120px_50px_rgba(76,54,237,0.5)] hidden xl:block"
        aria-hidden="true"
      />

      <section className={`relative z-10 hidden xl:grid xl:grid-cols-2 ${isDesktop ? 'flex-1 overflow-hidden' : 'min-h-screen'}`}>

      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center" aria-hidden="true">
        <svg
          className="w-[80vw] h-auto opacity-20 stroke-accent"
          viewBox="-162 -40 950 780"
          fill="none"
          strokeWidth={0.5}
        >
          <path d="M404.3,694.42c-5.31,3.02-11.43,4.28-17.54,4.04C-121.67,678.24-112.88,19.48,319.62,0c427.82,0,420.01,622.75,3.05,578.12-1.06-.11-2.39-.53-5.99-1.21-260.83-68.82-212.38-407.04,2.29-409.8,172.62.89,217.07,222.22,66.85,263.11-79.54,20.33-82.63-63.03-23.27-75.35.69-.14,1.4-.25,2.1-.35,37.53-5.54,48.73-62.77,1.76-93.22-1.81-1.17-3.73-2.17-5.72-2.99-14.82-6.17-28.79-9.27-41.72-8.53-120.06-.88-141.81,187.3-1.63,240.92,1.51.58,3.08,1.04,4.66,1.39,309.21,68.09,321.65-417.41-3.03-412.09C.38,96.87-32.77,559.8,317.73,645.03c.83.2,1.67.37,2.5.52,23.98,4.07,46.31,5.39,65.99,4.45,5.46-.26,10.94.73,15.83,3.17,17.5,8.72,20.7,30.73,2.25,41.24Z" />
        </svg>
      </div>
        <div className="flex items-center justify-center px-4 py-16 lg:-mr-24">
          <div className="flex flex-col items-center gap-8 w-full max-w-[496px]" style={{ '--iso-w': '120px' }}>
            <div className="flex items-center gap-8">
              <Logo size={120} />
              <h1 className="text-6xl font-bold text-zinc-100 tracking-tight">KnowMe</h1>
            </div>
            <p className="text-zinc-100 text-2xl font-normal max-w-md text-left self-start ml-[calc(var(--iso-w)*0.4)]">
              Conectate con tus <span className="text-accent font-bold">amigos</span>, conocé <span className="text-accent font-bold">gente nueva</span> y conversá en <span className="text-accent font-bold">tiempo real</span>, el tiempo que quieras.
            </p>
            <hr className="self-start ml-[calc(var(--iso-w)*0.4)] w-24 border-t-2 border-accent" />
            <div className="self-start ml-[calc(var(--iso-w)*0.4)] max-w-md w-full flex items-start gap-4">
              <div className="flex flex-1 min-w-0 flex-col items-start">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20 text-accent">
                  <Users size={28} />
                </div>
                <h3 className="mt-3 text-zinc-100 font-semibold">Conocer gente</h3>
                <p className="mt-1 text-zinc-400 text-sm">Conectá con personas que comparten tus intereses.</p>
              </div>
              <div className="flex flex-1 min-w-0 flex-col items-start">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20 text-accent">
                  <MessageCircleMore size={28} />
                </div>
                <h3 className="mt-3 text-zinc-100 font-semibold">Conversaciones</h3>
                <p className="mt-1 text-zinc-400 text-sm">Chateá en tiempo real con tus amigos o personas nuevas, sin límites.</p>
              </div>
              <div className="flex flex-1 min-w-0 flex-col items-start">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20 text-accent">
                  <Earth size={28} />
                </div>
                <h3 className="mt-3 text-zinc-100 font-semibold">Conexiones</h3>
                <p className="mt-1 text-zinc-400 text-sm">Conocé personas nuevas y creá vínculos reales en un espacio seguro</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center px-4 py-16 lg:-ml-24">
          <div className="w-full max-w-md rounded-[2rem] border border-accent/30 bg-zinc-950/50 p-8 backdrop-blur-sm min-h-[560px] flex flex-col justify-center">
            <div className="text-center mb-14">
              <div className="flex justify-center mb-8">
                <Logo size={72} />
              </div>
              <h1 className="text-3xl font-bold text-zinc-100 mb-1">¡Bienvenido!</h1>
              <p className="text-zinc-400 text-base">Iniciá sesión o regístrate para continuar</p>
            </div>
            {deleted && <p className="text-green-400 text-sm text-center mb-8">Cuenta eliminada correctamente.</p>}
            {error && <p className="text-red-400 text-sm text-center mb-8">{error}</p>}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full max-w-[340px] mx-auto bg-white text-zinc-950 rounded-xl py-2.5 font-semibold hover:bg-zinc-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {googleLoading ? 'Conectando...' : 'Continuar con Google'}
            </button>
            <p className="text-zinc-400 text-sm text-center mt-14 leading-relaxed max-w-[220px] mx-auto">
              Al continuar aceptás los <span className="text-accent font-bold">términos</span> y la <span className="text-accent font-bold">política de privacidad</span>.
            </p>
          </div>
        </div>
      </section>

      <section className={`relative z-10 xl:hidden flex flex-col w-full ${isDesktop ? 'flex-1 min-h-0' : 'h-screen'}`}>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20" aria-hidden="true">
          <svg
            className="w-[140vw] h-auto max-w-none stroke-accent"
            viewBox="-162 -40 950 780"
            fill="none"
            strokeWidth={0.5}
          >
            <path d="M404.3,694.42c-5.31,3.02-11.43,4.28-17.54,4.04C-121.67,678.24-112.88,19.48,319.62,0c427.82,0,420.01,622.75,3.05,578.12-1.06-.11-2.39-.53-5.99-1.21-260.83-68.82-212.38-407.04,2.29-409.8,172.62.89,217.07,222.22,66.85,263.11-79.54,20.33-82.63-63.03-23.27-75.35.69-.14,1.4-.25,2.1-.35,37.53-5.54,48.73-62.77,1.76-93.22-1.81-1.17-3.73-2.17-5.72-2.99-14.82-6.17-28.79-9.27-41.72-8.53-120.06-.88-141.81,187.3-1.63,240.92,1.51.58,3.08,1.04,4.66,1.39,309.21,68.09,321.65-417.41-3.03-412.09C.38,96.87-32.77,559.8,317.73,645.03c.83.2,1.67.37,2.5.52,23.98,4.07,46.31,5.39,65.99,4.45,5.46-.26,10.94.73,15.83,3.17,17.5,8.72,20.7,30.73,2.25,41.24Z" />
          </svg>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar px-6 py-6">
          <div className="flex flex-1 flex-col items-center justify-center gap-5 py-4 text-center">
            <div className="relative">
              <div className="absolute inset-0 -z-10 scale-[1.6] rounded-full bg-accent/25 blur-2xl" aria-hidden="true" />
              <Logo size={72} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-100">KnowMe</h1>
            <p className="max-w-sm text-lg leading-relaxed text-zinc-300">
              Conectate con tus <span className="font-semibold text-accent">amigos</span>, conocé <span className="font-semibold text-accent">gente nueva</span> y conversá en <span className="font-semibold text-accent">tiempo real</span>.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-medium text-[#c6c0ff]">
                <Users size={13} />
                Conocer gente
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-medium text-[#c6c0ff]">
                <MessageCircleMore size={13} />
                Conversaciones
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-medium text-[#c6c0ff]">
                <Earth size={13} />
                Conexiones
              </span>
            </div>

            {deleted && <p className="text-center text-sm text-green-400">Cuenta eliminada correctamente.</p>}
            {error && <p className="text-center text-sm text-red-400">{error}</p>}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="mx-auto flex w-[340px] max-w-full items-center justify-center gap-2.5 rounded-2xl bg-white py-3.5 font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50 active:scale-[0.99]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {googleLoading ? 'Conectando...' : 'Continuar con Google'}
            </button>
            <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
              Al continuar aceptás los <span className="font-semibold text-accent">términos</span> y la <span className="font-semibold text-accent">política de privacidad</span>.
            </p>
          </div>
        </div>
      </section>

      {!isDesktop && (
        <section className="hidden xl:block relative z-10 px-4 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-50 tracking-tight mb-4">
              Descargar para Windows
            </h2>
            <p className="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto">
              Descargá la aplicación de escritorio para Windows y disfrutá todas las funciones con mejor rendimiento y fluidez.
            </p>
          </div>

          <div className="mb-12 sm:mb-16">
            <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-2xl shadow-black/50 overflow-hidden">
              <img
                src="/app-screenshot.png"
                alt="Vista previa de la aplicación KnowMe en escritorio"
                className="w-full aspect-video object-cover"
                draggable={false}
              />
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <a
              href={PC_EXE_URL}
              download
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-accent text-white px-8 py-3.5 font-semibold hover:opacity-90 transition active:scale-[0.98]"
            >
              <Download size={18} />
              KnowMe-Setup-x64.exe
            </a>
            <span className="text-xs text-zinc-500">
              Windows 10/11 · 64 bits · v0.1.1
            </span>
          </div>
        </div>
      </section>
      )}

    </div>
  )
}
