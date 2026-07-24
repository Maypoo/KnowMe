import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { sanitize, escapeILike } from '../lib/utils.js'

export const search = asyncHandler(async (req, res) => {
  const q = req.query.q

  if (!q || q.length < 1) {
    return res.status(400).json({ error: 'Búsqueda muy corta' })
  }

  const sanitized = sanitize(q)

  const { data: users } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', `%${escapeILike(sanitized.toLowerCase())}%`)
    .limit(10)

  const mapped = (users || []).map(u => ({ ...u, username: u.display_name || u.username }))
  res.json({ users: mapped })
})
