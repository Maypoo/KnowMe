import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import { api } from '../lib/api'
import Avatar from './Avatar'
import { SkeletonBox, SkeletonAvatar } from './Skeleton'

const MODES = [
  { key: 'friends', label: 'Amigos' },
  { key: 'all', label: 'Conocer' },
]

const TRANSITION_MS = 300
const COPY_COUNT = 3

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

  const basePosts = data?.pages.flatMap(p => p.posts) || []
  const blockLength = basePosts.length
  const isAll = feedMode === 'all'
  const recycling = isAll && !hasNextPage && blockLength > 0
  const [skipTransition, setSkipTransition] = useState(false)
  const renderPosts = recycling
    ? Array.from({ length: COPY_COUNT }).flatMap(() => basePosts)
    : basePosts
  const middleCopyStart = blockLength
  const lastCopyStart = (COPY_COUNT - 1) * blockLength
  const showEndCard = feedMode === 'friends' && !hasNextPage && basePosts.length > 0
  const loadingSlot = hasNextPage && basePosts.length > 0
  const lastFeedIndex = basePosts.length - 1 + (showEndCard ? 1 : 0) + (loadingSlot ? 1 : 0)

  const handleModeChange = (mode) => {
    setFeedMode(mode)
    sessionStorage.setItem('feedMode', mode)
    sessionStorage.removeItem('feedIndex')
    setFeedIndex(0)
  }

  const loadNext = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const goDown = useCallback(() => {
    if (recycling) {
      setFeedIndex(prev => Math.min(prev + 1, lastCopyStart))
      return
    }
    setFeedIndex(prev => {
      const next = Math.min(prev + 1, lastFeedIndex)
      if (next === lastFeedIndex && hasNextPage) {
        loadNext()
      }
      return next
    })
  }, [recycling, lastCopyStart, lastFeedIndex, hasNextPage, loadNext])

  const goUp = useCallback(() => {
    setFeedIndex(prev => Math.max(prev - 1, 0))
  }, [])

  useEffect(() => {
    if (!recycling || feedIndex < lastCopyStart) return
    const timer = setTimeout(() => {
      setSkipTransition(true)
      setFeedIndex(middleCopyStart)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSkipTransition(false)
        })
      })
    }, TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [feedIndex, recycling, lastCopyStart, middleCopyStart])

  useEffect(() => {
    if (renderPosts.length === 0) return
    setFeedIndex(prev =>
      recycling ? Math.min(prev, lastCopyStart) : Math.min(prev, lastFeedIndex)
    )
  }, [recycling, renderPosts.length, lastCopyStart, lastFeedIndex])

  useEffect(() => {
    if (recycling || blockLength === 0) return
    if (hasNextPage && feedIndex >= blockLength - 3) {
      loadNext()
    }
  }, [feedIndex, blockLength, hasNextPage, loadNext, recycling])

  useEffect(() => {
    sessionStorage.setItem('feedIndex', feedIndex)
  }, [feedIndex])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (e.key === 'ArrowDown') {
          goDown()
        } else {
          goUp()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)

    const container = feedRef.current
    if (!container) return

    const onWheel = (e) => {
      e.preventDefault()
      if (feedCooldown.current) return
      feedCooldown.current = true
      setTimeout(() => { feedCooldown.current = false }, 600)
      if (e.deltaY > 0) {
        goDown()
      } else {
        goUp()
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
        goDown()
      } else {
        goUp()
      }
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [renderPosts.length, hasNextPage, lastFeedIndex, goDown, goUp])

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
    const feedPost = basePosts.find(p => p.id === postId)
    const newLiked = currentLiked === undefined ? !feedPost?.liked_by_me : !currentLiked
    feedLikeState.current[postId] = newLiked

    updatePostInCache(postId, (p) => ({
      ...p,
      likes_count: newLiked ? p.likes_count + 1 : p.likes_count - 1,
      liked_by_me: newLiked,
    }))

    if (feedPost) {
      queryClient.setQueryData(['user-post', feedPost.username], (prev) => prev ? {
        ...prev,
        liked_by_me: newLiked,
        likes_count: newLiked ? prev.likes_count + 1 : prev.likes_count - 1,
      } : prev)
    }

    const endpoint = newLiked ? `/api/posts/${postId}/like` : `/api/posts/${postId}/unlike`
    api(endpoint, { method: 'POST' }).catch(() => {
      feedLikeState.current[postId] = !newLiked
      updatePostInCache(postId, (p) => ({
        ...p,
        likes_count: p.likes_count + (newLiked ? -1 : 1),
        liked_by_me: !newLiked,
      }))
      if (feedPost) {
        queryClient.setQueryData(['user-post', feedPost.username], (prev) => prev ? {
          ...prev,
          liked_by_me: !newLiked,
          likes_count: prev.likes_count + (newLiked ? -1 : 1),
        } : prev)
      }
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
        queryClient.invalidateQueries({ queryKey: ['pendingRequests'] })
        queryClient.invalidateQueries({ queryKey: ['pendingRequestsCount'] })
      }
    } catch (err) {
      console.error(err)
    }
    setSendingRequest(null)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 lg:relative">
      <div className="relative px-4 lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 lg:pointer-events-none lg:px-0">
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 lg:w-80 lg:mx-auto lg:pointer-events-auto">
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

      <div className="hidden lg:flex lg:flex-col lg:absolute lg:right-4 lg:top-1/2 lg:-translate-y-1/2 lg:z-10 lg:gap-2">
        <button
          onClick={goUp}
          className="rounded-full p-2 bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition"
        >
          <ChevronUp size={24} />
        </button>
        <button
          onClick={goDown}
          className="rounded-full p-2 bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition"
        >
          <ChevronDown size={24} />
        </button>
      </div>
      <div ref={feedRef} className="flex-1 overflow-hidden overscroll-none relative">
      {feedLoading ? (
        <div className="h-full flex flex-col items-center justify-center px-6 lg:px-0">
          <div className="flex items-center gap-3 lg:gap-4 mb-6 lg:mb-8">
            <SkeletonAvatar size={40} />
            <SkeletonBox className="h-4 lg:h-5 w-28 lg:w-32" />
          </div>
          <SkeletonBox className="w-full max-w-md lg:max-w-xl h-40 lg:h-48 mb-6 lg:mb-8" />
          <div className="flex items-center gap-3 lg:gap-4">
            <SkeletonBox className="h-10 lg:h-12 w-28 lg:w-32 rounded-xl" />
            {feedMode === 'all' && <SkeletonBox className="h-10 lg:h-12 w-36 lg:w-44 rounded-xl" />}
          </div>
        </div>
      ) : renderPosts.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <p className="text-zinc-500">
            {feedMode === 'friends' ? 'No hay posteos de amigos aún' : 'No hay posteos aún'}
          </p>
        </div>
      ) : (
        <div
          className="h-full will-change-transform"
          style={{
            transform: `translateY(-${feedIndex * 100}%)`,
            transition: skipTransition ? 'none' : `transform ${TRANSITION_MS}ms ease-out`,
          }}
        >
          {renderPosts.map((post, i) => (
            <div key={`${post.id}-${i}`} className="h-full flex flex-col items-center justify-center px-6 lg:px-0">
              <button onClick={() => navigate('/' + post.username)} className="flex items-center gap-3 mb-6 lg:mb-8 hover:opacity-80 transition">
                <Avatar src={post.avatar_url} size={40} />
                <span className="text-zinc-100 font-medium text-sm lg:text-base">{post.display_name || post.username}</span>
              </button>
              <div className="w-full max-w-md lg:max-w-xl bg-zinc-900 lg:bg-zinc-900/90 border border-zinc-800 rounded-xl p-6 lg:p-8 mb-6 lg:mb-8 lg:shadow-xl lg:shadow-black/25 lg:backdrop-blur-sm lg:border-zinc-700/50">
                <p className="text-zinc-100 text-lg lg:text-xl leading-relaxed lg:leading-relaxed whitespace-pre-wrap break-words lg:tracking-wide">{post.content}</p>
              </div>
              <div className="flex items-center gap-3 lg:gap-4">
                <button
                  onClick={() => handleFeedLike(post.id)}
                  className="flex items-center gap-2 px-5 py-2.5 lg:px-6 lg:py-3 rounded-xl transition hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                >
                  <Heart
                    size={20}
                    strokeWidth={2.5}
                    className={post.liked_by_me ? 'text-white fill-white' : 'text-white'}
                  />
                  <span className="text-sm lg:text-base font-medium text-white">
                    {post.likes_count}
                  </span>
                </button>
                {feedMode === 'all' && (() => {
                  if (post.friend_request_status === 'pending') {
                    return (
                      <span
                        className="rounded-xl px-4 py-2.5 lg:px-6 lg:py-3 text-sm lg:text-base text-white opacity-60"
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
                        className="rounded-xl px-4 py-2.5 lg:px-6 lg:py-3 text-sm lg:text-base text-white transition hover:opacity-90 disabled:opacity-50"
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
          {loadingSlot && (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 lg:px-0">
              {isFetchingNextPage ? (
                <>
                  <Loader2 size={20} className="animate-spin text-zinc-400" />
                  <span className="text-zinc-400 text-sm">Cargando más...</span>
                </>
              ) : (
                <span className="text-zinc-500 text-sm">Desliza para cargar más</span>
              )}
            </div>
          )}
          {showEndCard && (
            <div className="h-full flex items-center justify-center px-6 lg:px-0">
              <p className="text-zinc-500 text-center text-sm lg:text-base max-w-xs">
                Ya viste todas las publicaciones actuales de tus amigos.
              </p>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  )
}