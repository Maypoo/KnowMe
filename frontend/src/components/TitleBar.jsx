import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import {
  Minus, Square, Copy, X,
  Home as HomeIcon, Search, Plus, Bell, Users,
  UserPlus, UserCheck, MessageSquare, MessageSquarePlus,
  LogIn, SquarePen, Loader, User,
} from 'lucide-react'
import { useTitleBar } from '../lib/TitleBarContext'
import Logo from './Logo'

const TITLES = {
  default: { icon: null, label: 'KnowMe' },
  home: { icon: HomeIcon, label: 'Inicio' },
  plus: { icon: Plus, label: 'Publicar' },
  notifications: { icon: Bell, label: 'Notificaciones' },
  search: { icon: Search, label: 'Buscar' },
  friends: { icon: Users, label: 'Amigos' },
  add: { icon: UserPlus, label: 'Agregar' },
  requests: { icon: UserCheck, label: 'Solicitudes' },
  chats: { icon: MessageSquare, label: 'Chats' },
  newchat: { icon: MessageSquarePlus, label: 'Nuevo chat' },
  chat: { icon: MessageSquare, label: 'Chat' },
  login: { icon: LogIn, label: 'Iniciar sesión' },
  setup: { icon: SquarePen, label: 'Crea tu perfil' },
  editprofile: { icon: SquarePen, label: 'Editar perfil' },
  connecting: { icon: Loader, label: 'Conectando...' },
  profile: { icon: User, label: 'Perfil' },
}

function routeKey(pathname) {
  if (pathname === '/login') return 'login'
  if (pathname === '/setup-username') return 'setup'
  if (pathname === '/profile/edit') return 'editprofile'
  if (pathname.startsWith('/auth/callback')) return 'connecting'
  if (pathname.length > 1) return 'profile'
  return 'default'
}

export default function TitleBar() {
  const { title } = useTitleBar()
  const location = useLocation()

  const onHome = location.pathname === '/'
  const key = onHome ? title.key : routeKey(location.pathname)
  const config = TITLES[key] || TITLES.default
  const Icon = config.icon
  const label = (onHome || key === 'profile' ? title.label : null)
    || (key === 'profile' ? `Perfil (${location.pathname.slice(1)})` : config.label)

  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
    const appWindow = getCurrentWindow()
    appWindow.isMaximized().then(setMaximized)
    let unlisten
    appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized)
    }).then(fn => { unlisten = fn })
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  if (!isTauri()) return null

  const appWindow = getCurrentWindow()

  return (
    <div
      data-tauri-drag-region
      className="relative h-9 shrink-0 flex items-center bg-zinc-950 select-none"
    >
      <div data-tauri-drag-region className="absolute left-0 flex h-full items-center pl-3 pr-2 gap-1.5">
        <Logo size={14} />
        <span className="text-xs font-semibold text-zinc-500 tracking-wide">KnowMe</span>
      </div>
      <div
        data-tauri-drag-region
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[40%] truncate px-2"
      >
        <span className="flex items-center gap-1.5">
          {Icon && <Icon size={12} className="shrink-0 text-zinc-500" />}
          <span className="text-xs font-medium text-zinc-300 truncate">{label}</span>
        </span>
      </div>
      <div className="absolute right-0 flex h-full">
        <button
          onClick={() => appWindow.minimize()}
          aria-label="Minimizar"
          className="h-full w-11 flex items-center justify-center text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          aria-label={maximized ? 'Restaurar' : 'Maximizar'}
          className="h-full w-11 flex items-center justify-center text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
        >
          {maximized ? <Copy size={14} /> : <Square size={13} />}
        </button>
        <button
          onClick={() => appWindow.close()}
          aria-label="Cerrar"
          className="h-full w-11 flex items-center justify-center text-zinc-400 transition hover:bg-[#e81123] hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
