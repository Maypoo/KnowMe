import { motion } from 'framer-motion'
import { Home as HomeIcon, Users, Plus, Bell, Send, Phone } from 'lucide-react'
import { spring } from '../lib/motion'

export default function MobileNav({
  view, setView, setTab,
  pendingRequestsCount, notificationsCount, unreadTotal,
  incomingCall, incomingCallSeen,
  setActiveChat, setChatsView
}) {
  const items = [
    { key: 'home', icon: HomeIcon, action: () => setView('home') },
    { key: 'friends', icon: Users, badge: pendingRequestsCount, action: () => { setView('friends'); setTab('friends') } },
    { key: 'plus', special: true, icon: Plus, action: () => setView('plus') },
    { key: 'notifications', icon: Bell, badge: notificationsCount, action: () => setView('notifications') },
    { key: 'chats', icon: Send, badge: unreadTotal, incoming: incomingCall && !incomingCallSeen, action: () => { setView('chats'); setActiveChat(null); setChatsView('list') } },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-4 lg:hidden z-30 pointer-events-none">
      <div className="pointer-events-auto material-thick rounded-[1.75rem] px-2 py-2 flex items-center gap-1 mx-3 w-full max-w-sm shadow-[0_16px_40px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.08)_inset]">
        {items.map(item => {
          const isActive = view === item.key
          const Icon = item.icon
          if (item.special) {
            return (
              <motion.button
                key={item.key}
                onClick={item.action}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.12 }}
                className="mx-1 rounded-full p-3 bg-[var(--color-accent)] text-white shadow-[0_4px_16px_rgba(102,89,255,0.4)] tap-highlight will-change-transform"
                aria-label="Crear"
              >
                <Plus size={22} strokeWidth={2.5} />
              </motion.button>
            )
          }
          return (
            <motion.button
              key={item.key}
              onClick={item.action}
              whileTap={{ scale: 0.9 }}
              className={`relative flex-1 flex items-center justify-center py-2.5 rounded-full tap-highlight ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {isActive && (
                <motion.div layoutId="mobile-active" transition={spring.snappy} className="absolute inset-0 rounded-full bg-white/[0.08] border border-white/[0.06]" />
              )}
              <span className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {item.incoming ? (
                  <span className="absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center w-[16px] h-[16px] bg-green-500 text-white shadow-sm">
                    <Phone size={9} strokeWidth={3} />
                  </span>
                ) : item.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2 rounded-full text-[10px] font-semibold flex items-center justify-center min-w-[16px] h-[16px] px-1 bg-[var(--color-accent)] text-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
