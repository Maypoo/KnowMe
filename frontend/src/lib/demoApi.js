import { loadDemoState, saveDemoState, nextDemoId } from './demoStore'

function ok(data) {
  return { ok: true, status: 200, json: async () => data }
}

function created(data) {
  return { ok: true, status: 201, json: async () => data }
}

function bad(status, error) {
  return { ok: false, status, json: async () => ({ error }) }
}

function parseBody(options) {
  try {
    if (!options || !options.body) return {}
    if (typeof options.body === 'string') return JSON.parse(options.body)
    return options.body || {}
  } catch {
    return {}
  }
}

function splitPath(path) {
  const q = path.indexOf('?')
  if (q === -1) return { base: path, query: new URLSearchParams() }
  return { base: path.slice(0, q), query: new URLSearchParams(path.slice(q + 1)) }
}

function findUser(state, username) {
  const norm = String(username || '').toLowerCase()
  if (state.profile.username.toLowerCase() === norm) {
    return { id: state.profile.id, username: state.profile.username, avatar_url: state.profile.avatar_url }
  }
  return state.users.find(u => u.username.toLowerCase() === norm) || null
}

function publicProfileFor(state, username) {
  const target = findUser(state, username)
  if (!target) return null
  const isOwn = target.id === state.profile.id
  const base = isOwn
    ? { ...state.profile }
    : {
        id: target.id,
        username: target.username,
        avatar_url: target.avatar_url,
        bio: target.bio || 'Usuario de prueba del demo.',
        birth_date: null,
        show_age: false,
        country: null,
        show_country: false,
        created_at: new Date(Date.now() - 200 * 86400000).toISOString(),
        follower_count: target.follower_count ?? 3,
        friend_count: target.friend_count ?? 2,
      }
  const isFriend = state.friends.some(f => f.id === target.id)
  const isPending = state.outgoing.some(r => r.receiver.id === target.id)
  return {
    ...base,
    is_following: isOwn ? false : isFriend,
    is_followed_by: isOwn ? false : isFriend,
    follower_count: base.follower_count ?? 0,
    friend_count: isOwn ? state.friends.length : (base.friend_count ?? 0),
    friend_request_status: isOwn ? null : isFriend ? 'accepted' : isPending ? 'pending' : null,
  }
}

function patchProfile(state, patch) {
  const p = state.profile
  if (patch.display_name !== undefined) {
    const raw = String(patch.display_name || '')
    const withAt = raw.startsWith('@') ? raw : '@' + raw.replace(/^@/, '')
    p.username = withAt.slice(0, 21)
  }
  if (patch.username !== undefined) {
    const raw = String(patch.username || '')
    const withAt = raw.startsWith('@') ? raw : '@' + raw.replace(/^@/, '')
    const old = p.username
    p.username = withAt.slice(0, 21)
    state.users = state.users.map(u => u.id === p.id ? { ...u, username: p.username } : u)
    state.feedPosts = state.feedPosts.map(fp => fp.username.toLowerCase() === String(old).toLowerCase() ? { ...fp, username: p.username, display_name: p.username } : fp)
  }
  if (patch.bio !== undefined) p.bio = String(patch.bio || '').slice(0, 100)
  if (patch.birth_date !== undefined) p.birth_date = patch.birth_date || null
  if (patch.show_age !== undefined) p.show_age = !!patch.show_age
  if (patch.country !== undefined) p.country = patch.country || null
  if (patch.show_country !== undefined) p.show_country = !!patch.show_country
  if (patch.show_activity !== undefined) p.show_activity = !!patch.show_activity
  return p
}

