import { useState, useRef, useEffect } from 'react'
import countries from '../data/countries'

function getFlagUrl(code) {
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`
}

export default function CountrySelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = search
    ? countries.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : countries

  const selected = countries.find(c => c.code === value)

  function handleSelect(code) {
    onChange(code)
    setOpen(false)
    setSearch('')
  }

  function handleClear() {
    onChange(null)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-left text-zinc-100 outline-none focus:border-zinc-600 transition flex items-center gap-2"
      >
        {selected ? (
          <>
            <img src={getFlagUrl(selected.code)} alt="" className="w-5 h-auto rounded-sm" />
            <span>{selected.name}</span>
          </>
        ) : (
          <span className="text-zinc-500">Seleccionar país</span>
        )}
        <svg className={`w-4 h-4 ml-auto text-zinc-500 transition ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl max-h-72 flex flex-col">
          <div className="p-2 border-b border-zinc-800">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar país..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-100 outline-none placeholder-zinc-500 focus:border-zinc-600 transition"
            />
          </div>
          <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
            {filtered.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-4">No se encontraron países</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleSelect(c.code)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-zinc-800 transition ${value === c.code ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300'}`}
                >
                  <img src={getFlagUrl(c.code)} alt="" className="w-5 h-auto rounded-sm" />
                  <span>{c.name}</span>
                  {value === c.code && (
                    <svg className="w-4 h-4 ml-auto text-[#6659ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
          {value && (
            <div className="p-1 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleClear}
                className="w-full text-left px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition"
              >
                Limpiar país
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
