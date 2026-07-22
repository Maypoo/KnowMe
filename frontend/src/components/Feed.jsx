import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { api } from '../lib/api'
import Avatar from './Avatar'
import { SkeletonBox, SkeletonAvatar } from './Skeleton'

export default function Feed() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [sendingRequest, setSendingRequest] = useState(null)
  const [feedIndex, setFeedIndex] = useState(() => {
    const saved = sessionStorage.getItem('feedIndex')
    return saved ? parseInt(saved, 10) : 0
  })
  const feedRef = useRef(null)
  const feedCooldown = useRef(false)
  const feedTouchStart = useRef(null)
  const feedLikeState = useRef({})

  const { data: feedPosts = [], isLoading: feedLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => {
      const res = await api('/api/posts/feed')
      const data = await res.json()
      return data.posts || []
    },
  })

  useEffect(() => {
    if (feedPosts.length === 0) return
    setFeedIndex(prev => Math.min(prev, feedPosts.length - 1))
  }, [feedPosts.length])

  useEffect(() => {
    sessionStorage.setItem('feedIndex', feedIndex)
  }, [feedIndex])

  useEffect(() => {
    const container = feedRef.current
    if (!container) return

    const onWheel = (e) => {
      e.preventDefault()
      if (feedCooldown.current) return
      feedCooldown.current = true
      setTimeout(() => { feedCooldown.current = false }, 600)
      if (e.deltaY > 0) {
        setFeedIndex(prev => Math.min(prev + 1, feedPosts.length - 1))
      } else {
        setFeedIndex(prev => Math.max(prev - 1, 0))
      }
    }

    const onTouchStart = (e) => {
      feedTouchStart.current = e.touches[0].clientY
    }

    const onTouchEnd = (e) => {
      if (feedTouchStart.current === null || feedCooldown.current) return
      const dy = feedTouchStart.current - e.changedTouches[0].clientY
      feedTouchStart.current = null
      if (Math.abs(dy) < 30) return
      feedCooldown.current = true
      setTimeout(() => { feedCooldown.current = false }, 600)
      if (dy > 0) {
        setFeedIndex(prev => Math.min(prev + 1, feedPosts.length - 1))
      } else {
        setFeedIndex(prev => Math.max(prev - 1, 0))
      }
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [feedPosts.length])

  const handleFeedLike = (postId) => {
    const currentLiked = feedLikeState.current[postId]
    const newLiked = currentLiked === undefined ? !feedPosts.find(p => p.id === postId)?.liked_by_me : !currentLiked
    feedLikeState.current[postId] = newLiked

    queryClient.setQueryData(['feed'], (old) =>
      (old || []).map(p =>
        p.id === postId
          ? {
              ...p,
              likes_count: newLiked ? p.likes_count + 1 : p.likes_count - 1,
              liked_by_me: newLiked,
            }
          : p
      )
    )

    const endpoint = newLiked ? `/api/posts/${postId}/like` : `/api/posts/${postId}/unlike`
    api(endpoint, { method: 'POST' }).catch(() => {
      feedLikeState.current[postId] = !newLiked
      queryClient.setQueryData(['feed'], (old) =>
        (old || []).map(p =>
          p.id === postId
            ? {
                ...p,
                likes_count: p.likes_count + (newLiked ? -1 : 1),
                liked_by_me: !newLiked,
              }
            : p
        )
      )
    })
  }

  const handleSendFriendRequest = async (post) => {
    setSendingRequest(post.id)
    try {
      const res = await api('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username: post.username }),
      })
      if (res.ok) {
        queryClient.setQueryData(['feed'], (old) =>
          (old || []).map(p =>
            p.id === post.id ? { ...p, friend_request_status: 'pending' } : p
          )
        )
      }
    } catch (err) {
      console.error(err)
    }
    setSendingRequest(null)
  }

  return (
    <div ref={feedRef} className="flex-1 overflow-hidden overscroll-none relative">
      {feedLoading ? (
        <div className="h-full flex flex-col items-center justify-center px-6">
          <div className="flex items-center gap-3 mb-6">
            <SkeletonAvatar size={40} />
            <SkeletonBox className="h-4 w-28" />
          </div>
          <SkeletonBox className="w-full max-w-md h-40 mb-6" />
          <div className="flex items-center gap-3">
            <SkeletonBox className="h-10 w-28 rounded-xl" />
            <SkeletonBox className="h-10 w-36 rounded-xl" />
          </div>
        </div>
      ) : feedPosts.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <p className="text-zinc-500">No hay posteos aún</p>
        </div>
      ) : (
        <div
          className="h-full transition-transform duration-300 ease-out will-change-transform"
          style={{ transform: `translateY(-${feedIndex * 100}%)` }}
        >
          {feedPosts.map((post, i) => (
            <div key={post.id} className="h-full flex flex-col items-center justify-center px-6">
              <button onClick={() => navigate('/' + post.username)} className="flex items-center gap-3 mb-6 hover:opacity-80 transition">
                <Avatar src={post.avatar_url} size={40} />
                <span className="text-zinc-100 font-medium text-sm">{post.display_name || post.username}</span>
              </button>
              <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
                <p className="text-zinc-100 text-lg leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleFeedLike(post.id)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl transition hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: 'var(--color-accent)' }}
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
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  >
                    Amigos
                  </span>
                ) : post.friend_request_status === 'pending' ? (
                  <span
                    className="rounded-xl px-4 py-2.5 text-sm text-white opacity-60"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  >
                    Solicitud enviada
                  </span>
                ) : (
                  <button
                    onClick={() => handleSendFriendRequest(post)}
                    disabled={sendingRequest === post.id}
                    className="rounded-xl px-4 py-2.5 text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  >
                    {sendingRequest === post.id ? 'Enviando...' : 'Enviar solicitud'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
