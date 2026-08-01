import { supabase } from './supabase.js'

export async function getBlockRowsForUser(userId) {
  const [{ data: outgoing }, { data: incoming }] = await Promise.all([
    supabase.from('blocks').select('blocked_id').eq('blocker_id', userId),
    supabase.from('blocks').select('blocker_id').eq('blocked_id', userId),
  ])
  return {
    blockedByMe: new Set((outgoing || []).map(r => r.blocked_id)),
    blockedByThem: new Set((incoming || []).map(r => r.blocker_id)),
  }
}

export async function getInvisibleIds(userId) {
  const { blockedByMe, blockedByThem } = await getBlockRowsForUser(userId)
  return new Set([...blockedByMe, ...blockedByThem])
}

export async function getBlockStatus(userId, targetId) {
  const { blockedByMe, blockedByThem } = await getBlockRowsForUser(userId)
  return {
    blockedByMe: blockedByMe.has(targetId),
    blockedByThem: blockedByThem.has(targetId),
  }
}

export async function isBlockedBetween(userId, targetId) {
  const { blockedByMe, blockedByThem } = await getBlockStatus(userId, targetId)
  return blockedByMe || blockedByThem
}

export function formatExcludedIds(excluded) {
  if (!excluded || excluded.size === 0) return null
  return `(${[...excluded].map(id => `"${id}"`).join(',')})`
}
