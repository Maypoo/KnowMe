import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCw, FlipHorizontal2, Eraser } from 'lucide-react'
import { spring } from '../lib/motion'

const CONTAINER_SIZE = 240

export default function ImageCropModal({ open, previewUrl, title = 'Editar foto', onSave, onCancel }) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [imageNatural, setImageNatural] = useState({ w: 0, h: 0 })
  const [saving, setSaving] = useState(false)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const maxPanRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!open) return
    setZoom(1); setRotation(0); setFlipH(false); setPosition({ x: 0, y: 0 }); setImageNatural({ w: 0, h: 0 })
  }, [open, previewUrl])

  useEffect(() => {
    if (!previewUrl) return
    const img = new Image()
    img.onload = () => setImageNatural({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = previewUrl
    return () => { img.onload = null }
  }, [previewUrl])

  const handleMouseDown = (e) => {
    e.preventDefault()
    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y }
  }
  const handleTouchStart = (e) => {
    const touch = e.touches[0]
    isDraggingRef.current = true
    dragStartRef.current = { x: touch.clientX, y: touch.clientY, posX: position.x, posY: position.y }
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return
      const dx = e.clientX - dragStartRef.current.x; const dy = e.clientY - dragStartRef.current.y
      const mx = maxPanRef.current.x; const my = maxPanRef.current.y
      setPosition({ x: Math.max(-mx, Math.min(mx, dragStartRef.current.posX + dx)), y: Math.max(-my, Math.min(my, dragStartRef.current.posY + dy)) })
    }
    const handleTouchMove = (e) => {
      if (!isDraggingRef.current) return
      const touch = e.touches[0]; const dx = touch.clientX - dragStartRef.current.x; const dy = touch.clientY - dragStartRef.current.y
      const mx = maxPanRef.current.x; const my = maxPanRef.current.y
      setPosition({ x: Math.max(-mx, Math.min(mx, dragStartRef.current.posX + dx)), y: Math.max(-my, Math.min(my, dragStartRef.current.posY + dy)) })
    }
    const handleEnd = () => { isDraggingRef.current = false }
    window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleTouchMove, { passive: true }); window.addEventListener('touchend', handleEnd)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleTouchMove); window.removeEventListener('touchend', handleEnd)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const clampedX = Math.max(-maxPanX, Math.min(maxPanX, position.x))
    const clampedY = Math.max(-maxPanY, Math.min(maxPanY, position.y))
    if (clampedX !== position.x || clampedY !== position.y) setPosition({ x: clampedX, y: clampedY })
  }, [zoom, imageNatural, rotation, flipH, open])

  const handleReset = () => { setZoom(1); setRotation(0); setFlipH(false); setPosition({ x: 0, y: 0 }) }

  const handleSave = () => {
    if (!previewUrl) return
    const img = new Image()
    img.onload = async () => {
      const OUTPUT_SIZE = 400
      const baseScale = Math.max(CONTAINER_SIZE / img.naturalWidth, CONTAINER_SIZE / img.naturalHeight)
      const scale = OUTPUT_SIZE / CONTAINER_SIZE
      const imgScale = baseScale * zoom * scale
      const canvas = document.createElement('canvas'); canvas.width = OUTPUT_SIZE; canvas.height = OUTPUT_SIZE
      const ctx = canvas.getContext('2d')
      ctx.beginPath(); ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip()
      ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2); ctx.translate(position.x * scale, position.y * scale)
      ctx.rotate(rotation * Math.PI / 180); if (flipH) ctx.scale(-1, 1)
      const drawW = img.naturalWidth * imgScale; const drawH = img.naturalHeight * imgScale
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
      const base64 = canvas.toDataURL('image/jpeg', 0.9)
      setSaving(true)
      try { await onSave(base64) } finally { setSaving(false) }
    }
    img.src = previewUrl
  }

  const baseScale = imageNatural.w && imageNatural.h ? Math.max(CONTAINER_SIZE / imageNatural.w, CONTAINER_SIZE / imageNatural.h) : 1
  const displayW = imageNatural.w ? imageNatural.w * baseScale * zoom : CONTAINER_SIZE
  const displayH = imageNatural.h ? imageNatural.h * baseScale * zoom : CONTAINER_SIZE
  const effectiveW = (rotation % 180 === 0) ? displayW : displayH
  const effectiveH = (rotation % 180 === 0) ? displayH : displayW
  const maxPanX = Math.max(0, (effectiveW - CONTAINER_SIZE) / 2)
  const maxPanY = Math.max(0, (effectiveH - CONTAINER_SIZE) / 2)
  maxPanRef.current = { x: maxPanX, y: maxPanY }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={e => e.stopPropagation()}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" onClick={onCancel} />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={spring.default}
            className="relative w-full max-w-sm bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-[1.25rem] p-6 space-y-5 shadow-[0_24px_64px_rgba(0,0,0,0.5)] will-change-transform"
            style={{ transformOrigin: 'center center' }}
          >
            <h2 className="text-[17px] font-semibold text-center tracking-[-0.015em] text-zinc-100">{title}</h2>
            <div className="flex justify-center">
              <div className="relative w-60 h-60 rounded-full overflow-hidden bg-zinc-800 border border-white/[0.06] cursor-grab active:cursor-grabbing select-none" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
                {imageNatural.w ? (
                  <div className="absolute pointer-events-none" style={{ left: '50%', top: '50%', width: 0, height: 0, transform: `translate(${position.x}px, ${position.y}px)`, transformOrigin: '0 0' }}>
                    <div style={{ transform: `rotate(${rotation}deg)${flipH ? ' scaleX(-1)' : ''}`, transformOrigin: '0 0' }}>
                      <img src={previewUrl} alt="Preview" draggable={false} style={{ position: 'absolute', left: `${-displayW / 2}px`, top: `${-displayH / 2}px`, width: `${displayW}px`, height: `${displayH}px`, maxWidth: 'none' }} />
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center"><div className="w-6 h-6 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" /></div>
                )}
              </div>
            </div>
            <div className="flex justify-center">
              <div className="flex items-center gap-1.5 w-36">
                <span className="text-xs text-zinc-500 select-none w-3 text-center leading-none">−</span>
                <input type="range" min="1" max="5" step="0.1" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="flex-1 h-1.5 accent-[var(--color-accent)] cursor-pointer" />
                <span className="text-xs text-zinc-500 select-none w-3 text-center leading-none">+</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => setRotation(r => (r + 90) % 360)} className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 transition-colors tap-highlight"><RotateCw size={14} /></motion.button>
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => setFlipH(f => !f)} className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 transition-colors tap-highlight"><FlipHorizontal2 size={14} /></motion.button>
              <motion.button whileTap={{ scale: 0.93 }} onClick={handleReset} className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 transition-colors tap-highlight"><Eraser size={14} /></motion.button>
            </div>
            <div className="flex items-center justify-center gap-3">
              <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel} className="text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-white/[0.08] hover:bg-white/[0.12] rounded-xl px-5 py-2 transition-colors tap-highlight">Cancelar</motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving || !imageNatural.w} className="text-sm font-semibold text-white rounded-xl px-5 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 shadow-sm tap-highlight">{saving ? 'Guardando...' : 'Guardar'}</motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
