import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize, escapeILike } from '../lib/utils.js'
import { getBlockRowsForUser, getBlockStatus } from '../lib/blocks.js'
import { getIO } from '../src/socket.js'

const pendingFollowToggles = new Map()

export const follow = asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', escapeILike(sanitized.toLowerCase()))
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'No podés seguirte a vos mismo' })
  }

  const blockStatus = await getBlockStatus(req.user.id, target.id)
  if (blockStatus.blockedByMe || blockStatus.blockedByThem) {
    return res.status(403).json({ error: 'No podés seguir a este usuario' })
  }

  const key = `follow:${req.user.id}:${target.id}`
  if (pendingFollowToggles.has(key)) {
    clearTimeout(pendingFollowToggles.get(key).timer)
  }

  const timer = setTimeout(async () => {
    pendingFollowToggles.delete(key)

    const { error: insertError } = await supabase
      .from('followers')
      .insert({ follower_id: req.user.id, following_id: target.id })

    if (insertError) {
      if (insertError.code !== '23505') {
        console.error('Error al seguir:', insertError)
      }
      return
    }

    const { data: existingUnfollow } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', target.id)
      .eq('from_user_id', req.user.id)
      .eq('type', 'unfollow')
      .maybeSingle()

    let notif

    if (existingUnfollow) {
      const { data: updated } = await supabase
        .from('notifications')
        .update({ type: 'follow', created_at: new Date().toISOString(), read: false })
        .eq('id', existingUnfollow.id)
        .select()
        .single()

      notif = updated
    } else {
      const { data: existingFollow } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', target.id)
        .eq('from_user_id', req.user.id)
        .eq('type', 'follow')
        .maybeSingle()

      if (!existingFollow) {
        const { data: inserted } = await supabase
          .from('notifications')
          .insert({ user_id: target.id, from_user_id: req.user.id, type: 'follow' })
          .select()
          .single()

        notif = inserted
      }
    }

    if (notif) {
      const [{ data: fromProfile }, { data: isFollowingBackRow }] = await Promise.all([
        supabase.from('profiles').select('username, display_name, avatar_url').eq('id', req.user.id).maybeSingle(),
        supabase.from('followers').select('id').eq('follower_id', target.id).eq('following_id', req.user.id).maybeSingle(),
      ])

      const io = getIO()
      if (io) {
        io.to(target.id).emit('notification', {
          notification: {
            id: notif.id,
            type: 'follow',
            read: false,
            createdAt: notif.created_at,
            isFollowingBack: !!isFollowingBackRow,
            fromUser: {
              id: req.user.id,
              username: sanitize(fromProfile?.display_name || fromProfile?.username || 'Desconocido'),
              avatar_url: fromProfile?.avatar_url || null,
            },
          },
        })
      }
    }
  }, 2000)

  pendingFollowToggles.set(key, { timer })
  res.json({ message: 'Usuario seguido' })
})

export const unfollow = asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', escapeILike(sanitized.toLowerCase()))
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const key = `follow:${req.user.id}:${target.id}`
  if (pendingFollowToggles.has(key)) {
    clearTimeout(pendingFollowToggles.get(key).timer)
  }

  const timer = setTimeout(async () => {
    pendingFollowToggles.delete(key)

    const { error: deleteError } = await supabase
      .from('followers')
      .delete()
      .eq('follower_id', req.user.id)
      .eq('following_id', target.id)

    if (deleteError) {
      console.error('Error al dejar de seguir:', deleteError)
      return
    }

    const { data: existingFollow } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', target.id)
      .eq('from_user_id', req.user.id)
      .eq('type', 'follow')
      .maybeSingle()

    let notif

    if (existingFollow) {
      const { data: updated } = await supabase
        .from('notifications')
        .update({ type: 'unfollow', created_at: new Date().toISOString(), read: false })
        .eq('id', existingFollow.id)
        .select()
        .single()

      notif = updated
    } else {
      const { data: existingUnfollow } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', target.id)
        .eq('from_user_id', req.user.id)
        .eq('type', 'unfollow')
        .maybeSingle()

      if (existingUnfollow) {
        const { data: updated } = await supabase
          .from('notifications')
          .update({ created_at: new Date().toISOString(), read: false })
          .eq('id', existingUnfollow.id)
          .select()
          .single()

        notif = updated
      } else {
        const { data: inserted } = await supabase
          .from('notifications')
          .insert({ user_id: target.id, from_user_id: req.user.id, type: 'unfollow' })
          .select()
          .single()

        notif = inserted
      }
    }

    if (notif) {
      const [{ data: fromProfile }, { data: isFollowingBackRow }] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', req.user.id).maybeSingle(),
        supabase.from('followers').select('id').eq('follower_id', target.id).eq('following_id', req.user.id).maybeSingle(),
      ])

      const io = getIO()
      if (io && fromProfile) {
        io.to(target.id).emit('notification', {
          notification: {
            id: notif.id,
            type: 'unfollow',
            read: false,
            createdAt: notif.created_at,
            isFollowingBack: !!isFollowingBackRow,
            fromUser: {
              id: req.user.id,
              username: sanitize(fromProfile?.display_name || fromProfile?.username || 'Desconocido'),
              avatar_url: fromProfile?.avatar_url || null,
            },
          },
        })
      }
    }
  }, 2000)

  pendingFollowToggles.set(key, { timer })
  res.json({ message: 'Dejaste de seguir al usuario' })
})

export const getFollowers = asyncHandler(async (req, res) => {
  const { username } = req.params
  const sanitized = sanitize(username)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', escapeILike(sanitized.toLowerCase()))
    .maybeSingle()

  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const { data: followerRows, error: followerError } = await supabase
    .from('followers')
    .select('follower_id')
    .eq('following_id', target.id)
    .order('created_at', { ascending: false })

  if (followerError) {
    return res.status(400).json({ error: 'Error al obtener seguidores' })
  }

  if (followerRows.length === 0) {
    return res.json({ followers: [] })
  }

  const blockRows = await getBlockRowsForUser(req.user.id)
  const excluded = new Set([...blockRows.blockedByMe, ...blockRows.blockedByThem])

  const followerIds = followerRows.map(f => f.follower_id)

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', followerIds)

  if (profileError) {
    return res.status(400).json({ error: 'Error al obtener perfiles' })
  }

  const idOrder = followerIds
  const filteredProfiles = (profiles || []).filter(p => !excluded.has(p.id))
  filteredProfiles.sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id))

  const mapped = filteredProfiles.map(p => ({ ...p, username: p.display_name || p.username }))
  res.json({ followers: mapped })
})
