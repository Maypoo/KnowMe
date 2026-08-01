import { useState, useEffect, useRef } from 'react'
import { Search, User, Home as HomeIcon, Users, Send, Bell, Plus, Phone } from 'lucide-react'
import Avatar from './Avatar'

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

  return (
    <div className="hidden lg:flex lg:absolute lg:left-0 lg:top-0 lg:bottom-0 lg:w-64 lg:flex-col lg:bg-zinc-900 lg:p-6 lg:z-40 lg:border-r lg:border-zinc-800">
      <h1 className="text-2xl font-semibold mb-8 lg:mb-8">KnowMe</h1>
      <nav className="flex flex-col gap-1 flex-1">
        <button
          onClick={() => setView('home')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
            view === 'home'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
          }`}
        >
          <HomeIcon size={22} />
          <span className="text-sm font-medium">Inicio</span>
        </button>
        <button
          onClick={() => { setView('search'); setSearchQuery(''); setSearchResults([]); setSearched(false) }}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
            view === 'search'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
          }`}
        >
          <Search size={22} />
          <span className="text-sm font-medium">Buscar</span>
        </button>
        <button
          onClick={() => { setView('friends'); setTab('friends') }}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition relative ${
            view === 'friends'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
          }`}
        >
          <Users size={22} />
          <span className="text-sm font-medium">Amigos</span>
          {pendingRequestsCount > 0 && (
            <span
              className="ml-auto rounded-full text-[11px] font-medium flex items-center justify-center"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: '#fff',
                minWidth: 18,
                height: 18,
                padding: '0 5px',
              }}
            >
              {pendingRequestsCount > 99 ? '99+' : pendingRequestsCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setView('plus')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
            view === 'plus'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
          }`}
        >
          <Plus size={22} />
          <span className="text-sm font-medium">Crear</span>
        </button>
        <button
          onClick={() => setView('notifications')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition relative ${
            view === 'notifications'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
          }`}
        >
          <Bell size={22} />
          <span className="text-sm font-medium">Notificaciones</span>
          {notificationsCount > 0 && (
            <span
              className="ml-auto rounded-full text-[11px] font-medium flex items-center justify-center"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: '#fff',
                minWidth: 18,
                height: 18,
                padding: '0 5px',
              }}
            >
              {notificationsCount > 99 ? '99+' : notificationsCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { setView('chats'); setActiveChat(null); setChatsView('list') }}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition relative ${
            view === 'chats'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
          } ${incomingCall && !incomingCallSeen ? 'animate-pulse bg-green-900/30' : ''}`}
          style={incomingCall && !incomingCallSeen ? { color: '#22c55e' } : undefined}
        >
          <Send size={22} />
          <span className="text-sm font-medium">Chats</span>
          {incomingCall && !incomingCallSeen ? (
            <span
              className="ml-auto rounded-full flex items-center justify-center animate-pulse"
              style={{
                backgroundColor: '#22c55e',
                color: '#fff',
                width: 18,
                height: 18,
              }}
            >
              <Phone size={11} strokeWidth={3} />
            </span>
          ) : unreadTotal > 0 ? (
            <span
              className="ml-auto rounded-full text-[11px] font-medium flex items-center justify-center"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: '#fff',
                minWidth: 18,
                height: 18,
                padding: '0 5px',
              }}
            >
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          ) : null}
        </button>
        <button
          onClick={() => navigate('/' + profile.username)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
        >
          <User size={22} />
          <span className="text-sm font-medium">Perfil</span>
        </button>
      </nav>
      <div className="pt-4 border-t border-zinc-800 relative" ref={sidebarDropdownRef}>
        <button
          onClick={() => setSidebarDropdownOpen(!sidebarDropdownOpen)}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-zinc-800/50 transition"
        >
          <Avatar src={profile.avatar_url} size={36} />
          <span className="text-sm text-zinc-300 truncate">{profile.username}</span>
        </button>
        {sidebarDropdownOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-50">
            <button
              onClick={() => { navigate('/' + profile.username); setSidebarDropdownOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition"
            >
              Ir al perfil
            </button>
            <button
              onClick={() => { navigate('/profile/edit'); setSidebarDropdownOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition"
            >
              Editar perfil
            </button>
            <button
              onClick={() => { setPreferencesOpen(true); setSidebarDropdownOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition"
            >
              Preferencias
            </button>
            <button
              onClick={() => { setBlockedOpen(true); setSidebarDropdownOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition"
            >
              Bloqueados
            </button>
            <div className="border-t border-zinc-800 my-1" />
            <button
              onClick={() => { handleLogout(); setSidebarDropdownOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-800 transition"
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
