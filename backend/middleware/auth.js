import { supabase } from '../lib/supabase.js'

export default async function auth(req, res, next) {
  const token = req.cookies['sb-access-token']

  if (!token) {
    return res.status(401).json({ error: 'No autenticado' })
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.clearCookie('sb-access-token', { path: '/' })
    res.clearCookie('sb-refresh-token', { path: '/' })
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }

  req.user = user
  next()
}
