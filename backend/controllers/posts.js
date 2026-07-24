import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize, escapeILike } from '../lib/utils.js'
import { resolveTagNames, syncPostTags } from '../lib/tags.js'
import { getIO } from '../src/socket.js'

const pendingLikeToggles = new Map()

export const create = asyncHandler(async (req, res) => {
  const { content, tag_ids, tag_names } = req.body
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'El contenido es requerido' })
  }

  const sanitized = sanitize(content.trim()).slice(0, 300)

  const { data: existing } = await supabase
    .from('posts')
    .select('id')
    .eq('user_id', req.user.id)
    .maybeSingle()

  const tagsProvided = Array.isArray(tag_names) || Array.isArray(tag_ids)

  let finalTagIds = []
  if (Array.isArray(tag_names)) {
    finalTagIds = await resolveTagNames(req, tag_names)
  } else if (Array.isArray(tag_ids)) {
    finalTagIds = tag_ids
  }

  if (existing) {
    const { data: post, error } = await supabase
      .from('posts')
      .update({ content: sanitized, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: 'Error al actualizar post' })

    await supabase.from('post_likes').delete().eq('post_id', existing.id)

    if (tagsProvided) await syncPostTags(existing.id, finalTagIds)

    return res.json({ post, likesReset: true })
  }

  const { data: post, error } = await supabase
    .from('posts')
    .insert({ user_id: req.user.id, content: sanitized })
    .select()
    .single()

  if (error) return res.status(500).json({ error: 'Error al crear post' })

  if (tagsProvided) await syncPostTags(post.id, finalTagIds)

  res.status(201).json({ post })
})

export const remove = asyncHandler(async (req, res) => {
  const { data: existing, error: findError } = await supabase
    .from('posts')
    .select('id')
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (findError) return res.status(500).json({ error: 'Error al buscar post' })
  if (!existing) return res.status(404).json({ error: 'No tenés un post para eliminar' })

  const { error } = await supabase.from('posts').delete().eq('id', existing.id)
  if (error) return res.status(500).json({ error: 'Error al eliminar post' })

  res.json({ deleted: true })
})

export const getMine = asyncHandler(async (req, res) => {
  const { data: post, error } = await supabase
    .from('posts')
    .select('*, post_likes(count)')
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: 'Error al obtener post' })

  let tags = []
  if (post) {
    const { data: postTags } = await supabase
      .from('post_tags')
      .select('tag_id, tags(id, name)')
      .eq('post_id', post.id)
    tags = (postTags || []).map(pt => pt.tags)
  }

  res.json({ post: post ? { ...post, tags } : null })
})

