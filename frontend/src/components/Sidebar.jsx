import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, User, Home as HomeIcon, Users, Send, Bell, Plus, Phone } from 'lucide-react'
import { spring } from '../lib/motion'
import Avatar from './Avatar'

const navItems = (p) => [
  { key: 'home', label: 'Inicio', icon: HomeIcon, action: p.setHome },
  { key: 'search', label: 'Buscar', icon: Search, action: p.setSearch },
  { key: 'friends', label: 'Amigos', icon: Users, action: p.setFriends, badge: p.pendingRequestsCount },
  { key: 'plus', label: 'Crear', icon: Plus, action: p.setPlus },
  { key: 'notifications', label: 'Notificaciones', icon: Bell, action: p.setNotifications, badge: p.notificationsCount },
  { key: 'chats', label: 'Chats', icon: Send, action: p.setChats, incoming: p.incomingCall && !p.incomingCallSeen, badge: p.unreadTotal },
  { key: 'profile', label: 'Perfil', icon: User, action: p.setProfile },
]

export default function Sidebar({
  profile, view, setView, navigate,
  pendingRequestsCount, notificationsCount, unreadTotal,
  incomingCall, incomingCallSeen,
  handleLogout, setPreferencesOpen, setTab,
  setBlockedOpen,
  setSearchQuery, setSearchResults, setSearched,
  setActiveChat, setChatsView
}) {
  const [sidebarDropdownOpen, setSidebarDropdownOpen] = useState(false)
  const sidebarDropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (sidebarDropdownRef.current && !sidebarDropdownRef.current.contains(e.target)) {
        setSidebarDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const actions = {
    setHome: () => setView('home'),
    setSearch: () => { setView('search'); setSearchQuery(''); setSearchResults([]); setSearched(false) },
    setFriends: () => { setView('friends'); setTab('friends') },
    setPlus: () => setView('plus'),
    setNotifications: () => setView('notifications'),
    setChats: () => { setView('chats'); setActiveChat(null); setChatsView('list') },
    setProfile: () => navigate('/' + profile.username),
  }

  return (
    <div className="hidden lg:flex lg:absolute lg:left-4 lg:top-4 lg:bottom-4 lg:w-[280px] lg:flex-col lg:z-40">
      <div className="flex flex-col flex-1 bg-transparent p-5 overflow-hidden">
        <div className="flex-1 flex flex-col justify-center">
          <nav className="flex flex-col gap-1">
          {navItems({ ...actions, pendingRequestsCount, notificationsCount, unreadTotal, incomingCall, incomingCallSeen }).map(item => {
            const active = view === item.key || (item.key === 'profile' ? false : false)
            const isActive = view === item.key
            const Icon = item.icon
            const showPulse = item.incoming
            return (
              <motion.button
                key={item.key}
                onClick={item.action}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tap-highlight will-change-transform ${
                  isActive
                    ? 'text-zinc-100'
                    : showPulse
                      ? 'text-green-400'
                      : 'text-zinc-400 hover:text-zinc-100'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-xl bg-white/[0.08] border border-white/[0.06] shadow-sm"
                  />
                )}
                {showPulse && !isActive && (
                  <span className="absolute inset-0 rounded-xl bg-green-500/10 border border-green-500/20" />
                )}
                <span className="relative flex items-center gap-3">
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="tracking-[-0.011em]">{item.label}</span>
                </span>
                {item.badge > 0 && !showPulse && (
                  <span
                    className="relative ml-auto rounded-full text-[11px] font-semibold flex items-center justify-center min-w-[18px] h-[18px] px-[5px] bg-[var(--color-accent)] text-white shadow-sm"
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
                {showPulse && (
                  <span className="relative ml-auto rounded-full flex items-center justify-center w-[18px] h-[18px] bg-green-500 text-white">
                    <Phone size={11} strokeWidth={3} />
                  </span>
                )}
              </motion.button>
            )
            })}
          </nav>
        </div>
        <div className="pt-4 relative shrink-0" ref={sidebarDropdownRef}>
          <motion.button
            onClick={() => setSidebarDropdownOpen(!sidebarDropdownOpen)}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-3 px-2 py-2 w-full rounded-xl hover:bg-white/[0.06] transition-colors tap-highlight"
          >
            <Avatar src={profile.avatar_url} size={36} />
            <span className="text-sm text-zinc-200 truncate tracking-[-0.011em] font-medium">{profile.username}</span>
          </motion.button>
          <AnimatePresence>
            {sidebarDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 6 }}
                transition={spring.snappy}
                className="absolute bottom-full left-0 mb-2 w-48 material-regular rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.5)] py-1.5 z-50 overflow-hidden will-change-transform"
                style={{ transformOrigin: 'bottom left' }}
              >
                <button onClick={() => { navigate('/' + profile.username); setSidebarDropdownOpen(false) }} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.06] transition-colors">Ir al perfil</button>
                <button onClick={() => { navigate('/profile/edit'); setSidebarDropdownOpen(false) }} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.06] transition-colors">Editar perfil</button>
                <button onClick={() => { setPreferencesOpen(true); setSidebarDropdownOpen(false) }} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.06] transition-colors">Preferencias</button>
                <button onClick={() => { setBlockedOpen(true); setSidebarDropdownOpen(false) }} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.06] transition-colors">Bloqueados</button>
                <div className="border-t border-white/[0.06] my-1" />
                <button onClick={() => { handleLogout(); setSidebarDropdownOpen(false) }} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/[0.06] transition-colors">Cerrar sesión</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
