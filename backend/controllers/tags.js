import { supabase } from '../lib/supabase.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { resolveTagNames } from '../lib/tags.js'

export const resolve = asyncHandler(async (req, res) => {
  const { tag_names } = req.body
  if (!Array.isArray(tag_names)) {
    return res.status(400).json({ error: 'tag_names debe ser un array' })
  }
  const tagIds = await resolveTagNames(req, tag_names)
  res.json({ tag_ids: tagIds })
})

export const list = asyncHandler(async (req, res) => {
  const { data: tags, error } = await supabase
    .from('tags')
    .select('*, post_tags(count)')

  if (error) return res.status(500).json({ error: 'Error al obtener tags' })

  const result = (tags || [])
    .map(t => ({
      id: t.id,
      name: t.name,
      post_count: t.post_tags?.[0]?.count ?? 0,
    }))
    .sort((a, b) => b.post_count - a.post_count)

  res.json({ tags: result })
})
