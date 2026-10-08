const DEMO_FLAG = 'knowme_demo_active'
const TOKEN_KEY = 'knowme_auth_token'
const REFRESH_KEY = 'knowme_refresh_token'

export const DEMO_TOKEN = 'demo-token'

export function isDemoRoute() {
  try {
    if (typeof window === 'undefined') return false
    if (window.location.pathname.startsWith('/demo')) return true
    return sessionStorage.getItem(DEMO_FLAG) === '1'
  } catch {
    return false
  }
}

export function enterDemo() {
  try {
    sessionStorage.setItem(DEMO_FLAG, '1')
    localStorage.setItem(TOKEN_KEY, DEMO_TOKEN)
    localStorage.setItem(REFRESH_KEY, 'demo-refresh')
  } catch {}
}

export function exitDemo() {
  try {
    sessionStorage.removeItem(DEMO_FLAG)
    if (localStorage.getItem(TOKEN_KEY) === DEMO_TOKEN) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
    }
  } catch {}
}

export function goToRealLogin() {
  const url = `${window.location.origin}/login`
  try {
    if (window.self !== window.top) {
      window.open(url, '_blank', 'noopener')
      return
    }
  } catch {}
  window.location.href = url
}
