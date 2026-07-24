export const rotatedTokens = new Map()

setInterval(() => {
  const cutoff = Date.now() - 3600000
  for (const [key, val] of rotatedTokens) {
    if (val.timestamp < cutoff) rotatedTokens.delete(key)
  }
}, 300000)
