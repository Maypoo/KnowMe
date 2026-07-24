import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'

export const getTags = asyncHandler(async (req, res) => {
  const { data: prefs } = await supabase
    .from('user_tag_preferences')
    .select('tag_id')
    .eq('user_id', req.user.id)

  res.json({ tag_ids: (prefs || []).map(p => p.tag_id) })
})

export const updateTags = asyncHandler(async (req, res) => {
  const { tag_ids } = req.body
  if (!Array.isArray(tag_ids)) {
    return res.status(400).json({ error: 'tag_ids debe ser un array' })
  }
  if (tag_ids.length > 5) {
    return res.status(400).json({ error: 'Máximo 5 etiquetas' })
  }

  await supabase.from('user_tag_preferences').delete().eq('user_id', req.user.id)

  if (tag_ids.length > 0) {
    const { error } = await supabase.from('user_tag_preferences').insert(
      tag_ids.map(tag_id => ({ user_id: req.user.id, tag_id }))
    )
    if (error) return res.status(500).json({ error: 'Error al guardar preferencias' })
  }

  res.json({ tag_ids })
})
