import { motion, AnimatePresence } from 'framer-motion'
import { spring } from '../lib/motion'

export default function DeleteConfirmModal({ open, onClose, deleting, handleDelete }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={onClose}
        >
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={spring.default}
            className="relative w-full max-w-xs material-regular rounded-2xl px-6 py-5 shadow-[0_24px_64px_rgba(0,0,0,0.5)] will-change-transform"
            onClick={e => e.stopPropagation()}
            style={{ transformOrigin: 'center center' }}
          >
            <p className="text-zinc-100 text-sm font-medium tracking-[-0.011em] mb-5">¿Eliminar tu post?</p>
            <div className="flex gap-2 justify-end">
              <motion.button whileTap={{ scale: 0.97 }} onClick={onClose} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl px-4 py-2 text-sm font-medium transition-colors tap-highlight">Cancelar</motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleDelete} disabled={deleting} className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 tap-highlight shadow-sm"> {deleting ? 'Eliminando...' : 'Eliminar'}</motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
