import { motion, AnimatePresence } from 'framer-motion'
import { spring } from '../../lib/motion'

export default function ModalShell({ open, onClose, children, maxWidth = 'max-w-md', blur = true }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60"
            style={blur ? { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } : undefined}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={spring.default}
            className={`relative w-full ${maxWidth} material-regular rounded-[1.25rem] shadow-[0_24px_64px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.06)_inset] overflow-hidden will-change-transform`}
            onClick={e => e.stopPropagation()}
            style={{ transformOrigin: 'center center' }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
