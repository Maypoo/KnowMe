import { supabase } from './supabase'
import { isTauri, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export async function startOAuth({ deleteAccount = false } = {}) {
  const options = isTauri()
    ? { skipBrowserRedirect: true }
    : { redirectTo: window.location.origin + '/auth/callback' + (deleteAccount ? '?action=delete' : '') }

  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options })
  if (error) throw error

  if (!isTauri()) return

  if (!data?.url) throw new Error('No se pudo generar el enlace de inicio de sesión')
  const url = new URL(data.url)
  if (!url.searchParams.has('prompt')) url.searchParams.set('prompt', 'select_account')
  await invoke('open_google_oauth', { url: url.toString(), deleteAccount })
}

export function onOAuthTokens(callback) {
  if (!isTauri()) return () => {}
  let unlisten
  listen('knowme-oauth', (event) => callback(event.payload))
    .then((fn) => { unlisten = fn })
  return () => { if (unlisten) unlisten() }
}