import { supabase } from './supabase'

const BASE_URL = import.meta.env.VITE_API_URL || ''
const AUTH_TOKEN_KEY = 'knowme_auth_token'
const REFRESH_TOKEN_KEY = 'knowme_refresh_token'

function resolveUrl(path) {
  if (!BASE_URL) return path
  const url = new URL(BASE_URL)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.hostname = window.location.hostname
  }
  return `${url.toString().replace(/\/$/, '')}${path}`
}

let authToken = localStorage.getItem(AUTH_TOKEN_KEY)
let refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)

export function setAuthToken(token, refresh = refreshToken) {
  authToken = token
  refreshToken = refresh
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  }
  if (refresh) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}

export function clearAuthToken() {
  setAuthToken(null, null)
}

let refreshing = null

async function refreshAuthToken() {
  if (!refreshToken) return null
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
      if (error || !data.session) {
        clearAuthToken()
        return null
      }
      setAuthToken(data.session.access_token, data.session.refresh_token)
      return data.session.access_token
    } catch {
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const method = (options.method || 'GET').toUpperCase()
  const isIdempotent = ['GET', 'HEAD', 'OPTIONS'].includes(method)
  const MAX_RETRIES = isIdempotent ? 2 : 1

  let lastError

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let res = await fetch(resolveUrl(path), {
        credentials: 'include',
        ...options,
        headers,
      })

      if (res.status === 401 && authToken && attempt < 1) {
        const newToken = await refreshAuthToken()
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`
          res = await fetch(resolveUrl(path), {
            credentials: 'include',
            ...options,
            headers,
          })
        }
      }

      const origJson = res.json.bind(res)
      res.json = async () => {
        try {
          return await origJson()
        } catch {
          return null
        }
      }
      return res
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      }
    }
  }

  throw lastError
}

