import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import NumberFlow from '@number-flow/react'
import { ArrowLeft, Search, X, Plus, User, Home as HomeIcon, Users, Send, Bell, Edit, Heart, Trash2 } from 'lucide-react'
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
import NotificationsPanel from '../components/NotificationsPanel'

const TABS = [
  { key: 'friends', label: 'Amigos' },
  { key: 'add', label: 'Agregar' },
  { key: 'requests', label: 'Solicitudes' },
]

const HOME_STATE_KEY = 'knowme_home_state'

function loadSavedState() {
  try {
    const raw = localStorage.getItem(HOME_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.view && !['friends', 'chats', 'search', 'home', 'notifications', 'plus'].includes(parsed.view)) return null
    if (parsed.tab && !['friends', 'add', 'requests'].includes(parsed.tab)) return null
    if (parsed.chatsView && !['list', 'new'].includes(parsed.chatsView)) return null
    return parsed
  } catch (err) {
    console.error(err)
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
  const [requestsRefresh, setRequestsRefresh] = useState(0)
  const [pendingRefresh, setPendingRefresh] = useState(0)
  const [friendsRefresh, setFriendsRefresh] = useState(0)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [view, setView] = useState(saved.current?.view ?? 'friends')
  const [chatsView, setChatsView] = useState(saved.current?.chatsView ?? 'list')
  const [activeChat, setActiveChat] = useState(saved.current?.activeChat ?? null)
  const [chatsRefreshTrigger, setChatsRefreshTrigger] = useState(0)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)
  const [postContent, setPostContent] = useState('')
  const [myPost, setMyPost] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [postLikes, setPostLikes] = useState(0)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0)
  const [notificationsCount, setNotificationsCount] = useState(0)
  const dropdownRef = useRef(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('knowme_recent_searches') || '[]')
    } catch (err) { console.error(err); return [] }
  })
  const voiceCallRef = useRef(null)
  const [feedPosts, setFeedPosts] = useState([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [sendingRequest, setSendingRequest] = useState(null)
  const [likingPostId, setLikingPostId] = useState(null)

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
      setRequestsRefresh(t => t + 1)
    }

    const handleRequestUpdated = () => {
      setPendingRefresh(t => t + 1)
      setFriendsRefresh(t => t + 1)
    }

    const handleRequestCancelled = () => {
      setRequestsRefresh(t => t + 1)
    }

    const handleNewMessage = () => {
      setChatsRefreshTrigger(t => t + 1)
    }

    const handleChatCreated = () => {
      setChatsRefreshTrigger(t => t + 1)
    }

    const handleNotification = () => {
      fetchNotificationCount()
    }

    const handleNotificationsCleared = () => {
      fetchNotificationCount()
    }

    socket.on('friend_request_received', handleRequestReceived)
    socket.on('friend_request_updated', handleRequestUpdated)
    socket.on('friend_request_cancelled', handleRequestCancelled)
    socket.on('new_message', handleNewMessage)
    socket.on('chat_created', handleChatCreated)
    socket.on('notification', handleNotification)
    socket.on('notifications_cleared', handleNotificationsCleared)

    return () => {
      socket.off('friend_request_received', handleRequestReceived)
      socket.off('friend_request_updated', handleRequestUpdated)
      socket.off('friend_request_cancelled', handleRequestCancelled)
      socket.off('new_message', handleNewMessage)
      socket.off('chat_created', handleChatCreated)
      socket.off('notification', handleNotification)
      socket.off('notifications_cleared', handleNotificationsCleared)
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
      .catch((err) => { console.error(err) })
  }, [profile, chatsRefreshTrigger])

  const fetchNotificationCount = useCallback(async () => {
    try {
      const res = await api('/api/notifications/unread/count')
      const data = await res.json()
      if (data.count !== undefined) {
        setNotificationsCount(data.count)
      }
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    if (!profile) return
    api('/api/friends/requests/count')
      .then(res => res.json())
      .then(data => {
        if (data.count !== undefined) {
          setPendingRequestsCount(data.count)
        }
      })
      .catch((err) => { console.error(err) })
  }, [profile, requestsRefresh])

  useEffect(() => {
    if (!profile) return
    fetchNotificationCount()
  }, [profile, fetchNotificationCount])

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
      } catch (err) { console.error(err) }
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

  const fetchMyPost = useCallback(async () => {
    try {
      const res = await api('/api/posts/mine')
      const data = await res.json()
      if (data.post) {
        setMyPost(data.post)
        setPostContent(data.post.content)
        setPostLikes(data.post.post_likes?.[0]?.count ?? 0)
      } else {
        setMyPost(null)
        setPostContent('')
        setPostLikes(0)
      }
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    if (!profile) return
    fetchMyPost()
  }, [profile, fetchMyPost])

  const fetchFeed = useCallback(async () => {
    setFeedLoading(true)
    try {
      const res = await api('/api/posts/feed')
      const data = await res.json()
      setFeedPosts(data.posts || [])
    } catch (err) {
      console.error(err)
      setFeedPosts([])
    }
    setFeedLoading(false)
  }, [])

  useEffect(() => {
    if (!profile || view !== 'home') return
    fetchFeed()
  }, [profile, view, fetchFeed])

  const handleFeedLike = async (postId, liked) => {
    if (likingPostId) return
    setLikingPostId(postId)
    setFeedPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, likes_count: liked ? p.likes_count - 1 : p.likes_count + 1, liked_by_me: !liked }
        : p
    ))
    const endpoint = liked ? `/api/posts/${postId}/unlike` : `/api/posts/${postId}/like`
    try {
      const res = await api(endpoint, { method: 'POST' })
      if (!res.ok) {
        setFeedPosts(prev => prev.map(p =>
          p.id === postId
            ? { ...p, likes_count: liked ? p.likes_count + 1 : p.likes_count - 1, liked_by_me: liked }
            : p
        ))
      }
    } catch (err) {
      setFeedPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, likes_count: liked ? p.likes_count + 1 : p.likes_count - 1, liked_by_me: liked }
          : p
      ))
    }
    setLikingPostId(null)
  }

  const handleSendFriendRequest = async (post) => {
    setSendingRequest(post.id)
    try {
      const res = await api('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username: post.username }),
      })
      if (res.ok) {
        setFeedPosts(prev => prev.map(p =>
          p.id === post.id ? { ...p, friend_request_status: 'pending' } : p
        ))
      }
    } catch (err) {
      console.error(err)
    }
    setSendingRequest(null)
  }

  const handlePublish = async () => {
    if (!postContent.trim() || publishing) return
    if (editing && postContent.trim() === myPost.content) return
    setPublishing(true)
    try {
      const res = await api('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: postContent.trim() }),
      })
      const data = await res.json()
      if (data.post) {
        setMyPost(data.post)
        setPostLikes(0)
        setEditing(false)
      }
    } catch (err) {
      console.error(err)
    }
    setPublishing(false)
  }

  const handleEdit = () => {
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
    if (myPost) setPostContent(myPost.content)
  }

  const handleDelete = async () => {
    if (!confirmingDelete) return
    setDeleting(true)
    try {
      const res = await api('/api/posts', { method: 'DELETE' })
      const data = await res.json()
      if (data.deleted) {
        setMyPost(null)
        setPostContent('')
        setPostLikes(0)
        setEditing(false)
      }
    } catch (err) {
      console.error(err)
    }
    setDeleting(false)
    setConfirmingDelete(false)
  }

  const addToRecentSearches = (value, type) => {
    const prev = JSON.parse(localStorage.getItem('knowme_recent_searches') || '[]')
    const filtered = prev.filter(s => s.value !== value || s.type !== type)
    const next = [{ type, value }, ...filtered].slice(0, 10)
    localStorage.setItem('knowme_recent_searches', JSON.stringify(next))
    setRecentSearches(next)
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
    } catch (err) {
      console.error(err)
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
    } catch (err) { console.error(err) }
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
      {view === 'search' ? (
        <div className="flex-1 flex flex-col min-h-0 px-6 py-6">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setView('friends')}
              className="rounded-full p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
            >
              <ArrowLeft size={20} />
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
                    onClick={() => { addToRecentSearches(user.username, 'user'); localStorage.setItem(HOME_STATE_KEY, JSON.stringify({ view, tab, activeChat, chatsView })); navigate('/' + user.username) }}
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
                      onClick={() => { localStorage.removeItem('knowme_recent_searches'); setRecentSearches([]) }}
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
                            localStorage.setItem(HOME_STATE_KEY, JSON.stringify({ view, tab, activeChat, chatsView }))
                            navigate('/' + entry.value)
                          } else {
                            const synthetic = { preventDefault: () => {} }
                            handleSearch(synthetic, entry.value)
                          }
                        }}
                      >
                        {entry.type === 'user' ? (
                          <User size={16} className="text-zinc-600 shrink-0" />
                        ) : (
                          <Search size={16} className="text-zinc-600 shrink-0" />
                        )}
                        <span className="flex-1 text-sm text-zinc-400 group-hover:text-zinc-300 transition truncate">{entry.value}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); const prev = JSON.parse(localStorage.getItem('knowme_recent_searches') || '[]'); const next = prev.filter(s => s.value !== entry.value || s.type !== entry.type); localStorage.setItem('knowme_recent_searches', JSON.stringify(next)); setRecentSearches(next) }}
                          className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-6 py-6 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-semibold">KnowMe</h1>
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setView('search'); setSearchQuery(''); setSearchResults([]); setSearched(false) }}
                className="rounded-full p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
              >
                <Search size={20} />
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
            {view === 'home' ? (
              <div className="flex-1 overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar">
                {feedLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-zinc-500">Cargando posteos...</p>
                  </div>
                ) : feedPosts.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-zinc-500">No hay posteos aún</p>
                  </div>
                ) : (
                  feedPosts.map(post => (
                    <div key={post.id} className="h-full snap-start flex flex-col items-center justify-center px-6">
                      <button onClick={() => navigate('/' + post.username)} className="flex items-center gap-3 mb-6 hover:opacity-80 transition">
                        <Avatar src={post.avatar_url} size={40} />
                        <span className="text-zinc-100 font-medium text-sm">{post.display_name || post.username}</span>
                      </button>
                      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
                        <p className="text-zinc-100 text-lg leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleFeedLike(post.id, post.liked_by_me)}
                          disabled={likingPostId === post.id}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: '#6659ff' }}
                        >
                          <Heart
                            size={20}
                            strokeWidth={2.5}
                            className={post.liked_by_me ? 'text-white fill-white' : 'text-white'}
                          />
                          <span className="text-sm font-medium text-white">
                            {post.likes_count}
                          </span>
                        </button>
                        {post.friend_request_status === 'accepted' ? (
                          <span
                            className="rounded-xl px-4 py-2.5 text-sm text-white opacity-60"
                            style={{ backgroundColor: '#6659ff' }}
                          >
                            Amigos
                          </span>
                        ) : post.friend_request_status === 'pending' ? (
                          <span
                            className="rounded-xl px-4 py-2.5 text-sm text-white opacity-60"
                            style={{ backgroundColor: '#6659ff' }}
                          >
                            Solicitud enviada
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSendFriendRequest(post)}
                            disabled={sendingRequest === post.id}
                            className="rounded-xl px-4 py-2.5 text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: '#6659ff' }}
                          >
                            {sendingRequest === post.id ? 'Enviando...' : 'Enviar solicitud'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : view === 'plus' ? (
              <div className="flex-1 flex items-center justify-center px-6">
                <div className="w-full max-w-md flex flex-col items-center gap-4 h-60">
                  <textarea
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value.slice(0, 300))}
                    placeholder="Escribí tus intereses actuales."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none transition h-32"
                    style={myPost && !editing ? { borderColor: '#52525b', opacity: 0.5 } : undefined}
                    readOnly={!!myPost && !editing}
                    maxLength={300}
                  />
                  <div className="w-full flex items-center justify-between">
                    <span className="text-zinc-500 text-sm">{postContent.length}/300</span>
                    <div className="flex items-center gap-2">
                      {myPost && !editing && (
                        <>
                          <button
                            onClick={() => setConfirmingDelete(true)}
                            className="rounded-lg p-2 transition hover:opacity-80"
                            style={{ backgroundColor: '#ef4444' }}
                          >
                            <Trash2 size={18} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={handleEdit}
                            className="rounded-lg p-2 transition hover:opacity-80"
                            style={{ backgroundColor: '#6659ff' }}
                          >
                            <Edit size={18} strokeWidth={2.5} />
                          </button>
                        </>
                      )}
                      {editing && (
                        <button
                          onClick={handleCancel}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        onClick={handlePublish}
                        disabled={!!myPost && !editing || publishing || !postContent.trim() || editing && postContent.trim() === myPost?.content}
                        className="px-6 py-2 rounded-lg text-white font-medium transition"
                        style={{
                          backgroundColor: !postContent.trim() ? '#3f3f46' : '#6659ff',
                          opacity: !editing && !!myPost || editing && postContent.trim() === myPost?.content ? 0.5 : 1,
                          cursor: !postContent.trim() ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {publishing ? 'Publicando...' : 'Publicar'}
                      </button>
                    </div>
                  </div>
                  <div className="w-full flex items-center gap-1.5 text-zinc-400 text-sm">
                    <Heart size={14} strokeWidth={2} className="text-red-400" fill="#f87171" />
                    <NumberFlow value={postLikes} suffix={` like${postLikes !== 1 ? 's' : ''}`} />
                  </div>
                </div>
              </div>
            ) : view === 'notifications' ? (
              <NotificationsPanel onNotificationCount={setNotificationsCount} />
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
                        <Plus size={20} strokeWidth={2.5} />
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
                    <FriendSearch onRequestSent={() => setPendingRefresh(t => t + 1)} />
                    <div className="mt-8">
                      <PendingRequests refreshTrigger={pendingRefresh} />
                    </div>
                  </section>
                )}

                {tab === 'requests' && (
                  <section className="flex-1 flex flex-col">
                    <FriendRequests refreshTrigger={requestsRefresh} onRespond={() => { setRequestsRefresh(t => t + 1); setFriendsRefresh(t => t + 1) }} />
                  </section>
                )}

                {tab === 'friends' && (
                  <section className="flex-1 flex flex-col">
                    <FriendsList refreshTrigger={friendsRefresh} onUpdate={() => setFriendsRefresh(t => t + 1)} />
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {view !== 'search' && (
        <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-4">
          <div className="bg-zinc-900 rounded-2xl px-8 max-[420px]:px-4 py-3 flex items-center gap-12 max-[420px]:gap-6 shadow-lg">
            <button
              onClick={() => setView('home')}
              className={`relative transition ${view === 'home' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}
            >
              <HomeIcon size={24} />
            </button>

            <button
              onClick={() => { setView('friends'); setTab('friends') }}
              className={`relative transition ${view === 'friends' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}
            >
              <Users size={24} />
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
              onClick={() => setView('plus')}
              className="rounded-full p-2 transition hover:opacity-80"
              style={{ backgroundColor: '#6659ff' }}
            >
              <Plus size={24} strokeWidth={2.5} />
            </button>

            <button
              onClick={() => setView('notifications')}
              className={`relative transition ${view === 'notifications' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}
            >
              <Bell size={24} />
              {notificationsCount > 0 && (
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
                  {notificationsCount > 99 ? '99+' : notificationsCount}
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
              <Send size={24} />
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
      )}

      {confirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmingDelete(false)} />
          <div className="relative bg-zinc-900 rounded-xl px-6 py-5 w-full max-w-xs">
            <p className="text-zinc-100 text-sm mb-4">
              ¿Eliminar tu post?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmingDelete(false)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm transition disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <VoiceCall ref={voiceCallRef} profile={profile} />
    </div>
  )
}
