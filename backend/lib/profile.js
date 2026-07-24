import sharp from 'sharp'
import { supabase } from './supabase.js'

export async function getUsernameChangeLimits(userId) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: changes, error } = await supabase
    .from('username_changes')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) return { remaining: 3, nextAvailable: null }

  const count = changes.length
  const remaining = Math.max(0, 3 - count)

  let nextAvailable = null
  if (count >= 3) {
    const oldest = changes[changes.length - 1]
    const nextDate = new Date(new Date(oldest.created_at).getTime() + 14 * 24 * 60 * 60 * 1000)
    nextAvailable = nextDate.toISOString()
  }

  return { remaining, nextAvailable }
}

export async function uploadAvatar(userId, base64) {
  const matches = base64.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/)
  if (!matches) return null

  const { data: files } = await supabase.storage
    .from('avatars')
    .list(userId)

  if (files && files.length > 0) {
    const paths = files.map(f => `${userId}/${f.name}`)
    await supabase.storage.from('avatars').remove(paths)
  }

  const filePath = `${userId}/avatar_${Date.now()}.webp`

  let webpBuffer
  try {
    webpBuffer = await sharp(Buffer.from(matches[2], 'base64'))
      .resize(200, 200, { fit: 'cover' })
      .webp()
      .toBuffer()
  } catch (err) {
    console.error(err)
    return null
  }

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, webpBuffer, {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000',
      upsert: true,
    })

  if (uploadError) return null

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath)

  return publicUrl
}

export async function ensureAvatarBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some(b => b.name === 'avatars')
  if (!exists) {
    const { error } = await supabase.storage.createBucket('avatars', {
      public: true,
      fileSizeLimit: 2097152,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    })
    if (error) console.error('Error creating avatars bucket:', error.message)
  }
}
