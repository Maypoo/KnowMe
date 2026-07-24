export function sanitize(str) {
  return str.replace(/[<>"']/g, '').trim()
}

export function escapeILike(str) {
  return str.replace(/_/g, '\\_').replace(/%/g, '\\%')
}

export function withDisplayName(profile) {
  if (!profile) return profile
  return { ...profile, username: profile.display_name || profile.username }
}

export function isLocalOrigin(origin) {
  if (!origin) return false
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
      hostname.startsWith('172.')
  } catch (err) {
    console.error(err)
    return false
  }
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
}

export function setSessionCookies(res, session) {
  res.cookie('sb-access-token', session.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: session.expires_in * 1000,
  })
  res.cookie('sb-refresh-token', session.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: session.expires_in * 1000,
  })
}

export function clearSessionCookies(res) {
  res.clearCookie('sb-access-token', { path: '/' })
  res.clearCookie('sb-refresh-token', { path: '/' })
}
