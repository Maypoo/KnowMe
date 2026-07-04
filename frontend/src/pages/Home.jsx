import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('No autenticado')
        return res.json()
      })
      .then((data) => setProfile(data.profile))
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false))
  }, [navigate])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    navigate('/login')
  }

  if (loading) return null
  if (!profile) return null

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-semibold mb-2">KnowMe</h1>
      <p className="text-zinc-500 mb-8">Bienvenido, {profile.username}</p>
      <button
        onClick={handleLogout}
        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
      >
        Cerrar sesión
      </button>
    </div>
  )
}
