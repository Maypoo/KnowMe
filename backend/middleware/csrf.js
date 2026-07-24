import { isLocalOrigin } from '../lib/utils.js'

export function csrfProtection(allowedOrigins) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()

    const origin = req.headers.origin
    const referer = req.headers.referer

    if (!origin && !referer) {
      return res.status(403).json({ error: 'Origen no válido' })
    }

    const source = (origin || referer || '').replace(/\/$/, '')
    const isAllowed = allowedOrigins.includes(source) || isLocalOrigin(source)

    if (!isAllowed) {
      return res.status(403).json({ error: 'Origen no permitido' })
    }

    next()
  }
}