export const feed = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20))

  const { data: userPrefs, error: prefsError } = await supabase
    .from('user_tag_preferences')
    .select('tag_id')
    .eq('user_id', req.user.id)

  if (prefsError) console.error('Error fetching preferences:', prefsError)

  const preferredTagIds = new Set((userPrefs || []).map(p => p.tag_id))

  const { data: sentFriends } = await supabase
    .from('friend_requests')
    .select('receiver_id')
    .eq('sender_id', req.user.id)
    .eq('status', 'accepted')

  const { data: receivedFriends } = await supabase
    .from('friend_requests')
    .select('sender_id')
    .eq('receiver_id', req.user.id)
    .eq('status', 'accepted')

  const friendIds = []
  if (sentFriends) friendIds.push(...sentFriends.map(r => r.receiver_id))
  if (receivedFriends) friendIds.push(...receivedFriends.map(r => r.sender_id))

  let query = supabase
    .from('posts')
    .select(`
      id,
      content,
      created_at,
      updated_at,
      user_id,
      post_likes(count)
    `)
    .neq('user_id', req.user.id)

  if (friendIds.length > 0) {
    query = query.not('user_id', 'in', `(${friendIds.map(id => `"${id}"`).join(',')})`)
  }

  const { data: posts, error } = await query

  if (error) return res.status(500).json({ error: 'Error al obtener feed' })

  if (!posts || posts.length === 0) {
    return res.json({ posts: [], total: 0, page, limit, hasMore: false })
  }

  const userIds = [...new Set(posts.map(p => p.user_id))]
  const postIds = posts.map(p => p.id)

  const [profilesRes, myLikesRes, sentRequestsRes, receivedRequestsRes, postTagsRes] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds),
    supabase.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', req.user.id),
    supabase.from('friend_requests').select('receiver_id, status').eq('sender_id', req.user.id).in('receiver_id', userIds),
    supabase.from('friend_requests').select('sender_id, status').eq('receiver_id', req.user.id).in('sender_id', userIds),
    supabase.from('post_tags').select('post_id, tag_id, tags(id, name)').in('post_id', postIds),
  ])

  const profileMap = {}
  if (profilesRes.data) profilesRes.data.forEach(pr => { profileMap[pr.id] = pr })

  const likedPostIds = new Set(myLikesRes.data?.map(l => l.post_id) || [])

  const friendRequestMap = {}
  if (sentRequestsRes.data) {
    sentRequestsRes.data.forEach(r => { friendRequestMap[r.receiver_id] = r.status })
  }
  if (receivedRequestsRes.data) {
    receivedRequestsRes.data.forEach(r => {
      if (!friendRequestMap[r.sender_id]) {
        friendRequestMap[r.sender_id] = r.status
      }
    })
  }

  const tagsByPost = {}
  if (postTagsRes.data) {
    postTagsRes.data.forEach(pt => {
      if (!tagsByPost[pt.post_id]) tagsByPost[pt.post_id] = []
      tagsByPost[pt.post_id].push(pt.tags)
    })
  }

  const preferredPostIds = new Set()
  if (preferredTagIds.size > 0) {
    for (const [postId, postTags] of Object.entries(tagsByPost)) {
      if (postTags.some(t => preferredTagIds.has(t.id))) {
        preferredPostIds.add(postId)
      }
    }
  }

  const now = Date.now()

  const scored = posts
    .map(p => {
      const hoursSincePost = (now - new Date(p.created_at).getTime()) / 3600000
      const recencyScore = 1 / Math.pow(hoursSincePost + 2, 0.5)
      const likesCount = p.post_likes?.[0]?.count ?? 0
      const popularityScore = Math.log(likesCount + 1)

      let socialScore = 0

      const preferenceScore = preferredPostIds.has(p.id) ? 5 : 0

      const totalScore = recencyScore * 2 + popularityScore * 1 + preferenceScore

      return {
        id: p.id,
        content: p.content,
        created_at: p.created_at,
        user_id: p.user_id,
        username: profileMap[p.user_id]?.username || 'unknown',
        display_name: profileMap[p.user_id]?.display_name || null,
        avatar_url: profileMap[p.user_id]?.avatar_url || null,
        likes_count: likesCount,
        liked_by_me: likedPostIds.has(p.id),
        friend_request_status: friendRequestMap[p.user_id] || null,
        tags: tagsByPost[p.id] || [],
        _score: totalScore,
      }
    })
    .filter(p => p.username !== 'unknown')
    .sort((a, b) => b._score - a._score || new Date(b.created_at) - new Date(a.created_at))

  const total = scored.length
  const offset = (page - 1) * limit
  const paginated = scored.slice(offset, offset + limit).map(p => {
    const { _score, ...rest } = p
    return rest
  })

  res.json({ posts: paginated, total, page, limit, hasMore: offset + limit < total })
})

