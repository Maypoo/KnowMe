import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { OnlineUsersProvider } from './lib/OnlineUsersContext'
import { TitleBarProvider } from './lib/TitleBarContext'
import TitleBar from './components/TitleBar'
import Login from './pages/Login'
import Home from './pages/Home'
import AuthCallback from './pages/AuthCallback'
import SetupUsername from './pages/SetupUsername'
import EditProfile from './pages/EditProfile'
import PublicProfile from './pages/PublicProfile'

function NotFound() {
  return (
    <div className="min-h-full bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-4xl font-semibold text-zinc-100 mb-2">404</h1>
        <p className="text-zinc-500 mb-6">No encontramos esta página</p>
        <Link
          to="/"
          className="inline-block rounded-full p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
          title="Volver al inicio"
        >
          <ArrowLeft size={20} />
        </Link>
      </div>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const isLogin = location.pathname === '/login'

  return (
    <QueryClientProvider client={queryClient}>
      <OnlineUsersProvider>
        <TitleBarProvider>
          <div className="relative h-screen flex flex-col overscroll-none">
            <div className={isLogin ? 'absolute inset-x-0 top-0 z-20' : 'shrink-0'}>
              <TitleBar />
            </div>
            <main className="flex-1 min-h-0">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/setup-username" element={<SetupUsername />} />
                <Route path="/profile/edit" element={<EditProfile />} />
                <Route path="/:username" element={<PublicProfile />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </TitleBarProvider>
      </OnlineUsersProvider>
    </QueryClientProvider>
  )
}
