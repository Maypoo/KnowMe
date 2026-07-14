import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const DAYS = ['Do','Lu','Ma','Mi','Ju','Vi','Sá']

export default function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('days')
  const ref = useRef(null)

  const selected = value ? new Date(value + 'T00:00:00') : null
  const [viewYear, setViewYear] = useState(selected ? selected.getFullYear() : new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(selected ? selected.getMonth() : new Date().getMonth())

  useEffect(() => {
    if (open) {
      const d = selected || new Date()
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
      setView('days')
    }
  }, [open])

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const minYear = today.getFullYear() - 100
  const maxYear = today.getFullYear()

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const formatDate = (y, m, d) => {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  const isFuture = (y, m, d) => {
    const date = new Date(y, m, d)
    return date > today
  }

  const isTooOld = (y) => y < minYear

  const handleSelectDay = (d) => {
    if (isFuture(viewYear, viewMonth, d) || isTooOld(viewYear)) return
    onChange(formatDate(viewYear, viewMonth, d))
    setOpen(false)
  }

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      if (viewYear >= maxYear) return
      setViewYear(y => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  const handlePrevYear = () => {
    setViewYear(y => Math.max(minYear, y - 1))
  }

  const handleNextYear = () => {
    setViewYear(y => Math.min(maxYear, y + 1))
  }

  const handleClear = () => {
    onChange('')
    setOpen(false)
  }

  const displayText = selected
    ? `${selected.getDate()} de ${MONTHS[selected.getMonth()]} del ${selected.getFullYear()}`
    : ''

  const canGoNextMonth = viewYear < maxYear || (viewYear === maxYear && viewMonth < today.getMonth())

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-left text-zinc-100 outline-none focus:border-zinc-600 transition flex items-center justify-between"
      >
        <span className={displayText ? '' : 'text-zinc-500'}>
          {displayText || 'Seleccionar fecha'}
        </span>
        <ChevronDown size={16} className={`text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-800 rounded-xl p-3 z-50 shadow-xl">
          {view === 'days' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="text-zinc-400 hover:text-zinc-200 p-1 transition"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setView('months')}
                  className="text-sm text-zinc-100 hover:text-zinc-300 font-medium transition"
                >
                  {MONTHS[viewMonth]} {viewYear}
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  disabled={!canGoNextMonth}
                  className="text-zinc-400 hover:text-zinc-200 p-1 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-xs text-zinc-600 py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const d = i + 1
                  const disabled = isFuture(viewYear, viewMonth, d)
                  const isSelected = selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === d
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSelectDay(d)}
                      className={`text-xs rounded-lg py-1.5 transition ${
                        isSelected
                          ? 'bg-[#6659ff] text-white'
                          : disabled
                            ? 'text-zinc-700 cursor-not-allowed'
                            : 'text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>

              {selected && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-full text-xs text-zinc-500 hover:text-zinc-300 mt-2 pt-2 border-t border-zinc-800 transition"
                >
                  Limpiar fecha
                </button>
              )}
            </>
          )}

          {view === 'months' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={handlePrevYear}
                  disabled={viewYear <= minYear}
                  className="text-zinc-400 hover:text-zinc-200 p-1 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setView('years')}
                  className="text-sm text-zinc-100 hover:text-zinc-300 font-medium transition"
                >
                  {viewYear}
                </button>
                <button
                  type="button"
                  onClick={handleNextYear}
                  disabled={viewYear >= maxYear}
                  className="text-zinc-400 hover:text-zinc-200 p-1 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {MONTHS.map((m, i) => {
                  const disabled = isFuture(viewYear, i, 1)
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => { setViewMonth(i); setView('days') }}
                      className={`text-xs rounded-lg py-2 transition ${
                        viewMonth === i && viewYear === (selected?.getFullYear())
                          ? 'bg-[#6659ff] text-white'
                          : disabled
                            ? 'text-zinc-700 cursor-not-allowed'
                            : 'text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      {m.slice(0, 3)}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {view === 'years' && (
            <>
              <div className="flex items-center justify-center mb-3">
                <button
                  type="button"
                  onClick={() => setView('months')}
                  className="text-sm text-zinc-100 hover:text-zinc-300 font-medium transition"
                >
                  {viewYear}
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                {Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
                  const y = maxYear - i
                  const disabled = false
                  return (
                    <button
                      key={y}
                      type="button"
                      disabled={disabled}
                      onClick={() => { setViewYear(y); setView('months') }}
                      className={`text-xs rounded-lg py-2 transition ${
                        viewYear === y
                          ? 'bg-[#6659ff] text-white'
                          : 'text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      {y}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
