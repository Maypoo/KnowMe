import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function SetupUsername() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = location.state?.email || ''
  const [username, setUsername] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleUsernameChange = (e) => {
    const value = e.target.value
    if (value === '' || value.startsWith('@')) {
      setUsername(value)
      setError(null)
    } else {
      setUsername('@' + value.replace(/[^a-zA-Z0-9_]/g, ''))
      setError(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!username.startsWith('@') || username.length < 2 || !/^@[a-zA-Z0-9_]+$/.test(username)) {
      setError('Elegí un nombre de usuario válido (mínimo 2 caracteres, solo letras, números y guión bajo)')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/setup-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        setLoading(false)
        return
      }

      navigate('/')
    } catch {
      setError('Error de conexión con el servidor')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-zinc-100 mb-2 text-center">Elegí tu nombre de usuario</h1>
        <p className="text-zinc-500 text-sm text-center mb-8">{email}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm text-zinc-400 mb-1">Nombre de usuario</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={handleUsernameChange}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition"
              placeholder="@usuario"
              autoFocus
              required
            />
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
