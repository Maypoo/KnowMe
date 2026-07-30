import { X } from 'lucide-react'

export default function PreferencesModal({
  open, onClose,
  prefTagNames, setPrefTagNames,
  prefSearch, setPrefSearch,
  allTags,
  savingPrefs, handleSavePreferences
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-center p-4 border-b border-zinc-800 relative">
          <h2 className="text-zinc-100 font-semibold text-lg">Preferencias</h2>
          <button onClick={onClose} className="absolute right-4 text-zinc-400 hover:text-zinc-200 transition p-1">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {prefTagNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {prefTagNames.map(name => (
                <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-medium text-zinc-200 bg-zinc-700">
                  <span>#{name}</span>
                  <button
                    onClick={() => setPrefTagNames(prev => prev.filter(t => t !== name))}
                    className="hover:text-zinc-100 ml-0.5"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            value={prefSearch}
            onChange={e => setPrefSearch(e.target.value)}
            placeholder="Buscar etiquetas..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <div className="max-h-[40vh] overflow-y-auto space-y-1">
            {!prefSearch ? (
              <div className="space-y-1">
                {allTags.slice(0, 5).map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      if (prefTagNames.includes(tag.name)) {
                        setPrefTagNames(prev => prev.filter(t => t !== tag.name))
                      } else if (prefTagNames.length < 5) {
                        setPrefTagNames(prev => [...prev, tag.name])
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition ${
                      prefTagNames.includes(tag.name)
                        ? 'bg-zinc-700 text-zinc-100'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <span>#{tag.name}</span>
                    <span className="text-zinc-500 text-xs">{tag.post_count} posts</span>
                  </button>
                ))}
                {allTags.length > 5 && (
                  <p className="text-zinc-500 text-xs text-center pt-2">Buscá más etiquetas</p>
                )}
              </div>
            ) : (() => {
              const filtered = allTags.filter(t => t.name.includes(prefSearch.toLowerCase()))
              return filtered.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-4">No hay etiquetas con ese nombre</p>
              ) : (
                filtered.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      if (prefTagNames.includes(tag.name)) {
                        setPrefTagNames(prev => prev.filter(t => t !== tag.name))
                      } else if (prefTagNames.length < 5) {
                        setPrefTagNames(prev => [...prev, tag.name])
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition ${
                      prefTagNames.includes(tag.name)
                        ? 'bg-zinc-700 text-zinc-100'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <span>#{tag.name}</span>
                    <span className="text-zinc-500 text-xs">{tag.post_count} posts</span>
                  </button>
                ))
              )
            })()}
          </div>
          <div className="flex justify-center pt-2">
            <button
              onClick={handleSavePreferences}
              disabled={savingPrefs}
              className="px-4 py-2 rounded-lg text-sm text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              {savingPrefs ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
