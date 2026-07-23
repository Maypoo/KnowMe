const BASE_URL = import.meta.env.VITE_API_URL || ''
const AUTH_TOKEN_KEY = 'knowme_auth_token'

function resolveUrl(path) {
  if (!BASE_URL) return path
  const url = new URL(BASE_URL)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.hostname = window.location.hostname
  }
  return `${url.toString().replace(/\/$/, '')}${path}`
}

let authToken = sessionStorage.getItem(AUTH_TOKEN_KEY)

export function setAuthToken(token) {
  authToken = token
  if (token) {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token)
  } else {
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
  }
}

export function clearAuthToken() {
  setAuthToken(null)
}

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const MAX_RETRIES = 2
  let lastError

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(resolveUrl(path), {
        credentials: 'include',
        ...options,
        headers,
      })
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

