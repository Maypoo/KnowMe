import { ArrowLeft, Search, User, X } from 'lucide-react'
import { motion } from 'framer-motion'
import Avatar from './Avatar'

export default function SearchView({
  searchQuery, setSearchQuery,
  searchResults, setSearchResults,
  searching, setSearching,
  searched, setSearched,
  recentSearches, setRecentSearches,
  handleSearch, handleSearchBack, addToRecentSearches,
  navigate, setView, view, tab, activeChat, chatsView
}) {
  return (
    <div className="lg:ml-[296px] flex-1 flex flex-col min-h-0 px-6 py-6 lg:justify-center lg:items-center lg:px-0 lg:py-0 xl:relative xl:left-[-148px]">
      <div className="flex items-center gap-2 mb-4 lg:w-full lg:max-w-xl lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setView('friends')} className="rounded-full p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition lg:hidden tap-highlight">
            <ArrowLeft size={20} />
          </motion.button>
          {searched && (
            <motion.button whileTap={{ scale: 0.9 }} onClick={handleSearchBack} className="hidden lg:flex rounded-full p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition tap-highlight">
              <ArrowLeft size={20} />
            </motion.button>
          )}
        </div>
        <h2 className="text-zinc-100 text-[17px] font-semibold tracking-[-0.015em] text-center">Buscar</h2>
        <div />
      </div>
      <form onSubmit={handleSearch} className="flex gap-2 mb-6 lg:w-full lg:max-w-xl">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Nombre de usuario..."
          className="flex-1 bg-zinc-800/80 border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-zinc-100 placeholder-zinc-500 text-[15px] tracking-[-0.011em] focus:outline-none focus:border-[var(--color-accent)]/30 transition-colors"
          autoFocus
        />
        <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={searching || searchQuery.length < 1} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm tap-highlight">Buscar</motion.button>
      </form>
      <div className="flex-1 overflow-y-auto lg:w-full lg:max-w-xl lg:flex-none lg:h-[55vh]">
        {searching && <p className="text-zinc-500 text-sm text-center py-8">Buscando...</p>}
        {!searching && searchResults.length > 0 && (
          <div className="space-y-1">
            {searchResults.map(user => (
              <motion.button
                key={user.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => { addToRecentSearches(user.username, 'user'); localStorage.setItem('knowme_home_state', JSON.stringify({ view, tab, activeChat, chatsView })); navigate('/' + user.username) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.06] transition-colors rounded-xl text-left tap-highlight"
              >
                <Avatar src={user.avatar_url} size={36} />
                <span className="text-sm text-zinc-200 tracking-[-0.011em] font-medium">{user.username}</span>
              </motion.button>
            ))}
          </div>
        )}
        {!searching && searched && searchResults.length === 0 && <p className="text-zinc-500 text-sm text-center py-8">Sin resultados</p>}
        {!searching && !searched && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-zinc-500 text-xs font-semibold tracking-[0.04em] uppercase">Búsquedas recientes</h3>
              {recentSearches.length > 0 && (
                <button onClick={() => { localStorage.removeItem('knowme_recent_searches'); setRecentSearches([]) }} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Limpiar todo</button>
              )}
            </div>
            {recentSearches.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-8">No hay búsquedas recientes</p>
            ) : (
              <div className="space-y-1">
                {recentSearches.map((entry, i) => (
                  <div key={`${entry.type}-${entry.value}-${i}`} className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer tap-highlight" onClick={() => {
                    setSearchQuery(''); setSearchResults([]); setSearched(false)
                    if (entry.type === 'user') { localStorage.setItem('knowme_home_state', JSON.stringify({ view, tab, activeChat, chatsView })); navigate('/' + entry.value) }
                    else { const synthetic = { preventDefault: () => {} }; handleSearch(synthetic, entry.value) }
                  }}>
                    {entry.type === 'user' ? <User size={16} className="text-zinc-500 shrink-0" /> : <Search size={16} className="text-zinc-500 shrink-0" />}
                    <span className="flex-1 text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors truncate tracking-[-0.011em]">{entry.value}</span>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); const prev = JSON.parse(localStorage.getItem('knowme_recent_searches') || '[]'); const next = prev.filter(s => s.value !== entry.value || s.type !== entry.type); localStorage.setItem('knowme_recent_searches', JSON.stringify(next)); setRecentSearches(next) }} className="w-7 h-7 rounded-full bg-transparent hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors">
                      <X size={14} />
                    </motion.button>
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
