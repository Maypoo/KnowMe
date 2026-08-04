import { Heart, Trash2, Settings, Edit } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import TagSelectorModal from './TagSelectorModal'

export default function CreatePostView({
  postContent, setPostContent,
  editing,
  publishing, myPost, postLikes,
  selectedTagNames,
  tagSelectorOpen, setTagSelectorOpen,
  handlePublish, handleSaveTags,
  handleEdit, handleCancel,
  setConfirmingDelete
}) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="w-full max-w-md flex flex-col items-center gap-4 h-60">
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
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none transition h-32"
          style={myPost && !editing ? { borderColor: '#52525b', opacity: 0.5 } : undefined}
          readOnly={!!myPost && !editing}
          maxLength={300}
        />
        {selectedTagNames.length > 0 && (
          <div className="w-full flex items-center gap-2 flex-wrap">
            {selectedTagNames.map(name => (
              <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-medium text-zinc-200 bg-zinc-700">
                <span>#{name}</span>
              </span>
            ))}
          </div>
        )}
        <div className="w-full flex items-center justify-between">
          <span className="text-zinc-500 text-sm">{postContent.length}/300</span>
          <div className="flex items-center gap-2">
            {myPost && !editing && (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="rounded-lg p-2 transition hover:opacity-80"
                style={{ backgroundColor: '#ef4444' }}
              >
                <Trash2 size={18} strokeWidth={2.5} />
              </button>
            )}
            {myPost && !editing && (
              <button
                onClick={() => setTagSelectorOpen(true)}
                className="rounded-lg p-2 transition hover:opacity-80"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                <Settings size={18} strokeWidth={2.5} />
              </button>
            )}
            {myPost && !editing && (
              <button
                onClick={handleEdit}
                className="rounded-lg p-2 transition hover:opacity-80"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                <Edit size={18} strokeWidth={2.5} />
              </button>
            )}
            {editing && (
              <button
                onClick={handleCancel}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={handlePublish}
              disabled={!!myPost && !editing || publishing || !postContent.trim() || editing && postContent.trim() === myPost?.content}
              className="px-6 py-2 rounded-lg text-white font-medium transition"
              style={{
                backgroundColor: !postContent.trim() ? '#3f3f46' : 'var(--color-accent)',
                opacity: !editing && !!myPost || editing && postContent.trim() === myPost?.content ? 0.5 : 1,
                cursor: !postContent.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {publishing ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </div>
        <div className="w-full flex items-center gap-1.5 text-zinc-400 text-sm">
          <Heart size={14} strokeWidth={2} className="text-red-400" fill="#f87171" />
          <NumberFlow value={postLikes} suffix={` like${postLikes !== 1 ? 's' : ''}`} />
        </div>
        <TagSelectorModal
          open={tagSelectorOpen}
          onClose={() => setTagSelectorOpen(false)}
          selected={selectedTagNames}
          onSave={handleSaveTags}
        />
      </div>
    </div>
  )
}
