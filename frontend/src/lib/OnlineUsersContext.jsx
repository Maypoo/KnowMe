import { createContext, useContext, useEffect, useState } from 'react'
import { socket } from './socket'

const OnlineUsersContext = createContext({
  onlineUsers: new Set(),
  isOnline: () => false,
})

export function OnlineUsersProvider({ children }) {
  const [onlineUsers, setOnlineUsers] = useState(new Set())

  useEffect(() => {
    const handleUsersOnline = ({ userIds }) => {
      setOnlineUsers(new Set(userIds))
    }
    const handleUserOnline = ({ userId }) => {
      setOnlineUsers(prev => new Set([...prev, userId]))
    }
    const handleUserOffline = ({ userId }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    }

    socket.on('users:online', handleUsersOnline)
    socket.on('user:online', handleUserOnline)
    socket.on('user:offline', handleUserOffline)

    return () => {
      socket.off('users:online', handleUsersOnline)
      socket.off('user:online', handleUserOnline)
      socket.off('user:offline', handleUserOffline)
    }
  }, [])

  const isOnline = (userId) => onlineUsers.has(userId)

  return (
    <OnlineUsersContext.Provider value={{ onlineUsers, isOnline }}>
      {children}
    </OnlineUsersContext.Provider>
  )
}

export function useOnlineUsers() {
  return useContext(OnlineUsersContext)
}
