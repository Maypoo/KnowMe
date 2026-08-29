import { motion } from 'framer-motion'

export function Pressable({ children, className = '', scale = 0.97, ...props }) {
  return (
    <motion.button
      whileTap={{ scale }}
      transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
      className={`tap-highlight will-change-transform ${className}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      {...props}
    >
      {children}
    </motion.button>
  )
}

export function AccentButton({ children, className = '', ...props }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ backgroundColor: '#7a6eff' }}
      transition={{ duration: 0.12 }}
      className={`bg-[var(--color-accent)] text-white font-medium rounded-xl tap-highlight will-change-transform shadow-[0_1px_2px_rgba(0,0,0,0.2)] ${className}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      {...props}
    >
      {children}
    </motion.button>
  )
}
