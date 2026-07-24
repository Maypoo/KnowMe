import { supabase } from './supabase.js'

export async function resolveTagNames(req, names) {
  const tagIds = []
  const LETTERS_ONLY = /^[a-zA-ZáéíóúñüÁÉÍÓÚÑÜ]+$/

  const { count: todayCount } = await supabase
    .from('tags')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', req.user.id)
    .gte('created_at', new Date(new Date().toDateString()).toISOString())

  const newNames = []

  for (const raw of names) {
    const name = raw.trim().toLowerCase().slice(0, 20)
    if (!name) continue
    if (!LETTERS_ONLY.test(name)) {
      const e = new Error(`"${name}" solo puede contener letras`)
      e.status = 400
      throw e
    }

    const { data: existing } = await supabase
      .from('tags')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      tagIds.push(existing.id)
    } else {
      newNames.push(name)
    }
  }

  if (todayCount + newNames.length > 5) {
    const e = new Error('Límite diario de etiquetas nuevas alcanzado.')
    e.status = 429
    throw e
  }

  for (const name of newNames) {
    const { data: created } = await supabase
      .from('tags')
      .insert({ name, created_by: req.user.id })
      .select('id')
      .single()

    if (created) {
      tagIds.push(created.id)
    }
  }

  return tagIds
}

export async function syncPostTags(postId, tagIds) {
  await supabase.from('post_tags').delete().eq('post_id', postId)
  if (tagIds.length > 0) {
    await supabase.from('post_tags').insert(tagIds.map(tag_id => ({ post_id: postId, tag_id })))
  }
}
