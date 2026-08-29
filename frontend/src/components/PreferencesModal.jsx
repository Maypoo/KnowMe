import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { spring } from '../lib/motion'

export default function PreferencesModal({
  open, onClose,
  prefTagNames, setPrefTagNames,
  prefSearch, setPrefSearch,
  allTags,
  savingPrefs, handleSavePreferences
}) {
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
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={spring.default}
            className="relative bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-[1.25rem] w-full max-w-md shadow-[0_24px_64px_rgba(0,0,0,0.5)] overflow-hidden will-change-transform"
            onClick={e => e.stopPropagation()}
            style={{ transformOrigin: 'center center' }}
          >
            <div className="flex items-center justify-center p-4 border-b border-white/[0.06] relative">
              <h2 className="text-zinc-100 font-semibold text-[17px] tracking-[-0.015em]">Preferencias</h2>
              <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="absolute right-3 w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors tap-highlight">
                <X size={16} />
              </motion.button>
            </div>
            <div className="p-4 space-y-3">
              {prefTagNames.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {prefTagNames.map(name => (
                    <span key={name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-zinc-200 bg-zinc-700 border border-white/[0.06]">
                      <span>#{name}</span>
                      <button onClick={() => setPrefTagNames(prev => prev.filter(t => t !== name))} className="hover:text-zinc-100 ml-0.5 rounded-full p-0.5 hover:bg-white/10 transition-colors"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <input
                value={prefSearch}
                onChange={e => setPrefSearch(e.target.value)}
                placeholder="Buscar etiquetas..."
                className="w-full bg-zinc-800/80 border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[var(--color-accent)]/50 focus:bg-zinc-800 transition-colors"
              />
              <div className="max-h-[40vh] overflow-y-auto space-y-1 pr-1">
                {!prefSearch ? (
                  <div className="space-y-1">
                    {allTags.slice(0, 5).map(tag => (
                      <motion.button
                        key={tag.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          if (prefTagNames.includes(tag.name)) setPrefTagNames(prev => prev.filter(t => t !== tag.name))
                          else if (prefTagNames.length < 5) setPrefTagNames(prev => [...prev, tag.name])
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors tap-highlight ${prefTagNames.includes(tag.name) ? 'bg-white/[0.08] text-zinc-100 border border-white/[0.06]' : 'text-zinc-300 hover:bg-white/[0.05]'}`}
                      >
                        <span>#{tag.name}</span><span className="text-zinc-500 text-xs">{tag.post_count} posts</span>
                      </motion.button>
                    ))}
                    {allTags.length > 5 && <p className="text-zinc-500 text-xs text-center pt-2">Buscá más etiquetas</p>}
                  </div>
                ) : (() => {
                  const filtered = allTags.filter(t => t.name.includes(prefSearch.toLowerCase()))
                  return filtered.length === 0 ? <p className="text-zinc-500 text-sm text-center py-4">No hay etiquetas con ese nombre</p> : filtered.map(tag => (
                    <motion.button key={tag.id} whileTap={{ scale: 0.98 }} onClick={() => {
                      if (prefTagNames.includes(tag.name)) setPrefTagNames(prev => prev.filter(t => t !== tag.name))
                      else if (prefTagNames.length < 5) setPrefTagNames(prev => [...prev, tag.name])
                    }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${prefTagNames.includes(tag.name) ? 'bg-white/[0.08] text-zinc-100 border border-white/[0.06]' : 'text-zinc-300 hover:bg-white/[0.05]'}`}>
                      <span>#{tag.name}</span><span className="text-zinc-500 text-xs">{tag.post_count} posts</span>
                    </motion.button>
                  ))
                })()}
              </div>
              <div className="flex justify-center pt-2">
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleSavePreferences} disabled={savingPrefs} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 tap-highlight shadow-sm">{savingPrefs ? 'Guardando...' : 'Guardar'}</motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
