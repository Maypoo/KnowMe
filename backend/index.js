import { createRequire } from 'module'
import crypto from 'crypto'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import auth from './middleware/auth.js'

const require = createRequire(import.meta.url)
const disposableDomains = new Set(require('disposable-email-domains'))

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

const app = express()

app.use(helmet())
app.set('trust proxy', 1)

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim())

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('No autorizado por CORS'))
    }
  },
  credentials: true,
}))
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser())

const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()

  const origin = req.headers.origin
  const referer = req.headers.referer

  if (!origin && !referer) {
    return res.status(403).json({ error: 'Origen no válido' })
  }

  const source = (origin || referer || '').replace(/\/$/, '')
  const isAllowed = allowedOrigins.some(o => source.startsWith(o))

  if (!isAllowed) {
    return res.status(403).json({ error: 'Origen no permitido' })
  }

  next()
}

app.use(csrfProtection)

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const loginAttempts = new Map()
const rotatedTokens = new Map()

function getProgressiveDelay(key) {
  const attempts = loginAttempts.get(key.toLowerCase()) || 0
  if (attempts <= 3) return 0
  return Math.min(1000 * Math.pow(2, attempts - 3), 30000)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }
)

async function auditLog(event, userId, email, metadata = {}) {
  const entry = { event, user_id: userId, email, ...metadata, timestamp: new Date().toISOString() }
  console.log(JSON.stringify({ type: 'audit', ...entry }))
  try {
    await supabase.from('audit_logs').insert(entry)
  } catch {}
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
}

function sanitize(str) {
  return str.replace(/[<>"']/g, '').trim()
}

function setSessionCookies(res, session) {
  res.cookie('sb-access-token', session.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: session.expires_in * 1000,
  })
  res.cookie('sb-refresh-token', session.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: session.expires_in * 1000,
  })
}

function clearSessionCookies(res) {
  res.clearCookie('sb-access-token', { path: '/' })
  res.clearCookie('sb-refresh-token', { path: '/' })
}

app.post('/api/auth/register', registerLimiter, asyncHandler(async (req, res) => {
  const { username, email, password } = req.body

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' })
  }

  if (!/^@[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'El username debe empezar con @ y solo puede contener letras, números y guión bajo' })
  }

  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'El username debe tener entre 2 y 20 caracteres' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'El correo electrónico no es válido' })
  }

  const domain = email.split('@')[1].toLowerCase()
  if (disposableDomains.has(domain)) {
    return res.status(400).json({ error: 'No se permiten correos temporales o desechables' })
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
  }

  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({ error: 'La contraseña debe contener al menos una mayúscula' })
  }

  if (!/[a-z]/.test(password)) {
    return res.status(400).json({ error: 'La contraseña debe contener al menos una minúscula' })
  }

  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'La contraseña debe contener al menos un número' })
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle()

  if (existing) {
    auditLog('register_failed', null, email, { reason: 'username_exists', ip: req.ip, user_agent: req.headers['user-agent'] })
    return res.status(409).json({ error: 'Error al crear la cuenta' })
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    user_metadata: { username },
    email_confirm: true,
  })

  if (authError) {
    auditLog('register_failed', null, email, { reason: authError.message, ip: req.ip, user_agent: req.headers['user-agent'] })
    return res.status(400).json({ error: 'Error al crear la cuenta' })
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: authUser.user.id, username, email })

  if (profileError) {
    console.error('Profile insert skipped:', profileError.message)
  }

  auditLog('register_success', authUser.user.id, email, { username, ip: req.ip, user_agent: req.headers['user-agent'] })
  res.status(201).json({ message: 'Cuenta creada correctamente.' })
}))

app.post('/api/auth/login', loginLimiter, asyncHandler(async (req, res) => {
  let { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'El correo o usuario y la contraseña son obligatorios' })
  }

  let identifier = email.trim()

  if (identifier.startsWith('@')) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('username', identifier)
      .maybeSingle()

    if (profileError || !profile) {
      auditLog('login_failed', null, identifier, { ip: req.ip, user_agent: req.headers['user-agent'] })
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    email = profile.email
  }

  const emailLower = email.toLowerCase()
  const delay = getProgressiveDelay(emailLower)
  if (delay > 0) {
    await new Promise(r => setTimeout(r, delay))
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: emailLower, password })

  if (error) {
    const attempts = (loginAttempts.get(emailLower) || 0) + 1
    loginAttempts.set(emailLower, attempts)
    auditLog('login_failed', null, emailLower, { attempts, ip: req.ip, user_agent: req.headers['user-agent'] })
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }

  if (!data.user.email_confirmed_at) {
    await supabase.auth.admin.signOut(data.user.id)
    auditLog('login_unconfirmed', data.user.id, emailLower, { ip: req.ip, user_agent: req.headers['user-agent'] })
    return res.status(403).json({ error: 'Confirmá tu correo electrónico antes de iniciar sesión' })
  }

  loginAttempts.delete(emailLower)
  setSessionCookies(res, data.session)
  auditLog('login_success', data.user.id, emailLower, { ip: req.ip, user_agent: req.headers['user-agent'] })
  res.json({ user: data.user })
}))

