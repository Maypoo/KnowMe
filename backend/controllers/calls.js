import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { getBlockStatus } from '../lib/blocks.js'
import { getIO, isInCall, addToCall, removeFromCall, setPendingCall, getPendingCall, removePendingCall } from '../src/socket.js'

export const offer = asyncHandler(async (req, res) => {
  const { targetUserId, sdp } = req.body
  if (!targetUserId || !sdp) {
    return res.status(400).json({ error: 'Parámetros requeridos' })
  }

  if (isInCall(req.user.id)) {
    return res.status(409).json({ error: 'user_busy', message: 'Ya estás en una llamada' })
  }

  const blockStatus = await getBlockStatus(req.user.id, targetUserId)
  if (blockStatus.blockedByMe || blockStatus.blockedByThem) {
    return res.status(403).json({ error: 'No podés llamar a este usuario' })
  }

  const io = getIO()
  if (!io) {
    return res.status(500).json({ error: 'Socket no disponible' })
  }

  setPendingCall(req.user.id, targetUserId, sdp)

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

  const pending = getPendingCall(targetUserId)
  if (!pending) {
    return res.status(404).json({ error: 'no_pending_call', message: 'No hay una llamada pendiente de ese usuario' })
  }

  addToCall(req.user.id)
  addToCall(targetUserId)
  removePendingCall(targetUserId)

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
  removePendingCall(req.user.id)
  removePendingCall(targetUserId)

  const io = getIO()
  if (io) {
    io.to(targetUserId).emit('call:end', {})
  }

  res.json({ sent: true })
})

export const pending = asyncHandler(async (req, res) => {
  const { callerUserId } = req.params
  if (!callerUserId) {
    return res.status(400).json({ error: 'callerUserId requerido' })
  }

  const pending = getPendingCall(callerUserId)
  if (!pending || pending.targetUserId !== req.user.id) {
    return res.json({ pending: false })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', callerUserId)
    .maybeSingle()

  res.json({
    pending: true,
    caller: {
      id: callerUserId,
      username: profile?.display_name || profile?.username || 'Desconocido',
      avatar_url: profile?.avatar_url || null,
    },
    sdp: pending.sdp,
  })
})