export const friendsFeed = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20))

  const { data: sent } = await supabase
    .from('friend_requests')
    .select('receiver_id')
    .eq('sender_id', req.user.id)
    .eq('status', 'accepted')

  const { data: received } = await supabase
    .from('friend_requests')
    .select('sender_id')
    .eq('receiver_id', req.user.id)
    .eq('status', 'accepted')

  const friendIds = []
  if (sent) friendIds.push(...sent.map(r => r.receiver_id))
  if (received) friendIds.push(...received.map(r => r.sender_id))

  if (friendIds.length === 0) {
    return res.json({ posts: [], total: 0, page, limit, hasMore: false })
  }

  let query = supabase
    .from('posts')
    .select(`
      id,
      content,
      created_at,
      updated_at,
      user_id,
      post_likes(count)
    `)
    .in('user_id', friendIds)

  const { data: posts, error } = await query

  if (error) return res.status(500).json({ error: 'Error al obtener feed de amigos' })

  if (!posts || posts.length === 0) {
    return res.json({ posts: [], total: 0, page, limit, hasMore: false })
  }

  const userIds = [...new Set(posts.map(p => p.user_id))]
  const postIds = posts.map(p => p.id)

  const [profilesRes, myLikesRes, postTagsRes] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds),
    supabase.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', req.user.id),
    supabase.from('post_tags').select('post_id, tag_id, tags(id, name)').in('post_id', postIds),
  ])

  const profileMap = {}
  if (profilesRes.data) profilesRes.data.forEach(pr => { profileMap[pr.id] = pr })

  const likedPostIds = new Set(myLikesRes.data?.map(l => l.post_id) || [])

  const tagsByPost = {}
  if (postTagsRes.data) {
    postTagsRes.data.forEach(pt => {
      if (!tagsByPost[pt.post_id]) tagsByPost[pt.post_id] = []
      tagsByPost[pt.post_id].push(pt.tags)
    })
  }

  const result = posts
    .map(p => {
      const likesCount = p.post_likes?.[0]?.count ?? 0
      return {
        id: p.id,
        content: p.content,
        created_at: p.created_at,
        user_id: p.user_id,
        username: profileMap[p.user_id]?.username || 'unknown',
        display_name: profileMap[p.user_id]?.display_name || null,
        avatar_url: profileMap[p.user_id]?.avatar_url || null,
        likes_count: likesCount,
        liked_by_me: likedPostIds.has(p.id),
        friend_request_status: 'accepted',
        tags: tagsByPost[p.id] || [],
      }
    })
    .filter(p => p.username !== 'unknown')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const total = result.length
  const offset = (page - 1) * limit
  const paginated = result.slice(offset, offset + limit)

  res.json({ posts: paginated, total, page, limit, hasMore: offset + limit < total })
})

export const like = asyncHandler(async (req, res) => {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, user_id')
    .eq('id', req.params.id)
    .maybeSingle()

  if (postError) return res.status(500).json({ error: 'Error al verificar post' })
  if (!post) return res.status(404).json({ error: 'Post no encontrado' })
  if (post.user_id === req.user.id) {
    return res.status(400).json({ error: 'No podés dar like a tu propio post' })
  }

  const key = `${req.user.id}:${req.params.id}`
  if (pendingLikeToggles.has(key)) {
    clearTimeout(pendingLikeToggles.get(key).timer)
  }

  const timer = setTimeout(async () => {
    pendingLikeToggles.delete(key)
    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: post.id, user_id: req.user.id })
    if (error && error.code !== '23505') {
      console.error('Error al dar like:', error)
      return
    }

    const { data: existingNotif } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', post.user_id)
      .eq('from_user_id', req.user.id)
      .eq('type', 'like')
      .maybeSingle()

    if (!existingNotif) {
      const { data: inserted } = await supabase
        .from('notifications')
        .insert({ user_id: post.user_id, from_user_id: req.user.id, type: 'like' })
        .select()
        .single()

      if (inserted) {
        const { data: fromProfile } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', req.user.id)
          .maybeSingle()

        const io = getIO()
        if (io) {
          io.to(post.user_id).emit('notification', {
            notification: {
              id: inserted.id,
              type: 'like',
              read: false,
              createdAt: inserted.created_at,
              isFollowingBack: false,
              fromUser: {
                id: req.user.id,
                username: sanitize(fromProfile?.display_name || fromProfile?.username || 'Desconocido'),
                avatar_url: fromProfile?.avatar_url || null,
              },
            },
          })
        }
      }
    }
  }, 2000)

  pendingLikeToggles.set(key, { timer })

  const { count } = await supabase
    .from('post_likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', post.id)

  res.status(201).json({ liked: true, likesCount: count })
})