app.post('/api/auth/refresh', generalLimiter, asyncHandler(async (req, res) => {
  const refreshToken = req.cookies['sb-refresh-token']

  if (!refreshToken) {
    return res.status(401).json({ error: 'No hay sesión para refrescar' })
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })

  if (error) {
    const rotated = rotatedTokens.get(tokenHash)
    if (rotated && Date.now() - rotated.timestamp < 3600000) {
      await supabase.auth.admin.signOut(rotated.userId)
      auditLog('refresh_token_reuse', rotated.userId, null, { ip: req.ip, user_agent: req.headers['user-agent'] })
      rotatedTokens.delete(tokenHash)
      clearSessionCookies(res)
      return res.status(401).json({ error: 'Sesión comprometida. Iniciá sesión nuevamente.' })
    }
    clearSessionCookies(res)
    auditLog('refresh_failed', null, null, { reason: error.message, ip: req.ip, user_agent: req.headers['user-agent'] })
    return res.status(401).json({ error: 'Sesión expirada' })
  }

  rotatedTokens.set(tokenHash, { userId: data.user.id, timestamp: Date.now() })
  setSessionCookies(res, data.session)
  auditLog('refresh_success', data.user.id, data.user.email, { ip: req.ip, user_agent: req.headers['user-agent'] })
  res.json({ user: data.user })
}))

app.post('/api/auth/logout', generalLimiter, asyncHandler(async (req, res) => {
  const token = req.cookies['sb-access-token']
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) {
      await supabase.auth.admin.signOut(user.id)
      auditLog('logout', user.id, user.email, { ip: req.ip, user_agent: req.headers['user-agent'] })
    }
  }
  clearSessionCookies(res)
  res.json({ message: 'Sesión cerrada' })
}))

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

app.post('/api/auth/google', googleLimiter, asyncHandler(async (req, res) => {
  const { access_token, refresh_token } = req.body

  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: 'Token requerido' })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(access_token)

  if (userError || !user) {
    return res.status(401).json({ error: 'Token inválido' })
  }

  setSessionCookies(res, {
    access_token,
    refresh_token,
    expires_in: 3600,
  })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profile) {
    auditLog('login_success', user.id, user.email, { method: 'google', ip: req.ip, user_agent: req.headers['user-agent'] })
    return res.json({ user, profile, needsUsername: false })
  }

  auditLog('register_google_pending', user.id, user.email, { ip: req.ip, user_agent: req.headers['user-agent'] })
  return res.json({ user: { id: user.id, email: user.email }, needsUsername: true })
}))

app.post('/api/auth/setup-username', auth, asyncHandler(async (req, res) => {
  const { username } = req.body

  if (!username) {
    return res.status(400).json({ error: 'El nombre de usuario es obligatorio' })
  }

  if (!/^@[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'El username debe empezar con @ y solo puede contener letras, números y guión bajo' })
  }

  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'El username debe tener entre 2 y 20 caracteres' })
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle()

  if (existing) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso' })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({ id: req.user.id, username, email: req.user.email })
    .select()
    .maybeSingle()

  if (profileError) {
    return res.status(400).json({ error: 'Error al crear el perfil' })
  }

  auditLog('register_google_complete', req.user.id, req.user.email, { username, ip: req.ip, user_agent: req.headers['user-agent'] })
  res.json({ profile })
}))

app.post('/api/auth/reset-password', resetLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'El correo es obligatorio' })
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${(allowedOrigins[0] || 'http://localhost:5173').replace(/\/$/, '')}/login`,
  })

  if (error) {
    return res.status(400).json({ error: 'Error al enviar el correo de recuperación' })
  }

  auditLog('reset_password_requested', null, email, { ip: req.ip, user_agent: req.headers['user-agent'] })
  res.json({ message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña' })
}))

app.get('/api/auth/me', auth, asyncHandler(async (req, res) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .maybeSingle()

  if (profile) {
    profile.username = sanitize(profile.username)
  }

  res.json({
    user: req.user,
    profile: profile || { username: req.user.user_metadata?.username || null },
  })
}))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Error interno del servidor' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`KnowMe API running on port ${PORT}`)
})
