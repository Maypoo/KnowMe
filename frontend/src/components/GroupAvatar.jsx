import { Users } from 'lucide-react'

export default function GroupAvatar({ iconUrl, size = 40 }) {
  return (
    <div
      className="relative rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {iconUrl ? (
        <img src={iconUrl} alt="Icono del grupo" className="w-full h-full object-cover" />
      ) : (
        <Users size={size * 0.5} className="text-zinc-400" />
      )}
    </div>
  )
}