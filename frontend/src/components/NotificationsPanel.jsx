import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { socket } from '../lib/socket'
import Avatar from './Avatar'
import { SkeletonBox, SkeletonAvatar } from './Skeleton'

export default function NotificationsPanel() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api('/api/notifications')
      const data = await res.json()
      return data.notifications || []
    },
  })

  const following = useMemo(() => {
    const ids = new Set()
    for (const n of notifications) { if (n.isFollowingBack) ids.add(n.fromUser.id) }
    return ids
  }, [notifications])

  useEffect(() => {
    api('/api/notifications/read', { method: 'POST' }).catch(console.error)
    queryClient.invalidateQueries({ queryKey: ['notificationsUnread'] })
  }, [queryClient])

  useEffect(() => {
    const handleNotification = (data) => {
      queryClient.setQueryData(['notifications'], (old) => {
        if (!old) return [data.notification]
        const idx = old.findIndex(n => n.id === data.notification.id)
        if (idx !== -1) { const next = [...old]; next[idx] = data.notification; next.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); return next }
        return [data.notification, ...old]
      })
    }
    const handleNotificationsCleared = () => queryClient.setQueryData(['notifications'], [])
    socket.on('notification', handleNotification); socket.on('notifications_cleared', handleNotificationsCleared)
    return () => { socket.off('notification', handleNotification); socket.off('notifications_cleared', handleNotificationsCleared) }
  }, [queryClient])

  const handleFollowBack = async (username, userId) => {
    try {
      const res = await api(`/api/follow/${encodeURIComponent(username)}`, { method: 'POST' })
      if (res.ok) queryClient.setQueryData(['notifications'], (old) => (old || []).map(n => n.fromUser.id === userId ? { ...n, isFollowingBack: true } : n))
    } catch (err) { console.error(err) }
  }
  const handleUnfollow = async (username, userId) => {
    try {
      const res = await api(`/api/follow/${encodeURIComponent(username)}`, { method: 'DELETE' })
      if (res.ok) queryClient.setQueryData(['notifications'], (old) => (old || []).map(n => n.fromUser.id === userId ? { ...n, isFollowingBack: false } : n))
    } catch (err) { console.error(err) }
  }
  const handleSendMessage = async (user) => {
    try {
      const res = await api('/api/chats', { method: 'POST', body: JSON.stringify({ userId: user.id }) })
      const data = await res.json()
      if (res.ok && data.chat) {
        queryClient.invalidateQueries({ queryKey: ['chats'] })
        const chat = data.chat
        const state = JSON.parse(sessionStorage.getItem('knowme_home_state') || '{}')
        state.activeChat = chat; state.view = 'chats'; state.chatsView = 'list'
        sessionStorage.setItem('knowme_home_state', JSON.stringify(state))
        window.location.reload()
      }
    } catch (err) { console.error(err) }
  }
  const handleClearAll = async () => {
    try {
      const res = await api('/api/notifications', { method: 'DELETE' })
      if (res.ok) { queryClient.setQueryData(['notifications'], []); queryClient.invalidateQueries({ queryKey: ['notificationsUnread'] }) }
    } catch (err) { console.error(err) }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col lg:max-w-lg lg:mx-auto lg:w-full xl:relative xl:left-[-148px]">
        <div className="relative flex items-center justify-center mb-6 lg:grid lg:grid-cols-3 lg:sticky lg:top-0 lg:bg-zinc-950/80 lg:backdrop-blur-[12px] lg:z-10 lg:py-4 lg:mb-0">
          <h2 className="text-zinc-200 text-[17px] font-semibold tracking-[-0.015em] text-center lg:col-start-2">Notificaciones</h2>
        </div>
        <ul className="space-y-1.5">
          {[1,2,3,4,5].map(i => (
            <li key={i} className="flex items-center material-thin rounded-2xl px-3 py-3">
              <div className="flex items-center gap-3"><SkeletonAvatar size={32} /><SkeletonBox className="h-4 w-48" /></div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col lg:max-w-lg lg:mx-auto lg:w-full xl:relative xl:left-[-148px]">
      <div className="relative flex items-center justify-center mb-6 lg:grid lg:grid-cols-3 lg:sticky lg:top-0 lg:bg-zinc-950/80 lg:backdrop-blur-[12px] lg:z-10 lg:py-4 lg:mb-0">
        <h2 className="text-zinc-200 text-[17px] font-semibold tracking-[-0.015em] text-center lg:col-start-2">Notificaciones</h2>
        {notifications.length > 0 && <button onClick={handleClearAll} className="absolute right-0 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors lg:static lg:justify-self-end">Limpiar todo</button>}
      </div>
      {notifications.length === 0 ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-zinc-500 text-sm text-center">No hay notificaciones.</p></div>
      ) : (
        <ul className="space-y-1.5">
          {notifications.map(notif => (
            <li key={notif.id} className="flex items-center justify-between material-thin rounded-2xl px-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => navigate('/' + notif.fromUser.username)} className="shrink-0 tap-highlight"><Avatar src={notif.fromUser.avatar_url} size={32} /></button>
                <span className="text-zinc-100 text-sm tracking-[-0.011em] truncate">
                  <button onClick={() => navigate('/' + notif.fromUser.username)} className="font-semibold hover:underline inline tracking-[-0.011em]">{notif.fromUser.username}</button>
                  {notif.type === 'follow' && ' empezó a seguirte'}
                  {notif.type === 'friend_accept' && ' aceptó tu solicitud'}
                  {notif.type === 'friend_reject' && ' rechazó tu solicitud'}
                  {notif.type === 'unfollow' && ' dejó de seguirte'}
                  {notif.type === 'unfriend' && ' rompió su amistad'}
                  {notif.type === 'like' && ' le dió like a tu publicación'}
                </span>
              </div>
              {notif.type === 'follow' && !following.has(notif.fromUser.id) && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={(e) => { e.stopPropagation(); handleFollowBack(notif.fromUser.username, notif.fromUser.id) }} className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-colors ml-3 shadow-sm tap-highlight">Seguir también</motion.button>
              )}
              {notif.type === 'follow' && following.has(notif.fromUser.id) && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={(e) => { e.stopPropagation(); handleUnfollow(notif.fromUser.username, notif.fromUser.id) }} className="shrink-0 bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ml-3 tap-highlight">Dejar de seguir</motion.button>
              )}
              {notif.type === 'friend_accept' && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={(e) => { e.stopPropagation(); handleSendMessage(notif.fromUser) }} className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-colors ml-3 shadow-sm tap-highlight">Enviar mensaje</motion.button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
