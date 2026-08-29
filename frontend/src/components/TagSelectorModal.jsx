import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { spring } from '../lib/motion'

export default function TagSelectorModal({ open, onClose, selected, onSave, title = 'Etiquetas del post' }) {
  const [tags, setTags] = useState([])
  const [input, setInput] = useState('')
  const [duplicateMsg, setDuplicateMsg] = useState('')
  const [saveError, setSaveError] = useState('')
  const inputRef = useRef(null)

  const { data: existingTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await api('/api/tags')
      const data = await res.json()
      return data.tags || []
    },
    enabled: open,
  })

  const currentName = input.replace(/^#/, '').trim().toLowerCase()
  const isNew = currentName.length > 0 && !existingTags.some(t => t.name === currentName)

  useEffect(() => {
    if (open) {
      setTags([...selected])
      setInput('')
      setDuplicateMsg('')
      setSaveError('')
    }
  }, [open, selected])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open, tags.length])

  const addTag = (raw) => {
    const name = raw.replace(/^#/, '').trim().toLowerCase().slice(0, 20)
    if (!name) return
    if (tags.includes(name)) {
      setDuplicateMsg(`"${name}" ya fue agregada`)
      setTimeout(() => setDuplicateMsg(''), 2000)
      return
    }
    if (tags.length >= 5) return
    setTags(prev => [...prev, name])
    setDuplicateMsg('')
  }

  const handleChange = (e) => {
    const raw = e.target.value
    const val = raw.replace(/[^a-zA-ZáéíóúñüÁÉÍÓÚÑÜ]/g, '')
    if (val === '') { setInput(''); return }
    setInput('#' + val)
  }

  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Space') { e.preventDefault(); addTag(input); setInput(''); return }
    if (e.key === 'Enter') { e.preventDefault(); addTag(input); setInput(''); return }
    if (e.key === 'Backspace' && input === '' && tags.length > 0) setTags(prev => prev.slice(0, -1))
  }

  const handleSave = async () => {
    const final = input.replace(/^#/, '').trim().toLowerCase()
    const result = final && !tags.includes(final) && tags.length < 5 ? [...tags, final] : tags
    setSaveError('')
    try { await onSave(result); onClose() } catch (err) { setSaveError(err.message || 'Error al guardar etiquetas') }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
          <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={spring.default} className="relative bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-[1.25rem] w-full max-w-md shadow-[0_24px_64px_rgba(0,0,0,0.5)] overflow-hidden will-change-transform" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center p-4 border-b border-white/[0.06] relative">
              <h2 className="text-zinc-100 font-semibold text-[17px] tracking-[-0.015em]">{title}</h2>
              <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="absolute right-3 w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-200 tap-highlight"><X size={16} /></motion.button>
            </div>
            <div className="p-4 space-y-3">
              {duplicateMsg && <p className="text-amber-400 text-xs text-center">{duplicateMsg}</p>}
              {saveError && <p className="text-red-400 text-xs text-center">{saveError}</p>}
              <div className="flex flex-wrap items-center gap-1.5 bg-zinc-800/80 border border-white/[0.06] rounded-xl px-3 py-2 min-h-[42px] cursor-text focus-within:border-[var(--color-accent)]/30 transition-colors" onClick={() => inputRef.current?.focus()}>
                {tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-zinc-200 bg-white/[0.08] border border-white/[0.06]">
                    <span>#{tag}</span>
                    <button onClick={(e) => { e.stopPropagation(); setTags(prev => prev.filter(t => t !== tag)) }} className="hover:text-zinc-100 ml-0.5 rounded-full p-0.5 hover:bg-white/10"><X size={12} /></button>
                  </span>
                ))}
                {tags.length < 5 ? (
                  <>
                    <input ref={inputRef} value={input} onChange={handleChange} onKeyDown={handleKeyDown} maxLength={21} placeholder={tags.length === 0 ? 'Ingresa un máximo de 5 etiquetas' : ''} className="flex-1 min-w-[60px] bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none" />
                    {isNew && <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-400 shrink-0"><Plus size={12} />Nueva</span>}
                    {input.length >= 15 && <span className="text-zinc-500 text-xs shrink-0">{input.length - 1}/20</span>}
                  </>
                ) : <span className="text-zinc-400 text-xs">Máximo alcanzado</span>}
              </div>
              <div className="flex justify-center pt-2">
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-colors tap-highlight shadow-sm">Guardar</motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
