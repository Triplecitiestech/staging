'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DeleteBlogPostButtonProps {
  postId: string
  postTitle: string
}

export default function DeleteBlogPostButton({ postId, postTitle }: DeleteBlogPostButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/blog/posts/${postId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete post')
      }

      // Refresh the page to show updated list
      router.refresh()
      setShowConfirm(false)
    } catch (error) {
      console.error('Error deleting post:', error)
      alert('Failed to delete post. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  if (showConfirm) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowConfirm(false)}>
        <div className="bg-slate-800 border border-white/10 rounded-lg p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-bold text-white mb-2">Delete Blog Post?</h3>
          <p className="text-slate-300 mb-4">
            Are you sure you want to delete <strong>"{postTitle}"</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={isDeleting}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="text-sm text-slate-400 hover:text-red-400 transition-colors"
      title="Delete"
    >
      🗑️
    </button>
  )
}
