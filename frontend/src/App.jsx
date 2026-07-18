import { Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import Login from './pages/Login'
import Home from './pages/Home'
import AuthCallback from './pages/AuthCallback'
import SetupUsername from './pages/SetupUsername'
import EditProfile from './pages/EditProfile'
import PublicProfile from './pages/PublicProfile'

function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-4xl font-semibold text-zinc-100 mb-2">404</h1>
        <p className="text-zinc-500 mb-6">No encontramos esta página</p>
        <a
          href="/"
          className="inline-block bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/setup-username" element={<SetupUsername />} />
        <Route path="/profile/edit" element={<EditProfile />} />
        <Route path="/:username" element={<PublicProfile />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </QueryClientProvider>
  )
}
