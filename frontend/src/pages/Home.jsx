import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { socket } from '../lib/socket'
import Avatar from '../components/Avatar'
import FriendSearch from '../components/FriendSearch'
import FriendRequests from '../components/FriendRequests'
import FriendsList from '../components/FriendsList'
import PendingRequests from '../components/PendingRequests'
import ChatsList from '../components/ChatsList'
import ChatConversation from '../components/ChatConversation'
import NewChat from '../components/NewChat'
import VoiceCall from '../components/VoiceCall'

const TABS = [
  { key: 'friends', label: 'Amigos' },
  { key: 'add', label: 'Agregar' },
  { key: 'requests', label: 'Solicitudes' },
  { key: 'pending', label: 'Enviadas' },
]

const HOME_STATE_KEY = 'knowme_home_state'

function loadSavedState() {
  try {
    const raw = localStorage.getItem(HOME_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.view && !['friends', 'chats'].includes(parsed.view)) return null
    if (parsed.tab && !['friends', 'add', 'requests', 'pending'].includes(parsed.tab)) return null
    if (parsed.chatsView && !['list', 'new'].includes(parsed.chatsView)) return null
    return parsed
  } catch {
    return null
  }
}

export default function Home() {
  const navigate = useNavigate()
  const saved = useRef(loadSavedState())
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState(saved.current?.tab ?? 'friends')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [view, setView] = useState(saved.current?.view ?? 'friends')
  const [chatsView, setChatsView] = useState(saved.current?.chatsView ?? 'list')
  const [activeChat, setActiveChat] = useState(saved.current?.activeChat ?? null)
  const [chatsRefreshTrigger, setChatsRefreshTrigger] = useState(0)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0)
  const dropdownRef = useRef(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('knowme_recent_searches') || '[]')
    } catch { return [] }
  })
  const voiceCallRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    api('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('No autenticado')
        return res.json()
      })
      .then((data) => {
        if (!data.profile) throw new Error('Perfil no encontrado')
        setProfile(data.profile)
      })
      .catch((err) => {
        setError(err.message)
        navigate('/login')
      })
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => {
    if (!profile) return

    if (!socket.connected) {
      socket.connect()
    }

    const handleRequestReceived = () => {
      setRefreshTrigger(t => t + 1)
    }

    const handleRequestUpdated = () => {
      setRefreshTrigger(t => t + 1)
    }

    const handleRequestCancelled = () => {
      setRefreshTrigger(t => t + 1)
    }

    const handleNewMessage = () => {
      setChatsRefreshTrigger(t => t + 1)
    }

    const handleChatCreated = () => {
      setChatsRefreshTrigger(t => t + 1)
    }

    socket.on('friend_request_received', handleRequestReceived)
    socket.on('friend_request_updated', handleRequestUpdated)
    socket.on('friend_request_cancelled', handleRequestCancelled)
    socket.on('new_message', handleNewMessage)
    socket.on('chat_created', handleChatCreated)

    return () => {
      socket.off('friend_request_received', handleRequestReceived)
      socket.off('friend_request_updated', handleRequestUpdated)
      socket.off('friend_request_cancelled', handleRequestCancelled)
      socket.off('new_message', handleNewMessage)
      socket.off('chat_created', handleChatCreated)
    }
  }, [profile])

  useEffect(() => {
    if (!profile) return
    api('/api/chats/unread/total')
      .then(res => res.json())
      .then(data => {
        if (data.total !== undefined) {
          setUnreadMessagesCount(data.total)
        }
      })
      .catch(() => {})
  }, [profile, chatsRefreshTrigger])

  useEffect(() => {
    if (!profile) return
    api('/api/friends/requests/count')
      .then(res => res.json())
      .then(data => {
        if (data.count !== undefined) {
          setPendingRequestsCount(data.count)
        }
      })
      .catch(() => {})
  }, [profile, refreshTrigger])

  useEffect(() => {
    if (!profile) return
    localStorage.setItem(HOME_STATE_KEY, JSON.stringify({ view, tab, activeChat, chatsView }))
  }, [view, tab, activeChat, chatsView, profile])

  useEffect(() => {
    if (!profile) return
    const stored = sessionStorage.getItem('chatReturn')
    if (stored) {
      try {
        const { activeChat: storedChat } = JSON.parse(stored)
        if (storedChat) {
          setView('chats')
          setActiveChat(storedChat)
        }
      } catch {}
      sessionStorage.removeItem('chatReturn')
    }
  }, [profile])

  const handleLogout = async () => {
    if (socket.connected) {
      socket.disconnect()
    }
    localStorage.removeItem(HOME_STATE_KEY)
    await api('/api/auth/logout', { method: 'POST' })
    navigate('/login')
  }

  const handleSelectChat = (chat) => {
    setActiveChat(chat)
    setChatsView('list')
  }

  const handleNewChat = () => {
    setChatsView('new')
  }

  const handleBackFromConversation = () => {
    setActiveChat(null)
    setChatsRefreshTrigger(t => t + 1)
  }

  const handleBackFromNewChat = () => {
    setChatsView('list')
  }

  const addToRecentSearches = (value, type) => {
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.value !== value || s.type !== type)
      const next = [{ type, value }, ...filtered].slice(0, 10)
      localStorage.setItem('knowme_recent_searches', JSON.stringify(next))
      return next
    })
  }

  const handleSearch = async (e, query) => {
    e.preventDefault()
    const q = query ?? searchQuery
    if (q.length < 2) return
    setSearchQuery(q)
    setSearched(true)
    setSearching(true)
    try {
      const res = await api(`/api/users/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSearchResults(data.users || [])
    } catch {
      setSearchResults([])
    }
    setSearching(false)
    addToRecentSearches(q, 'query')
  }

  const handleSelectFriend = async (friend) => {
    try {
      const res = await api('/api/chats', {
        method: 'POST',
        body: JSON.stringify({ userId: friend.id }),
      })
      const data = await res.json()
      if (res.ok && data.chat) {
        setActiveChat(data.chat)
        setChatsView('list')
      }
    } catch {}
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <p className="text-zinc-400">Cargando...</p>
      </div>
    )
  }

  if (error || !profile) {
    return null
  }

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="px-6 py-6 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold">KnowMe</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setView('search'); setSearchQuery(''); setSearchResults([]); setSearched(false) }}
              className="rounded-full p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setDropdownOpen(!dropdownOpen)} className="flex items-center gap-3 outline-none">
                <span className="text-zinc-500 text-sm">{profile.username}</span>
                <Avatar src={profile.avatar_url} size={40} />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-50">
                  <button
                    onClick={() => { navigate('/' + profile.username); setDropdownOpen(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition"
                  >
                    Perfil
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition"
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {view === 'friends' && (
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 mb-8">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition relative ${
                  tab === t.key
                    ? 'bg-zinc-950 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t.label}
                {t.key === 'requests' && pendingRequestsCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 rounded-full text-[11px] font-medium flex items-center justify-center"
                    style={{
                      backgroundColor: '#6659ff',
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
            ))}
          </div>
        )}

        <div className="pb-20 flex-1 flex flex-col min-h-0">
          {view === 'search' ? (
            <section className="flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setView('friends')}
                  className="rounded-full p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>
                <h2 className="text-zinc-100 text-lg font-semibold">Buscar usuarios</h2>
              </div>
              <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nombre de usuario..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-zinc-600 transition"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={searching || searchQuery.length < 2}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#6659ff' }}
                >
                  Buscar
                </button>
              </form>
              <div className="flex-1 overflow-y-auto">
                {searching && (
                  <p className="text-zinc-500 text-sm text-center py-8">Buscando...</p>
                )}
                {!searching && searchResults.length > 0 && (
                  <div className="space-y-1">
                    {searchResults.map(user => (
                      <button
                        key={user.id}
                        onClick={() => { addToRecentSearches(user.username, 'user'); navigate('/' + user.username) }}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 transition rounded-lg"
                      >
                        <Avatar src={user.avatar_url} size={40} />
                        <span className="text-sm text-zinc-300">{user.username}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!searching && searched && searchResults.length === 0 && (
                  <p className="text-zinc-500 text-sm text-center py-8">Sin resultados</p>
                )}
                {!searching && !searched && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-zinc-500 text-sm font-medium">Búsquedas recientes</h3>
                      {recentSearches.length > 0 && (
                        <button
                          onClick={() => { setRecentSearches([]); localStorage.removeItem('knowme_recent_searches') }}
                          className="text-xs text-zinc-600 hover:text-zinc-400 transition"
                        >
                          Limpiar todo
                        </button>
                      )}
                    </div>
                    {recentSearches.length === 0 ? (
                      <p className="text-zinc-600 text-sm text-center py-8">No hay búsquedas recientes</p>
                    ) : (
                      <div className="space-y-1">
                        {recentSearches.map((entry, i) => (
                          <div
                            key={`${entry.type}-${entry.value}-${i}`}
                            className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
                            onClick={() => {
                              setSearchQuery('')
                              setSearchResults([])
                              setSearched(false)
                              if (entry.type === 'user') {
                                navigate('/' + entry.value)
                              } else {
                                const synthetic = { preventDefault: () => {} }
                                handleSearch(synthetic, entry.value)
                              }
                            }}
                          >
                            {entry.type === 'user' ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 shrink-0">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 shrink-0">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                            )}
                            <span className="flex-1 text-sm text-zinc-400 group-hover:text-zinc-300 transition truncate">{entry.value}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setRecentSearches(prev => { const next = prev.filter(s => s.value !== entry.value || s.type !== entry.type); localStorage.setItem('knowme_recent_searches', JSON.stringify(next)); return next }) }}
                              className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          ) : view === 'chats' ? (
            <>
              {chatsView === 'new' ? (
                <NewChat onSelectFriend={handleSelectFriend} onBack={handleBackFromNewChat} />
              ) : activeChat ? (
                <ChatConversation chat={activeChat} onBack={handleBackFromConversation} profile={profile} onStartCall={(user) => voiceCallRef.current?.startCall(user)} onChatRead={() => setChatsRefreshTrigger(t => t + 1)} />
              ) : (
                <section className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-zinc-100 text-lg font-semibold">Chats</h2>
                    <button
                      onClick={handleNewChat}
                      className="rounded-full p-2 transition hover:opacity-80"
                      style={{ backgroundColor: '#6659ff' }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                  <ChatsList
                    onSelectChat={handleSelectChat}
                    refreshTrigger={chatsRefreshTrigger}
                  />
                </section>
              )}
            </>
          ) : (
            <>
              {tab === 'add' && (
                <section className="flex-1 flex flex-col">
                  <FriendSearch />
                </section>
              )}

              {tab === 'requests' && (
                <section className="flex-1 flex flex-col">
                  <FriendRequests refreshTrigger={refreshTrigger} onRespond={() => setRefreshTrigger(t => t + 1)} />
                </section>
              )}

              {tab === 'pending' && (
                <section className="flex-1 flex flex-col">
                  <PendingRequests refreshTrigger={refreshTrigger} />
                </section>
              )}

              {tab === 'friends' && (
                <section className="flex-1 flex flex-col">
                  <FriendsList refreshTrigger={refreshTrigger} onUpdate={() => setRefreshTrigger(t => t + 1)} />
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-4">
        <div className="bg-zinc-900 rounded-2xl px-8 py-3 flex items-center gap-12 shadow-lg">
          <button
            onClick={() => { setView('friends'); setTab('friends') }}
            className={`relative transition ${view === 'friends' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {pendingRequestsCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 rounded-full text-[11px] font-medium flex items-center justify-center"
                style={{
                  backgroundColor: '#6659ff',
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
            onClick={() => {
              setView('chats')
              setActiveChat(null)
              setChatsView('list')
            }}
            className={`relative transition ${view === 'chats' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {unreadMessagesCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 rounded-full text-[11px] font-medium flex items-center justify-center"
                style={{
                  backgroundColor: '#6659ff',
                  color: '#fff',
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                }}
              >
                {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <VoiceCall ref={voiceCallRef} profile={profile} />
    </div>
  )
}
