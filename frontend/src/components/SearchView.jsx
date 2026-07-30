import { ArrowLeft, Search, User, X } from 'lucide-react'
import Avatar from './Avatar'

export default function SearchView({
  searchQuery, setSearchQuery,
  searchResults, setSearchResults,
  searching, setSearching,
  searched, setSearched,
  recentSearches, setRecentSearches,
  handleSearch, handleSearchBack, addToRecentSearches,
  navigate, view, tab, activeChat, chatsView
}) {
  return (
    <div className="lg:ml-64 flex-1 flex flex-col min-h-0 px-6 py-6 lg:justify-center lg:items-center lg:px-0 lg:py-0">
      <div className="flex items-center gap-2 mb-4 lg:w-full lg:max-w-xl lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center">
          <button
            onClick={() => setView('friends')}
            className="rounded-full p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition lg:hidden"
          >
            <ArrowLeft size={20} />
          </button>
          {searched && (
            <button
              onClick={handleSearchBack}
              className="hidden lg:flex rounded-full p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
            >
              <ArrowLeft size={20} />
            </button>
          )}
        </div>
        <h2 className="text-zinc-100 text-lg font-semibold text-center">Buscar</h2>
        <div />
      </div>
      <form onSubmit={handleSearch} className="flex gap-2 mb-6 lg:w-full lg:max-w-xl">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Nombre de usuario..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-zinc-600 transition"
          autoFocus
        />
        <button
          type="submit"
          disabled={searching || searchQuery.length < 1}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Buscar
        </button>
      </form>
      <div className="flex-1 overflow-y-auto lg:w-full lg:max-w-xl lg:flex-none lg:h-[55vh]">
        {searching && (
          <p className="text-zinc-500 text-sm text-center py-8">Buscando...</p>
        )}
        {!searching && searchResults.length > 0 && (
          <div className="space-y-1">
            {searchResults.map(user => (
              <button
                key={user.id}
                onClick={() => { addToRecentSearches(user.username, 'user'); localStorage.setItem('knowme_home_state', JSON.stringify({ view, tab, activeChat, chatsView })); navigate('/' + user.username) }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 transition rounded-lg"
              >
                <Avatar src={user.avatar_url} size={40} />
                <span className="text-sm text-zinc-300">{user.username}</span>
              </button>
            ))}
          </div>
        )}
        {!searching && searched && searchResults.length === 0 && (
          <p className="text-zinc-500 text-sm text-center py-8">Sin resultados</p>
        )}
        {!searching && !searched && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-zinc-500 text-sm font-medium">Búsquedas recientes</h3>
              {recentSearches.length > 0 && (
                <button
                  onClick={() => { localStorage.removeItem('knowme_recent_searches'); setRecentSearches([]) }}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition"
                >
                  Limpiar todo
                </button>
              )}
            </div>
            {recentSearches.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-8">No hay búsquedas recientes</p>
            ) : (
              <div className="space-y-1">
                {recentSearches.map((entry, i) => (
                  <div
                    key={`${entry.type}-${entry.value}-${i}`}
                    className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
                    onClick={() => {
                      setSearchQuery('')
                      setSearchResults([])
                      setSearched(false)
                      if (entry.type === 'user') {
                        localStorage.setItem('knowme_home_state', JSON.stringify({ view, tab, activeChat, chatsView }))
                        navigate('/' + entry.value)
                      } else {
                        const synthetic = { preventDefault: () => {} }
                        handleSearch(synthetic, entry.value)
                      }
                    }}
                  >
                    {entry.type === 'user' ? (
                      <User size={16} className="text-zinc-600 shrink-0" />
                    ) : (
                      <Search size={16} className="text-zinc-600 shrink-0" />
                    )}
                    <span className="flex-1 text-sm text-zinc-400 group-hover:text-zinc-300 transition truncate">{entry.value}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); const prev = JSON.parse(localStorage.getItem('knowme_recent_searches') || '[]'); const next = prev.filter(s => s.value !== entry.value || s.type !== entry.type); localStorage.setItem('knowme_recent_searches', JSON.stringify(next)); setRecentSearches(next) }}
                      className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
