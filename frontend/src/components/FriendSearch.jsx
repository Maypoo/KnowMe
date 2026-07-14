import { useState } from 'react'
import { api } from '../lib/api'

export default function FriendSearch({ onRequestSent }) {
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState(null)

  const handleChange = (e) => {
    setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))
    setStatus(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus(null)

    if (!username || username.length < 1) {
      setStatus({ type: 'error', message: 'Ingresá un nombre de usuario' })
      return
    }

    try {
      const res = await api('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username: '@' + username }),
      })

      const data = await res.json()

      if (!res.ok) {
        setStatus({ type: 'error', message: data.error })
        return
      }

      setStatus({ type: 'success', message: 'Solicitud enviada' })
      setUsername('')
      onRequestSent?.()
    } catch (err) {
      console.error(err)
      setStatus({ type: 'error', message: 'Error de conexión' })
    }
  }

  return (
    <div>
      <h2 className="text-center text-zinc-300 text-lg font-semibold mb-3">Agregar un amigo</h2>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none select-none text-sm">@</span>
          <input
            type="text"
            value={username}
            onChange={handleChange}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-zinc-600 transition"
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: '#6659ff' }}
        >
          Agregar
        </button>
      </form>
      {status && (
        <p className={`text-sm mt-2 text-center ${status.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
          {status.message}
        </p>
      )}
    </div>
  )
}
