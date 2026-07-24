import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize } from '../lib/utils.js'
import { getIO, isInCall, addToCall, removeFromCall } from '../src/socket.js'
import { insertMissedCall } from '../lib/chat.js'

export const offer = asyncHandler(async (req, res) => {
  const { targetUserId, sdp } = req.body
  if (!targetUserId || !sdp) {
    return res.status(400).json({ error: 'Parámetros requeridos' })
  }

  if (isInCall(targetUserId)) {
    await insertMissedCall(req.user.id, targetUserId)
    return res.status(409).json({ error: 'user_busy', message: 'El usuario está en otra llamada' })
  }

  const io = getIO()
  if (!io) {
    return res.status(500).json({ error: 'Socket no disponible' })
  }

  const targetSockets = await io.in(targetUserId).fetchSockets()
  if (targetSockets.length === 0) {
    await insertMissedCall(req.user.id, targetUserId)
    return res.status(404).json({ error: 'user_offline', message: 'El usuario no está disponible' })
  }

  addToCall(req.user.id)

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', req.user.id)
    .maybeSingle()

  io.to(targetUserId).emit('signal:offer', {
    caller: {
      id: req.user.id,
      username: profile?.display_name || profile?.username || 'Desconocido',
      avatar_url: profile?.avatar_url || null,
    },
    sdp,
  })

  io.to(req.user.id).emit('call:ack', { targetUserId })

  res.json({ sent: true })
})

export const answer = asyncHandler(async (req, res) => {
  const { targetUserId, sdp } = req.body
  if (!targetUserId || !sdp) {
    return res.status(400).json({ error: 'Parámetros requeridos' })
  }

  addToCall(req.user.id)

  const io = getIO()
  if (io) {
    io.to(targetUserId).emit('signal:answer', { sdp })
  }

  res.json({ sent: true })
})

export const iceCandidate = asyncHandler(async (req, res) => {
  const { targetUserId, candidate } = req.body
  if (!targetUserId || !candidate) {
    return res.status(400).json({ error: 'Parámetros requeridos' })
  }

  const io = getIO()
  if (io) {
    io.to(targetUserId).emit('signal:ice-candidate', { candidate })
  }

  res.json({ sent: true })
})

export const end = asyncHandler(async (req, res) => {
  const { targetUserId } = req.body
  if (!targetUserId) {
    return res.status(400).json({ error: 'Parámetros requeridos' })
  }

  removeFromCall(req.user.id)
  removeFromCall(targetUserId)

  const io = getIO()
  if (io) {
    io.to(targetUserId).emit('call:end', {})
  }

  res.json({ sent: true })
})

export const missed = asyncHandler(async (req, res) => {
  const { targetUserId } = req.body
  if (!targetUserId) {
    return res.status(400).json({ error: 'targetUserId requerido' })
  }

  await insertMissedCall(req.user.id, targetUserId)
  res.json({ sent: true })
})
