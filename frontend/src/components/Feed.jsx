import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import Avatar from './Avatar'
import { SkeletonBox, SkeletonAvatar } from './Skeleton'

const MODES = [
  { key: 'friends', label: 'Amigos' },
  { key: 'all', label: 'Conocer' },
]

export default function Feed() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [sendingRequest, setSendingRequest] = useState(null)
  const [feedIndex, setFeedIndex] = useState(() => {
    const saved = sessionStorage.getItem('feedIndex')
    return saved ? parseInt(saved, 10) : 0
  })
  const [feedMode, setFeedMode] = useState(() => {
    return sessionStorage.getItem('feedMode') || 'all'
  })
  const feedRef = useRef(null)
  const feedCooldown = useRef(false)
  const feedTouchStart = useRef(null)
  const feedLikeState = useRef({})

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: feedLoading,
  } = useInfiniteQuery({
    queryKey: ['feed', feedMode],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({ page: pageParam, limit: '20' })
      const endpoint = feedMode === 'friends' ? '/api/posts/friends-feed' : '/api/posts/feed'
      const res = await api(`${endpoint}?${params}`)
      const json = await res.json()
      return json
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
  })

  const handleModeChange = (mode) => {
    setFeedMode(mode)
    sessionStorage.setItem('feedMode', mode)
    sessionStorage.removeItem('feedIndex')
    setFeedIndex(0)
  }

  const feedPosts = data?.pages.flatMap(p => p.posts) || []

  const loadNext = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

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

    const lastIndex = feedPosts.length - 1

    const onWheel = (e) => {
      e.preventDefault()
      if (feedCooldown.current) return
      feedCooldown.current = true
      setTimeout(() => { feedCooldown.current = false }, 600)
      if (e.deltaY > 0) {
        setFeedIndex(prev => {
          const next = Math.min(prev + 1, lastIndex)
          if (next === lastIndex && hasNextPage) {
            loadNext()
          }
          return next
        })
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
        setFeedIndex(prev => {
          const next = Math.min(prev + 1, lastIndex)
          if (next === lastIndex && hasNextPage) {
            loadNext()
          }
          return next
        })
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
  }, [feedPosts.length, hasNextPage, loadNext])

  function updatePostInCache(postId, updater) {
    MODES.forEach(m => {
      queryClient.setQueryData(['feed', m.key], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            posts: page.posts.map(p => (p.id === postId ? updater(p) : p)),
          })),
        }
      })
    })
  }

  const handleFeedLike = (postId) => {
    const currentLiked = feedLikeState.current[postId]
    const post = feedPosts.find(p => p.id === postId)
    const newLiked = currentLiked === undefined ? !post?.liked_by_me : !currentLiked
    feedLikeState.current[postId] = newLiked

    updatePostInCache(postId, (p) => ({
      ...p,
      likes_count: newLiked ? p.likes_count + 1 : p.likes_count - 1,
      liked_by_me: newLiked,
    }))

    const endpoint = newLiked ? `/api/posts/${postId}/like` : `/api/posts/${postId}/unlike`
    api(endpoint, { method: 'POST' }).catch(() => {
      feedLikeState.current[postId] = !newLiked
      updatePostInCache(postId, (p) => ({
        ...p,
        likes_count: p.likes_count + (newLiked ? -1 : 1),
        liked_by_me: !newLiked,
      }))
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
        updatePostInCache(post.id, (p) => ({ ...p, friend_request_status: 'pending' }))
      }
    } catch (err) {
      console.error(err)
    }
    setSendingRequest(null)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="relative px-4">
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1">
          {MODES.map(m => {
            const active = feedMode === m.key
            return (
              <button
                key={m.key}
                onClick={() => handleModeChange(m.key)}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-zinc-950 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

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
            {feedMode === 'all' && <SkeletonBox className="h-10 w-36 rounded-xl" />}
          </div>
        </div>
      ) : feedPosts.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <p className="text-zinc-500">
            {feedMode === 'friends' ? 'No hay posteos de amigos aún' : 'No hay posteos aún'}
          </p>
        </div>
      ) : (
        <div
          className="h-full transition-transform duration-300 ease-out will-change-transform"
          style={{ transform: `translateY(-${feedIndex * 100}%)` }}
        >
          {feedPosts.map((post, i) => (
            <div key={post.id} className="h-full flex flex-col items-center justify-center px-6">
              {i === feedPosts.length - 1 && isFetchingNextPage && (
                <div className="absolute bottom-4 flex items-center gap-2 text-zinc-400 text-sm">
                  <Loader2 size={16} className="animate-spin" />
                  Cargando más...
                </div>
              )}
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
                {feedMode === 'all' && (() => {
                  if (post.friend_request_status === 'pending') {
                    return (
                      <span
                        className="rounded-xl px-4 py-2.5 text-sm text-white opacity-60"
                        style={{ backgroundColor: 'var(--color-accent)' }}
                      >
                        Solicitud enviada
                      </span>
                    )
                  } else {
                    return (
                      <button
                        onClick={() => handleSendFriendRequest(post)}
                        disabled={sendingRequest === post.id}
                        className="rounded-xl px-4 py-2.5 text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: 'var(--color-accent)' }}
                      >
                        {sendingRequest === post.id ? 'Enviando...' : 'Enviar solicitud'}
                      </button>
                    )
                  }
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}