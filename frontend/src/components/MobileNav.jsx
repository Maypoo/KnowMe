import { Home as HomeIcon, Users, Plus, Bell, Send, Phone } from 'lucide-react'

export default function MobileNav({
  view, setView, setTab,
  pendingRequestsCount, notificationsCount, unreadTotal,
  incomingCall, incomingCallSeen,
  setActiveChat, setChatsView
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-4 lg:hidden">
      <div className="bg-zinc-900 rounded-2xl px-8 py-3 flex items-center justify-between mx-3 w-full max-w-sm shadow-lg">
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
          className="rounded-full p-2 transition hover:opacity-80"
          style={{ backgroundColor: 'var(--color-accent)' }}
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
          onClick={() => {
            setView('chats')
            setActiveChat(null)
            setChatsView('list')
          }}
          className={`relative transition ${view === 'chats' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}
          style={incomingCall && !incomingCallSeen ? { color: '#22c55e' } : undefined}
        >
          <Send size={24} />
          {incomingCall && !incomingCallSeen ? (
            <span
              className="absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center"
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
              className="absolute -top-1.5 -right-1.5 rounded-full text-[11px] font-medium flex items-center justify-center"
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
      </div>
    </div>
  )
}