export const unlike = asyncHandler(async (req, res) => {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id')
    .eq('id', req.params.id)
    .maybeSingle()

  if (postError) return res.status(500).json({ error: 'Error al verificar post' })
  if (!post) return res.status(404).json({ error: 'Post no encontrado' })

  const key = `${req.user.id}:${req.params.id}`
  if (pendingLikeToggles.has(key)) {
    clearTimeout(pendingLikeToggles.get(key).timer)
  }

  const timer = setTimeout(async () => {
    pendingLikeToggles.delete(key)
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', post.id)
      .eq('user_id', req.user.id)
    if (error) console.error('Error al quitar like:', error)
  }, 2000)

  pendingLikeToggles.set(key, { timer })

  const { count } = await supabase
    .from('post_likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', post.id)

  res.json({ unliked: true, likesCount: count })
})

export const getUserPosts = asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', escapeILike(sanitized.toLowerCase()))
    .maybeSingle()

  if (!profile) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const { data: post, error } = await supabase
    .from('posts')
    .select('*, post_likes(count)')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: 'Error al obtener post' })

  if (!post) {
    return res.json({ post: null })
  }

  const likesCount = post.post_likes?.[0]?.count ?? 0

  let likedByMe = false
  let friendRequestStatus = null

  if (req.user.id !== profile.id) {
    const { count: likeCount } = await supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .eq('user_id', req.user.id)

    likedByMe = (likeCount || 0) > 0

    const { data: friendReq } = await supabase
      .from('friend_requests')
      .select('status')
      .or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${req.user.id})`)
      .maybeSingle()

    friendRequestStatus = friendReq?.status || null
  }

  res.json({
    post: {
      id: post.id,
      content: post.content,
      created_at: post.created_at,
      updated_at: post.updated_at,
      user_id: post.user_id,
      likes_count: likesCount,
      liked_by_me: likedByMe,
      friend_request_status: friendRequestStatus,
    },
  })
})

export const getById = asyncHandler(async (req, res) => {
  const { data: post, error } = await supabase
    .from('posts')
    .select('*, post_likes(count)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: 'Error al obtener post' })
  if (!post) return res.status(404).json({ error: 'Post no encontrado' })

  res.json({ post })
})

export const getTags = asyncHandler(async (req, res) => {
  const { data: postTags, error } = await supabase
    .from('post_tags')
    .select('tag_id, tags(id, name)')
    .eq('post_id', req.params.id)

  if (error) return res.status(500).json({ error: 'Error al obtener tags del post' })

  res.json({ tags: (postTags || []).map(pt => pt.tags) })
})

export const updateTags = asyncHandler(async (req, res) => {
  const { tag_ids, tag_names } = req.body

  const { data: post } = await supabase
    .from('posts')
    .select('user_id')
    .eq('id', req.params.id)
    .maybeSingle()

  if (!post) return res.status(404).json({ error: 'Post no encontrado' })
  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: 'No podés editar tags de otro post' })
  }

  let finalIds
  if (Array.isArray(tag_names)) {
    finalIds = await resolveTagNames(req, tag_names)
  } else if (Array.isArray(tag_ids)) {
    finalIds = tag_ids
  } else {
    finalIds = []
  }

  await syncPostTags(req.params.id, finalIds)

  const { data: tags } = await supabase
    .from('post_tags')
    .select('tag_id, tags(id, name)')
    .eq('post_id', req.params.id)

  res.json({ tags: (tags || []).map(pt => pt.tags) })
})
