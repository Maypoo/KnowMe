const BASE_URL = import.meta.env.VITE_API_URL || ''

function resolveUrl(path) {
  if (!BASE_URL) return path
  const url = new URL(BASE_URL)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.hostname = window.location.hostname
  }
  return `${url.toString().replace(/\/$/, '')}${path}`
}

export async function api(path, options = {}) {
  const MAX_RETRIES = 2
  let lastError

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(resolveUrl(path), {
        credentials: 'include',
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })
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
