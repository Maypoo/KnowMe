import { useState } from 'react'

export default function Avatar({ src, alt = '', size = 36, className = '' }) {
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div
        className={`bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${className}`}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 40 40" fill="none" width={size * 0.6} height={size * 0.6}>
          <circle cx="20" cy="14" r="7" fill="#52525b" />
          <path d="M5 36c0-8.284 6.716-15 15-15s15 6.716 15 15" fill="#52525b" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      key={src}
      className={`rounded-full object-cover flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  )
}