export function handleDemoRequest(path, options = {}) {
  const state = loadDemoState()
  const method = (options.method || 'GET').toUpperCase()
  const { base, query } = splitPath(path)
  const body = parseBody(options)
  const persist = () => saveDemoState(state)

  if (base === '/api/auth/me' && method === 'GET') {
    return ok({ profile: state.profile, limits: { remaining: 2, nextAvailable: null } })
  }
  if (base === '/api/auth/logout') return ok({})
  if (base === '/api/auth/delete-account') return ok({})
  if (base === '/api/auth/google') return ok({ needsUsername: false, user: { email: state.profile.email }, profile: state.profile })

  if (base === '/api/username/check' && method === 'GET') {
    const q = String(query.get('q') || '')
    if (!/^@(?=.*[a-zA-Z])[a-zA-Z0-9_.]+$/.test(q) || q.length < 2 || q.length > 21) {
      return ok({ available: false, error: 'Nombre inválido' })
    }
    const taken = state.users.some(u => u.username.toLowerCase() === q.toLowerCase() && u.id !== state.profile.id)
    if (taken) return ok({ available: false, error: 'No disponible' })
    return ok({ available: true })
  }

  if (base === '/api/profile' && method === 'PATCH') {
    const profile = patchProfile(state, body)
    persist()
    return ok({ profile, limits: { remaining: 2, nextAvailable: null } })
  }
  if (base === '/api/avatar' && method === 'POST') {
    const avatar = String(body.avatar || '')
    if (avatar.length > 700000) return bad(413, 'Imagen muy pesada para el demo')
    state.profile.avatar_url = avatar || null
    state.users = state.users.map(u => u.id === state.profile.id ? { ...u, avatar_url: state.profile.avatar_url } : u)
    persist()
    return ok({ profile: state.profile })
  }
  if (base.startsWith('/api/profile/') && method === 'GET') {
    const username = decodeURIComponent(base.slice('/api/profile/'.length))
    const pub = publicProfileFor(state, username)
    if (!pub) return bad(404, 'Usuario no encontrado')
    const blocked = state.blocked.some(u => u.username.toLowerCase() === String(username).toLowerCase())
    if (blocked) return ok({ blocked: true, blockedByMe: true })
    return ok({ profile: pub })
  }

  if (base === '/api/tags' && method === 'GET') return ok({ tags: state.tags })
  if (base === '/api/tags/resolve' && method === 'POST') {
    const names = Array.isArray(body.tag_names) ? body.tag_names : []
    const ids = names.map(n => {
      const found = state.tags.find(t => t.name.toLowerCase() === String(n).toLowerCase())
      if (found) return found.id
      const id = Math.max(0, ...state.tags.map(t => t.id)) + 1
      state.tags.push({ id, name: String(n) })
      return id
    })
    persist()
    return ok({ tag_ids: ids })
  }
  if (base === '/api/preferences/tags' && method === 'GET') return ok({ tag_ids: state.prefTagIds })
  if (base === '/api/preferences/tags' && method === 'PUT') {
    state.prefTagIds = Array.isArray(body.tag_ids) ? body.tag_ids : []
    persist()
    return ok({})
  }

  if (base === '/api/posts/mine' && method === 'GET') return ok({ post: state.myPost })
  if (base === '/api/posts' && method === 'POST') {
    const content = String(body.content || '').trim()
    if (!content) return bad(400, 'Contenido vacío')
    const tagNames = Array.isArray(body.tag_names) ? body.tag_names : []
    const post = {
      id: nextDemoId(state, 'demo-mypost'),
      content: content.slice(0, 500),
      tags: tagNames.map(name => ({ name: String(name) })),
      post_likes: [{ count: 0 }],
    }
    state.myPost = post
    state.feedPosts.unshift({
      id: post.id,
      content: post.content,
      username: state.profile.username,
      display_name: state.profile.username,
      avatar_url: state.profile.avatar_url,
      likes_count: 0,
      liked_by_me: false,
      friend_request_status: null,
      created_at: new Date().toISOString(),
    })
    persist()
    return created({ post })
  }
  if (base === '/api/posts' && method === 'DELETE') {
    const id = state.myPost?.id
    state.myPost = null
    if (id) state.feedPosts = state.feedPosts.filter(p => p.id !== id)
    persist()
    return ok({ deleted: true })
  }
  const putTagsMatch = base.match(/^\/api\/posts\/([^/]+)\/tags$/)
  if (putTagsMatch && method === 'PUT') {
    const tagNames = Array.isArray(body.tag_names) ? body.tag_names : []
    if (state.myPost && state.myPost.id === putTagsMatch[1]) {
      state.myPost.tags = tagNames.map(name => ({ name: String(name) }))
      persist()
    }
    return ok({})
  }
  if ((base === '/api/posts/feed' || base === '/api/posts/friends-feed') && method === 'GET') {
    const page = parseInt(query.get('page') || '1', 10)
    const limit = parseInt(query.get('limit') || '20', 10)
    let posts = state.feedPosts
    if (base === '/api/posts/friends-feed') {
      const friendNames = new Set(state.friends.map(f => f.username.toLowerCase()))
      posts = posts.filter(p => friendNames.has(p.username.toLowerCase()) || p.username.toLowerCase() === state.profile.username.toLowerCase())
    } else {
      const preferred = new Set(state.prefTagIds || [])
      const now = Date.now()
      posts = [...posts]
        .map(p => {
          const hours = (now - new Date(p.created_at).getTime()) / 3600000
          const recency = 1 / Math.pow(hours + 2, 0.5)
          const popularity = Math.log((p.likes_count || 0) + 1)
          const match = (p.tags || []).some(t => preferred.has(t.id)) ? 5 : 0
          return { p, score: recency * 2 + popularity + match }
        })
        .sort((a, b) => b.score - a.score || new Date(b.p.created_at) - new Date(a.p.created_at))
        .map(x => x.p)
    }
    const start = (page - 1) * limit
    return ok({ posts: posts.slice(start, start + limit), hasMore: start + limit < posts.length, page })
  }
  const likeMatch = base.match(/^\/api\/posts\/([^/]+)\/(like|unlike)$/)
  if (likeMatch && method === 'POST') {
    const post = state.feedPosts.find(p => p.id === likeMatch[1])
    if (post) {
      const like = likeMatch[2] === 'like'
      post.liked_by_me = like
      post.likes_count = Math.max(0, post.likes_count + (like ? 1 : -1))
      persist()
    }
    return ok({})
  }
  const userPostMatch = base.match(/^\/api\/posts\/user\/(.+)$/)
  if (userPostMatch && method === 'GET' && !base.endsWith('/likes')) {
    const username = decodeURIComponent(userPostMatch[1])
    if (username.toLowerCase() === state.profile.username.toLowerCase() && state.myPost) {
      return ok({ post: { id: state.myPost.id, content: state.myPost.content, likes_count: state.myPost.post_likes?.[0]?.count ?? 0, liked_by_me: false } })
    }
    const found = state.feedPosts.find(p => p.username.toLowerCase() === String(username).toLowerCase())
    if (!found) return ok({ post: null })
    return ok({ post: { id: found.id, content: found.content, likes_count: found.likes_count, liked_by_me: found.liked_by_me } })
  }
  const likesMatch = base.match(/^\/api\/posts\/([^/]+)\/likes$/)
  if (likesMatch && method === 'GET') {
    const likers = state.users.filter(u => u.id !== state.profile.id).slice(0, 3)
    return ok({ likes: likers.map(u => ({ id: u.id, username: u.username, avatar_url: u.avatar_url })) })
  }

  if (base === '/api/friends' && method === 'GET') return ok({ friends: state.friends })
  if (base === '/api/friends/requests' && method === 'GET') return ok({ requests: state.incoming })
  if (base === '/api/friends/pending' && method === 'GET') return ok({ requests: state.outgoing })
  if (base === '/api/friends/requests/count' && method === 'GET') return ok({ count: state.incoming.length })
  if (base === '/api/friends/request' && method === 'POST') {
    const username = String(body.username || '')
    const target = findUser(state, username)
    if (!target) return bad(404, 'Usuario no encontrado')
    if (target.id === state.profile.id) return bad(400, 'No podés agregarte a vos mismo')
    if (state.friends.some(f => f.id === target.id)) return bad(400, 'Ya son amigos')
    if (state.outgoing.some(r => r.receiver.id === target.id)) return bad(400, 'Ya hay una solicitud pendiente')
    state.outgoing.push({ id: nextDemoId(state, 'demo-pen'), receiver: { id: target.id, username: target.username, avatar_url: target.avatar_url } })
    state.feedPosts = state.feedPosts.map(p => p.username.toLowerCase() === target.username.toLowerCase() ? { ...p, friend_request_status: 'pending' } : p)
    persist()
    return ok({})
  }
  if (base === '/api/friends/respond' && method === 'POST') {
    const req = state.incoming.find(r => r.id === body.requestId)
    if (!req) return bad(404, 'Solicitud no encontrada')
    state.incoming = state.incoming.filter(r => r.id !== body.requestId)
    if (body.action === 'accepted') {
      state.friends.push({ id: req.sender.id, username: req.sender.username, avatar_url: req.sender.avatar_url, last_seen_at: new Date().toISOString() })
      const u = findUser(state, req.sender.username)
      if (u && !state.users.some(x => x.id === u.id)) state.users.push(u)
    }
    persist()
    return ok({})
  }
  const cancelReqMatch = base.match(/^\/api\/friends\/request\/([^/]+)$/)
  if (cancelReqMatch && method === 'DELETE') {
    state.outgoing = state.outgoing.filter(r => r.id !== cancelReqMatch[1])
    persist()
    return ok({})
  }
  const delFriendMatch = base.match(/^\/api\/friends\/([^/]+)$/)
  if (delFriendMatch && method === 'DELETE') {
    state.friends = state.friends.filter(f => f.id !== delFriendMatch[1])
    persist()
    return ok({})
  }
  const friendsOfMatch = base.match(/^\/api\/friends\/(@.+)$/)
  if (friendsOfMatch && method === 'GET') {
    return ok({ friends: state.friends })
  }

  if (base === '/api/blocks' && method === 'GET') return ok({ users: state.blocked })
  const blockMatch = base.match(/^\/api\/blocks\/(.+)$/)
  if (blockMatch && (method === 'POST' || method === 'DELETE')) {
    const username = decodeURIComponent(blockMatch[1])
    if (method === 'POST') {
      const target = findUser(state, username)
      if (target && !state.blocked.some(u => u.id === target.id)) {
        state.blocked.push({ id: target.id, username: target.username, display_name: target.username, avatar_url: target.avatar_url })
      }
    } else {
      state.blocked = state.blocked.filter(u => u.username.toLowerCase() !== String(username).toLowerCase())
    }
    persist()
    return ok({})
  }

  if (base === '/api/users/search' && method === 'GET') {
    const q = String(query.get('q') || '').toLowerCase()
    const users = state.users
      .filter(u => u.id !== state.profile.id && u.username.toLowerCase().includes(q))
      .slice(0, 10)
      .map(u => ({ id: u.id, username: u.username, avatar_url: u.avatar_url }))
    return ok({ users })
  }

  if (base.startsWith('/api/follow/')) return ok({})
  const followersMatch = base.match(/^\/api\/followers\/(.+)$/)
  if (followersMatch && method === 'GET') {
    return ok({ followers: state.friends.map(f => ({ id: f.id, username: f.username, avatar_url: f.avatar_url })) })
  }
  const friendsModalMatch = base.match(/^\/api\/friends\/(@.+)$/)
  if (friendsModalMatch && method === 'GET') {
    return ok({ friends: state.friends })
  }

  if (base === '/api/chats' && method === 'GET') return ok({ chats: state.chats })
  if (base === '/api/chats' && method === 'POST') {
    const target = state.users.find(u => u.id === body.userId)
    if (!target) return bad(404, 'Usuario no encontrado')
    let chat = state.chats.find(c => !c.isGroup && c.otherUser?.id === target.id)
    if (!chat) {
      chat = {
        id: nextDemoId(state, 'demo-chat'),
        isGroup: false,
        otherUser: { id: target.id, username: target.username, avatar_url: target.avatar_url, last_seen_at: new Date().toISOString() },
        lastMessage: null,
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
      }
      state.chats.unshift(chat)
      state.messagesByChat[chat.id] = { isGroup: false, isFriend: true, pendingRequest: false, isAdmin: false, name: null, icon_url: null, participants: [], blockedByMe: [], messages: [] }
      persist()
    }
    return ok({ chat })
  }
  if (base === '/api/chats/unread/total' && method === 'GET') {
    return ok({ total: state.chats.reduce((s, c) => s + (c.unreadCount || 0), 0) })
  }
  if (base === '/api/chats/group' && method === 'POST') {
    const ids = Array.isArray(body.userIds) ? body.userIds : []
    const members = state.friends.filter(f => ids.includes(f.id))
    const chat = {
      id: nextDemoId(state, 'demo-chat'),
      isGroup: true,
      name: body.name || null,
      icon_url: body.icon || null,
      memberCount: members.length + 1,
      lastMessage: null,
      unreadCount: 0,
      updatedAt: new Date().toISOString(),
    }
    state.chats.unshift(chat)
    state.messagesByChat[chat.id] = {
      isGroup: true,
      isFriend: true,
      pendingRequest: false,
      isAdmin: true,
      name: chat.name,
      icon_url: chat.icon_url,
      participants: [{ id: state.profile.id, username: state.profile.username, avatar_url: state.profile.avatar_url, is_admin: true }, ...members.map(m => ({ ...m, is_admin: false }))],
      blockedByMe: [],
      messages: [],
    }
    persist()
    return ok({ chat })
  }
  const chatMsgsMatch = base.match(/^\/api\/chats\/([^/]+)\/messages$/)
  if (chatMsgsMatch && method === 'GET') {
    const entry = state.messagesByChat[chatMsgsMatch[1]]
    if (!entry) return bad(404, 'Chat no encontrado')
    return ok({ messages: entry.messages, participants: entry.participants, isGroup: entry.isGroup, name: entry.name, icon_url: entry.icon_url, blockedByMe: entry.blockedByMe, isFriend: entry.isFriend, pendingRequest: entry.pendingRequest, isAdmin: entry.isAdmin })
  }
  if (chatMsgsMatch && method === 'POST') {
    const entry = state.messagesByChat[chatMsgsMatch[1]]
    if (!entry) return bad(404, 'Chat no encontrado')
    const content = String(body.content || '').trim().slice(0, 300)
    if (!content) return bad(400, 'Mensaje vacío')
    const message = { id: nextDemoId(state, 'demo-m'), sender_id: state.profile.id, content, created_at: new Date().toISOString(), edited_at: null, deleted: false, type: 'text', sender: { username: state.profile.username, avatar_url: state.profile.avatar_url } }
    entry.messages.push(message)
    const chat = state.chats.find(c => c.id === chatMsgsMatch[1])
    if (chat) {
      chat.lastMessage = { content, created_at: message.created_at, sender_id: state.profile.id, sender_name: state.profile.username, type: 'text' }
      chat.updatedAt = message.created_at
      chat.unreadCount = 0
    }
    persist()
    return created({ message })
  }
  const editMsgMatch = base.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/)
  if (editMsgMatch && method === 'PATCH') {
    const entry = state.messagesByChat[editMsgMatch[1]]
    const msg = entry?.messages.find(m => m.id === editMsgMatch[2])
    if (!msg) return bad(404, 'Mensaje no encontrado')
    msg.content = String(body.content || '').trim().slice(0, 300)
    msg.edited_at = new Date().toISOString()
    persist()
    return ok({ message: msg })
  }
  if (editMsgMatch && method === 'DELETE') {
    const entry = state.messagesByChat[editMsgMatch[1]]
    const msg = entry?.messages.find(m => m.id === editMsgMatch[2])
    if (!msg) return bad(404, 'Mensaje no encontrado')
    msg.deleted = true
    persist()
    return ok({})
  }
  const readMatch = base.match(/^\/api\/chats\/([^/]+)\/read$/)
  if (readMatch && method === 'POST') {
    const chat = state.chats.find(c => c.id === readMatch[1])
    if (chat) {
      chat.unreadCount = 0
      persist()
    }
    return ok({})
  }
  const patchChatMatch = base.match(/^\/api\/chats\/([^/]+)$/)
  if (patchChatMatch && method === 'PATCH') {
    const entry = state.messagesByChat[patchChatMatch[1]]
    const chat = state.chats.find(c => c.id === patchChatMatch[1])
    if (body.name !== undefined && entry) entry.name = body.name
    if (body.icon !== undefined && entry) entry.icon_url = body.icon
    if (chat) {
      if (body.name !== undefined) chat.name = body.name
      if (body.icon !== undefined) chat.icon_url = body.icon
    }
    persist()
    return ok({})
  }
  const membersMatch = base.match(/^\/api\/chats\/([^/]+)\/members$/)
  if (membersMatch && method === 'POST') {
    const entry = state.messagesByChat[membersMatch[1]]
    const chat = state.chats.find(c => c.id === membersMatch[1])
    const ids = Array.isArray(body.userIds) ? body.userIds : []
    const toAdd = state.friends.filter(f => ids.includes(f.id) && !entry?.participants.some(p => p.id === f.id))
    if (entry) entry.participants.push(...toAdd.map(m => ({ ...m, is_admin: false })))
    if (chat) chat.memberCount = (chat.memberCount || 0) + toAdd.length
    persist()
    return ok({})
  }
  const adminsMatch = base.match(/^\/api\/chats\/([^/]+)\/admins$/)
  if (adminsMatch && method === 'POST') {
    const entry = state.messagesByChat[adminsMatch[1]]
    const p = entry?.participants.find(x => x.id === body.userId)
    if (p) p.is_admin = true
    persist()
    return ok({})
  }
  const leaveMatch = base.match(/^\/api\/chats\/([^/]+)\/leave$/)
  if (leaveMatch && method === 'DELETE') {
    state.chats = state.chats.filter(c => c.id !== leaveMatch[1])
    delete state.messagesByChat[leaveMatch[1]]
    persist()
    return ok({})
  }

  if (base === '/api/notifications' && method === 'GET') return ok({ notifications: state.notifications })
  if (base === '/api/notifications/unread/count' && method === 'GET') return ok({ count: state.notifications.length })
  if (base === '/api/notifications/read' && method === 'POST') return ok({})
  if (base === '/api/notifications' && method === 'DELETE') {
    state.notifications = []
    persist()
    return ok({})
  }

  if (base === '/api/calls/offer' && method === 'POST') return bad(409, 'Usuario no disponible en el demo')
  if (base === '/api/calls/answer' && method === 'POST') return bad(404, 'Llamada no disponible en el demo')
  if (base === '/api/calls/end' && method === 'POST') return ok({})

  return bad(404, 'No disponible en el demo')
}
