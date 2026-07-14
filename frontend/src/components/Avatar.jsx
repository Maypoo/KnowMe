import { useState } from 'react'
import { User } from 'lucide-react'

export default function Avatar({ src, alt = '', size = 36, className = '' }) {
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div
        className={`bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${className}`}
        style={{ width: size, height: size }}
      >
        <User size={size * 0.5} className="text-zinc-400" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`rounded-full object-cover flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  )
}
