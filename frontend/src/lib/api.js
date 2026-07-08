const BASE_URL = import.meta.env.VITE_API_URL || ''

function resolveUrl(path) {
  if (!BASE_URL) return path
  const url = new URL(BASE_URL)
  url.hostname = window.location.hostname
  return `${url.toString().replace(/\/$/, '')}${path}`
}

export async function api(path, options = {}) {
  const res = await fetch(resolveUrl(path), {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  return res
}
