import { motion } from 'framer-motion'
import { spring } from '../../lib/motion'

export default function SegmentedControl({ options, value, onChange, className = '', id = 'default' }) {
  return (
    <div className={`relative flex gap-0.5 p-1 rounded-xl material-thin ${className}`}>
      {options.map(opt => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`relative flex-1 rounded-lg py-2 text-sm font-medium transition-colors tap-highlight focus-ring pressable-subtle ${
              active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {active && (
              <motion.div
                layoutId={`segment-${id}-active`}
                transition={spring.snappy}
                initial={false}
                className="absolute inset-0 rounded-lg bg-zinc-800 shadow-sm border border-white/[0.06]"
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
