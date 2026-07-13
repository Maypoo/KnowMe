import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ColorBends from '../components/ColorBends'
import DotField from '../components/DotField'


export default function Login() {
  const location = useLocation()
  const [error, setError] = useState(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const deleted = location.state?.deleted

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    })

    if (signInError) {
      setError('Error al iniciar sesión con Google')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">

      <div className="absolute inset-0 w-full h-full">
        <ColorBends
          colors={["#6659ff"]}
          rotation={90}
          autoRotate={0}
          speed={0.2}
          scale={1}
          frequency={1}
          warpStrength={1}
          mouseInfluence={1}
          parallax={0.5}
          noise={0.15}
          iterations={1}
          intensity={1.5}
          bandWidth={0.5}
          transparent
        />
      </div>

      <div className="absolute inset-0 w-full h-full z-[5]">
        <DotField
          dotRadius={1.5}
          dotSpacing={14}
          cursorRadius={500}
          cursorForce={0.10}
          bulgeOnly={true}
          bulgeStrength={67}
          glowRadius={160}
          glowColor="transparent"
          sparkle={false}
          waveAmplitude={0}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-zinc-100 tracking-tight mb-4">KnowMe</h1>
          <p className="text-zinc-400 text-sm">
            Conectate con tus amigos, conocé gente nueva y conversá en tiempo real, el tiempo que quieras.
          </p>
        </div>
        {deleted && <p className="text-green-400 text-sm text-center mb-4">Cuenta eliminada correctamente.</p>}
        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full bg-white text-zinc-950 rounded-xl py-2.5 font-semibold hover:bg-zinc-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {googleLoading ? 'Conectando...' : 'Continuar con Google'}
        </button>
        <p className="text-zinc-400 text-xs text-center mt-8 leading-relaxed">
          Al continuar aceptás los términos y la política de privacidad.
        </p>
      </div>
    </div>
  )
}
