import { supabase } from './supabase.js'

const TOP_LEVEL_KEYS = ['ip', 'user_agent']
const META_KEYS = ['reason', 'method', 'username']

export async function auditLog(event, userId, email, metadata = {}) {
  const topLevel = {}
  const meta = {}
  for (const [k, v] of Object.entries(metadata)) {
    if (TOP_LEVEL_KEYS.includes(k)) topLevel[k] = v
    else if (META_KEYS.includes(k)) meta[k] = v
  }
  const entry = { event, user_id: userId, email, ...topLevel, metadata: meta, timestamp: new Date().toISOString() }
  try {
    console.log(JSON.stringify({ type: 'audit', ...entry }))
    await supabase.from('audit_logs').insert(entry)
  } catch (err) { console.error(err) }
}
