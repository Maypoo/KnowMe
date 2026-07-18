export function SkeletonBox({ className = '' }) {
  return (
    <div className={`bg-zinc-800 animate-pulse rounded-lg ${className}`} />
  )
}

export function SkeletonAvatar({ size = 40 }) {
  return (
    <div
      className="bg-zinc-800 animate-pulse rounded-full flex-shrink-0"
      style={{ width: size, height: size }}
    />
  )
}
