import { Heart, Trash2, Settings, Edit } from 'lucide-react'
import { motion } from 'framer-motion'
import NumberFlow from '@number-flow/react'
import TagSelectorModal from './TagSelectorModal'
import LikesList from './LikesList'

export default function CreatePostView({
  postContent, setPostContent,
  editing,
  publishing, myPost, postLikes,
  selectedTagNames,
  tagSelectorOpen, setTagSelectorOpen,
  handlePublish, handleSaveTags,
  handleEdit, handleCancel,
  setConfirmingDelete,
  likesOpen, setLikesOpen
}) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 xl:relative xl:left-[-148px]">
      <div className="w-full max-w-md flex flex-col items-center gap-4">
        <textarea
          value={postContent}
          onChange={(e) => {
            let value = e.target.value.replace(/\r\n?/g, '\n')
            const lines = value.split('\n')
            if (lines.length > 10) value = lines.slice(0, 10).join('\n')
            value = value.replace(/\n{3,}/g, '\n\n')
            setPostContent(value.slice(0, 300))
          }}
          placeholder="Escribí tus intereses actuales."
          className="w-full material-thin rounded-2xl p-4 text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-[var(--color-accent)]/40 focus:bg-white/[0.04] transition-colors h-32 text-[15px] leading-relaxed tracking-[-0.011em]"
          style={myPost && !editing ? { opacity: 0.5 } : undefined}
          readOnly={!!myPost && !editing}
          maxLength={300}
        />
        {selectedTagNames.length > 0 && (
          <div className="w-full flex items-center gap-1.5 flex-wrap">
            {selectedTagNames.map(name => (
              <span key={name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-zinc-200 bg-white/[0.08] border border-white/[0.06]">
                <span>#{name}</span>
              </span>
            ))}
          </div>
        )}
        <div className="w-full flex items-center justify-between">
          <span className="text-zinc-500 text-xs font-medium tabular-nums">{postContent.length}/300</span>
          <div className="flex items-center gap-2">
            {myPost && !editing && (
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => setConfirmingDelete(true)} className="rounded-xl p-2.5 bg-red-500 text-white shadow-sm tap-highlight">
                <Trash2 size={16} strokeWidth={2.5} />
              </motion.button>
            )}
            {myPost && !editing && (
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => setTagSelectorOpen(true)} className="rounded-xl p-2.5 bg-[var(--color-accent)] text-white shadow-sm tap-highlight">
                <Settings size={16} strokeWidth={2.5} />
              </motion.button>
            )}
            {myPost && !editing && (
              <motion.button whileTap={{ scale: 0.93 }} onClick={handleEdit} className="rounded-xl p-2.5 bg-[var(--color-accent)] text-white shadow-sm tap-highlight">
                <Edit size={16} strokeWidth={2.5} />
              </motion.button>
            )}
            {editing && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleCancel} className="bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 rounded-xl px-4 py-2 text-sm font-medium transition-colors tap-highlight">Cancelar</motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handlePublish}
              disabled={!!myPost && !editing || publishing || !postContent.trim() || editing && postContent.trim() === myPost?.content}
              className="px-6 py-2 rounded-xl text-white font-semibold text-sm shadow-sm tap-highlight disabled:opacity-40"
              style={{ backgroundColor: !postContent.trim() ? '#3f3f46' : 'var(--color-accent)' }}
            >
              {publishing ? 'Publicando...' : 'Publicar'}
            </motion.button>
          </div>
        </div>
        <div className="w-full flex items-center gap-1.5 text-zinc-400 text-sm">
          <button onClick={() => setLikesOpen(true)} disabled={!myPost} className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors disabled:cursor-not-allowed tap-highlight">
            <Heart size={14} strokeWidth={2} className="text-red-400" fill="#f87171" />
            <NumberFlow value={postLikes} suffix={` like${postLikes !== 1 ? 's' : ''}`} />
          </button>
        </div>
        {likesOpen && myPost && <LikesList postId={myPost.id} onClose={() => setLikesOpen(false)} />}
        <TagSelectorModal open={tagSelectorOpen} onClose={() => setTagSelectorOpen(false)} selected={selectedTagNames} onSave={handleSaveTags} />
      </div>
    </div>
  )
}
