import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export default function FriendSearch() {
  const queryClient = useQueryClient()
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
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRequestsCount'] })
    } catch (err) {
      console.error(err)
      setStatus({ type: 'error', message: 'Error de conexión' })
    }
  }

  return (
    <div>
      <h2 className="text-center text-zinc-200 text-[17px] font-semibold tracking-[-0.015em] mb-3">Agregar un amigo</h2>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none select-none text-sm">@</span>
          <input
            type="text"
            value={username}
            onChange={handleChange}
            className="w-full bg-zinc-800/80 border border-white/[0.06] rounded-xl pl-8 pr-3 py-2.5 text-zinc-100 placeholder-zinc-500 text-[15px] tracking-[-0.011em] focus:outline-none focus:border-[var(--color-accent)]/30 transition-colors"
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 shadow-sm tap-highlight"
          style={{ backgroundColor: 'var(--color-accent)' }}
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
