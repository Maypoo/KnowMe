import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { Search, Settings, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { socket } from '../lib/socket'
import { useTitleBar } from '../lib/TitleBarContext'
import Avatar from '../components/Avatar'
import Logo from '../components/Logo'
import Sidebar from '../components/Sidebar'
import MobileNav from '../components/MobileNav'
import SearchView from '../components/SearchView'
import CreatePostView from '../components/CreatePostView'
import DeleteConfirmModal from '../components/DeleteConfirmModal'
import PreferencesModal from '../components/PreferencesModal'
import Feed from '../components/Feed'
import FriendSearch from '../components/FriendSearch'
import FriendRequests from '../components/FriendRequests'
import FriendsList from '../components/FriendsList'
import PendingRequests from '../components/PendingRequests'
import ChatsList from '../components/ChatsList'
import ChatConversation from '../components/ChatConversation'
import NewChat from '../components/NewChat'
import VoiceCall from '../components/VoiceCall'
import NotificationsPanel from '../components/NotificationsPanel'
import BlockedList from '../components/BlockedList'

const TABS = [
  { key: 'friends', label: 'Amigos' },
  { key: 'add', label: 'Agregar' },
  { key: 'requests', label: 'Solicitudes' },
]

const HOME_STATE_KEY = 'knowme_home_state'

function loadSavedState() {
  try {
    const raw = sessionStorage.getItem(HOME_STATE_KEY)
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
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const saved = useRef(loadSavedState())
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showStartupHint, setShowStartupHint] = useState(false)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState(saved.current?.tab ?? 'friends')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [view, setView] = useState(saved.current?.view ?? 'home')
  const [chatsView, setChatsView] = useState(saved.current?.chatsView ?? 'list')
  const [activeChat, setActiveChat] = useState(saved.current?.activeChat ?? null)
  const [postContent, setPostContent] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false)
  const [selectedTagNames, setSelectedTagNames] = useState([])
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
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [prefTagNames, setPrefTagNames] = useState([])
  const [prefSearch, setPrefSearch] = useState('')
  const [savingPrefs, setSavingPrefs] = useState(false)
  const voiceCallRef = useRef(null)
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])
  const activeChatRef = useRef(activeChat)
  useEffect(() => { activeChatRef.current = activeChat }, [activeChat])
  const [incomingCall, setIncomingCall] = useState(null)
  const [incomingCallSeen, setIncomingCallSeen] = useState(false)

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
    if (!loading) {
      setShowStartupHint(false)
      return
    }
    const t = setTimeout(() => setShowStartupHint(true), 4000)
    return () => clearTimeout(t)
  }, [loading])

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
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRequestsCount'] })
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    }

    const handleRequestUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRequestsCount'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    }

    const handleRequestCancelled = () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRequestsCount'] })
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    }

    const handleNewMessage = (data) => {
      if (viewRef.current === 'chats' && activeChatRef.current?.id === data?.chatId) return
      queryClient.invalidateQueries({ queryKey: ['chats'] })
      queryClient.invalidateQueries({ queryKey: ['chatsUnread'] })
    }

    const handleChatCreated = () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] })
    }

    const handleNotification = () => {
      queryClient.invalidateQueries({ queryKey: ['notificationsUnread'] })
    }

    const handleNotificationsCleared = () => {
      queryClient.invalidateQueries({ queryKey: ['notificationsUnread'] })
    }

    const handleMessagesRead = (data) => {
      if (viewRef.current === 'chats' && activeChatRef.current?.id === data?.chatId) return
      queryClient.invalidateQueries({ queryKey: ['chats'] })
      queryClient.invalidateQueries({ queryKey: ['chatsUnread'] })
    }

    const handleReconnect = () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] })
      queryClient.invalidateQueries({ queryKey: ['chatsUnread'] })
      if (activeChatRef.current) {
        queryClient.invalidateQueries({ queryKey: ['messages', activeChatRef.current.id] })
      }
    }

    const handleIncomingCall = (data) => {
      setIncomingCall({ from: data.caller, sdp: data.sdp })
      setIncomingCallSeen(viewRef.current === 'chats' && activeChatRef.current?.otherUser?.id === data.caller.id)
    }

    const handleCallEnd = () => {
      setIncomingCall(null)
      setIncomingCallSeen(false)
    }

    const handleBlocked = (data) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] })
      queryClient.invalidateQueries({ queryKey: ['chatsUnread'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRequestsCount'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notificationsUnread'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      if (activeChatRef.current?.otherUser?.id === data.blockerId) {
        setActiveChat(null)
      }
      if (incomingCall?.from?.id === data.blockerId) {
        setIncomingCall(null)
        setIncomingCallSeen(false)
      }
    }

    const handleBlockedListUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['blockedList'] })
    }

    socket.on('friend_request_received', handleRequestReceived)
    socket.on('friend_request_updated', handleRequestUpdated)
    socket.on('friend_request_cancelled', handleRequestCancelled)
    socket.on('new_message', handleNewMessage)
    socket.on('chat_created', handleChatCreated)
    socket.on('notification', handleNotification)
    socket.on('notifications_cleared', handleNotificationsCleared)
    socket.on('messages_read', handleMessagesRead)
    socket.on('connect', handleReconnect)
    socket.on('signal:offer', handleIncomingCall)
    socket.on('call:end', handleCallEnd)
    socket.on('user:blocked', handleBlocked)
    socket.on('blocked:updated', handleBlockedListUpdated)

    return () => {
      socket.off('friend_request_received', handleRequestReceived)
      socket.off('friend_request_updated', handleRequestUpdated)
      socket.off('friend_request_cancelled', handleRequestCancelled)
      socket.off('new_message', handleNewMessage)
      socket.off('chat_created', handleChatCreated)
      socket.off('notification', handleNotification)
      socket.off('notifications_cleared', handleNotificationsCleared)
      socket.off('messages_read', handleMessagesRead)
      socket.off('connect', handleReconnect)
      socket.off('signal:offer', handleIncomingCall)
      socket.off('call:end', handleCallEnd)
      socket.off('user:blocked', handleBlocked)
      socket.off('blocked:updated', handleBlockedListUpdated)
    }
  }, [profile])

  const { data: unreadTotal } = useQuery({
    queryKey: ['chatsUnread'],
    queryFn: async () => {
      const res = await api('/api/chats/unread/total')
      const data = await res.json()
      return data.total ?? 0
    },
    enabled: !!profile,
  })

  const { data: notificationsCount } = useQuery({
    queryKey: ['notificationsUnread'],
    queryFn: async () => {
      const res = await api('/api/notifications/unread/count')
      const data = await res.json()
      return data.count ?? 0
    },
    enabled: !!profile,
  })

  const { data: pendingRequestsCount } = useQuery({
    queryKey: ['pendingRequestsCount'],
    queryFn: async () => {
      const res = await api('/api/friends/requests/count')
      const data = await res.json()
      return data.count ?? 0
    },
    enabled: !!profile,
  })

  const { data: allTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await api('/api/tags')
      const data = await res.json()
      return data.tags || []
    },
    staleTime: 60000,
  })

  const { data: prefTagIds = [] } = useQuery({
    queryKey: ['preferences', 'tags'],
    queryFn: async () => {
      const res = await api('/api/preferences/tags')
      const data = await res.json()
      return data.tag_ids || []
    },
    enabled: !!profile,
  })

  useEffect(() => {
    const names = prefTagIds
      .map(id => allTags.find(t => t.id === id)?.name)
      .filter(Boolean)
    setPrefTagNames(prev => {
      if (prev.length === names.length && prev.every((n, i) => n === names[i]))
        return prev
      return names
    })
  }, [prefTagIds, allTags])

  useEffect(() => {
    if (!preferencesOpen) {
      setPrefSearch('')
    } else {
      const names = prefTagIds
        .map(id => allTags.find(t => t.id === id)?.name)
        .filter(Boolean)
      setPrefTagNames(prev => {
        if (prev.length === names.length && prev.every((n, i) => n === names[i]))
          return prev
        return names
      })
    }
  }, [preferencesOpen, prefTagIds, allTags])

  const { setTitle } = useTitleBar()

  useEffect(() => {
    const keys = {
      search: 'search',
      home: 'home',
      plus: 'plus',
      notifications: 'notifications',
      chats: chatsView === 'new' ? 'newchat' : activeChat ? 'chat' : 'chats',
      friends: tab === 'add' ? 'add' : tab === 'requests' ? 'requests' : 'friends',
    }
    const label = view === 'chats' && chatsView !== 'new' && activeChat
      ? activeChat.otherUser?.username ? `Chat (${activeChat.otherUser.username})` : 'Chat'
      : null
    setTitle({ key: keys[view] || 'default', label })
  }, [view, tab, chatsView, activeChat, setTitle])

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

  useEffect(() => {
    if (!profile) return
    sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify({ view, tab, activeChat, chatsView }))
  }, [view, tab, activeChat, chatsView, profile])

  const handleLogout = async () => {
    if (socket.connected) {
      socket.disconnect()
    }
    sessionStorage.removeItem(HOME_STATE_KEY)
    await api('/api/auth/logout', { method: 'POST' })
    navigate('/login')
  }

  const handleSelectChat = (chat) => {
    setActiveChat(chat)
    setChatsView('list')
    if (incomingCall && chat.otherUser?.id === incomingCall.from.id) {
      setIncomingCallSeen(true)
    }
  }

  const handleNewChat = () => {
    setChatsView('new')
  }

  const handleBackFromConversation = () => {
    setActiveChat(null)
  }

  const handleBackFromNewChat = () => {
    setChatsView('list')
  }

  const { data: myPost } = useQuery({
    queryKey: ['myPost'],
    queryFn: async () => {
      const res = await api('/api/posts/mine')
      const data = await res.json()
      return data.post || null
    },
    enabled: !!profile,
  })

  const postLikes = myPost?.post_likes?.[0]?.count ?? 0

  useEffect(() => {
    if (view === 'plus') {
      queryClient.invalidateQueries({ queryKey: ['myPost'] })
    }
  }, [view, queryClient])

  useEffect(() => {
    if (myPost !== undefined && !editing) {
      setPostContent(myPost?.content ?? '')
      setSelectedTagNames(myPost?.tags?.map(t => t.name) ?? [])
    }
  }, [myPost, editing])

  const handlePublish = async () => {
    if (!postContent.trim() || publishing) return
    if (editing && postContent.trim() === myPost?.content) return
    setPublishing(true)
    try {
      const res = await api('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: postContent.trim(), tag_names: selectedTagNames }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error(data.error)
        return
      }
      if (data.post) {
        setEditing(false)
        queryClient.invalidateQueries({ queryKey: ['myPost'] })
        queryClient.invalidateQueries({ queryKey: ['feed'] })
      }
    } catch (err) {
      console.error(err)
    }
    setPublishing(false)
  }

  const handleSaveTags = async (tagNames) => {
    const isExisting = !!myPost
    const res = await api(
      isExisting ? `/api/posts/${myPost.id}/tags` : '/api/tags/resolve',
      {
        method: isExisting ? 'PUT' : 'POST',
        body: JSON.stringify({ tag_names: tagNames }),
      }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al guardar etiquetas')
    setSelectedTagNames(tagNames)
    if (myPost) {
      queryClient.invalidateQueries({ queryKey: ['myPost'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    }
  }

  const handleSavePreferences = async () => {
    if (savingPrefs) return
    setSavingPrefs(true)
    try {
      const res = await api('/api/tags/resolve', {
        method: 'POST',
        body: JSON.stringify({ tag_names: prefTagNames }),
      })
      const resolved = await res.json()
      if (!res.ok) throw new Error(resolved.error || 'Error al guardar preferencias')

      const saveRes = await api('/api/preferences/tags', {
        method: 'PUT',
        body: JSON.stringify({ tag_ids: resolved.tag_ids }),
      })
      if (!saveRes.ok) {
        const errData = await saveRes.json()
        throw new Error(errData.error || 'Error al guardar preferencias')
      }
      queryClient.invalidateQueries({ queryKey: ['preferences', 'tags'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      setPreferencesOpen(false)
    } catch (err) {
      console.error(err)
    }
    setSavingPrefs(false)
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
        setEditing(false)
        queryClient.invalidateQueries({ queryKey: ['myPost'] })
        queryClient.invalidateQueries({ queryKey: ['feed'] })
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
    if (q.length < 1) return
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

  const handleSearchBack = () => {
    setSearchQuery('')
    setSearchResults([])
    setSearched(false)
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
        queryClient.invalidateQueries({ queryKey: ['chats'] })
      }
    } catch (err) { console.error(err) }
  }

  if (loading) {
    return (
      <div className="min-h-full bg-zinc-950 flex items-center justify-center px-4">
        <div className="flex flex-col items-center">
          <Logo size={56} monochrome className="mb-4 text-zinc-400 animate-spin-slow" />
          {showStartupHint && (
            <p className="text-zinc-500 text-sm mt-3 max-w-xs mx-auto">
              La primera vez que se usa la app el servidor tarda unos segundos en
              despertar, casi está listo.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return null
  }

  return (
    <div className="h-full relative bg-zinc-950 text-zinc-100 flex flex-col overscroll-none">
      <Sidebar
        profile={profile}
        view={view}
        setView={setView}
        navigate={navigate}
        pendingRequestsCount={pendingRequestsCount}
        notificationsCount={notificationsCount}
        unreadTotal={unreadTotal}
        incomingCall={incomingCall}
        incomingCallSeen={incomingCallSeen}
        handleLogout={handleLogout}
        setPreferencesOpen={setPreferencesOpen}
        setBlockedOpen={setBlockedOpen}
        setTab={setTab}
        setSearchQuery={setSearchQuery}
        setSearchResults={setSearchResults}
        setSearched={setSearched}
        setActiveChat={setActiveChat}
        setChatsView={setChatsView}
      />
      {view === 'search' ? (
        <SearchView
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
          setSearchResults={setSearchResults}
          searching={searching}
          setSearching={setSearching}
          searched={searched}
          setSearched={setSearched}
          recentSearches={recentSearches}
          setRecentSearches={setRecentSearches}
          handleSearch={handleSearch}
          handleSearchBack={handleSearchBack}
          addToRecentSearches={addToRecentSearches}
          navigate={navigate}
          view={view}
          setView={setView}
          tab={tab}
          activeChat={activeChat}
          chatsView={chatsView}
        />
      ) : (
        <div className="lg:ml-64 px-6 py-6 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 lg:hidden">
              <Logo size={28} />
              <h1 className="text-2xl font-semibold">KnowMe</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPreferencesOpen(true)}
                className="rounded-full p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition lg:hidden max-[420px]:hidden"
              >
                <Settings size={20} />
              </button>
              <button
                onClick={() => { setView('search'); setSearchQuery(''); setSearchResults([]); setSearched(false) }}
                className="rounded-full p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition lg:hidden max-[360px]:hidden"
              >
                <Search size={20} />
              </button>
              <div className="relative lg:hidden" ref={dropdownRef}>
                <button onClick={() => setDropdownOpen(!dropdownOpen)} className="flex items-center gap-3 outline-none">
                  <span className="text-zinc-500 text-sm max-[300px]:hidden">{profile.username}</span>
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
                      onClick={() => { setPreferencesOpen(true); setDropdownOpen(false) }}
                      className="hidden w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition max-[420px]:block"
                    >
                      Preferencias
                    </button>
                    <button
                      onClick={() => { setView('search'); setSearchQuery(''); setSearchResults([]); setSearched(false); setDropdownOpen(false) }}
                      className="hidden w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition max-[360px]:block"
                    >
                      Buscar
                    </button>
                    <button
                      onClick={() => { setBlockedOpen(true); setDropdownOpen(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition"
                    >
                      Bloqueados
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
            <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 mb-8 lg:max-w-xl lg:mx-auto lg:w-full">
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
              ))}
            </div>
          )}

          <div className="pb-20 lg:pb-0 flex-1 flex flex-col min-h-0">
            {view === 'home' ? (
              <Feed />
            ) : view === 'plus' ? (
              <CreatePostView
                postContent={postContent}
                setPostContent={setPostContent}
                editing={editing}
                publishing={publishing}
                myPost={myPost}
                postLikes={postLikes}
                selectedTagNames={selectedTagNames}
                tagSelectorOpen={tagSelectorOpen}
                setTagSelectorOpen={setTagSelectorOpen}
                handlePublish={handlePublish}
                handleSaveTags={handleSaveTags}
                handleEdit={handleEdit}
                handleCancel={handleCancel}
                setConfirmingDelete={setConfirmingDelete}
              />
            ) : view === 'notifications' ? (
              <NotificationsPanel />
            ) : view === 'chats' ? (
              <>
                {chatsView === 'new' ? (
                  <NewChat onSelectFriend={handleSelectFriend} onBack={handleBackFromNewChat} />
                ) : (
                  <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:gap-4">
                    <div className={`${activeChat ? 'hidden lg:flex' : 'flex'} flex-col lg:w-96 min-h-0 shrink-0 lg:pr-4`}>
                      <section className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-zinc-100 text-lg font-semibold">Chats</h2>
                          <button
                            onClick={handleNewChat}
                            className="rounded-full p-2 transition hover:opacity-80"
                            style={{ backgroundColor: 'var(--color-accent)' }}
                          >
                            <Plus size={20} strokeWidth={2.5} />
                          </button>
                        </div>
                        <ChatsList
                          onSelectChat={handleSelectChat}
                          incomingCall={incomingCall}
                        />
                      </section>
                    </div>
                    <div className={`${activeChat ? 'flex' : 'hidden lg:flex'} flex-1 flex-col min-h-0`}>
                      {activeChat ? (
                        <ChatConversation chat={activeChat} onBack={handleBackFromConversation} profile={profile} onStartCall={(user) => voiceCallRef.current?.startCall(user)} incomingCall={incomingCall} onJoinCall={(callerUser, sdp) => { setIncomingCall(null); setIncomingCallSeen(false); voiceCallRef.current?.joinCall(callerUser, sdp) }} onClearIncomingCall={() => { setIncomingCall(null); setIncomingCallSeen(false) }} />
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-zinc-500 text-lg">Selecciona un chat para empezar</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {tab === 'add' && (
                  <section className="flex-1 flex flex-col lg:max-w-xl lg:mx-auto lg:w-full">
                    <FriendSearch />
                    <div className="mt-8">
                      <PendingRequests />
                    </div>
                  </section>
                )}

                {tab === 'requests' && (
                  <section className="flex-1 flex flex-col lg:max-w-xl lg:mx-auto lg:w-full">
                    <FriendRequests />
                  </section>
                )}

                {tab === 'friends' && (
                  <section className="flex-1 flex flex-col lg:max-w-xl lg:mx-auto lg:w-full">
                    <FriendsList />
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {view !== 'search' && (
        <MobileNav
          view={view}
          setView={setView}
          setTab={setTab}
          pendingRequestsCount={pendingRequestsCount}
          notificationsCount={notificationsCount}
          unreadTotal={unreadTotal}
          incomingCall={incomingCall}
          incomingCallSeen={incomingCallSeen}
          setActiveChat={setActiveChat}
          setChatsView={setChatsView}
        />
      )}

      {blockedOpen && (
        <BlockedList onClose={() => setBlockedOpen(false)} />
      )}

      <DeleteConfirmModal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        deleting={deleting}
        handleDelete={handleDelete}
      />

      <PreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        prefTagNames={prefTagNames}
        setPrefTagNames={setPrefTagNames}
        prefSearch={prefSearch}
        setPrefSearch={setPrefSearch}
        allTags={allTags}
        savingPrefs={savingPrefs}
        handleSavePreferences={handleSavePreferences}
      />

      <VoiceCall ref={voiceCallRef} />
    </div>
  )
}
