import { Router } from 'express'
import { create, remove, getMine, feed, friendsFeed, like, unlike, getUserPosts, getById, getTags, updateTags, getLikes } from '../controllers/posts.js'
import auth from '../middleware/auth.js'

const router = Router()

router.post('/posts', auth, create)
router.delete('/posts', auth, remove)
router.get('/posts/mine', auth, getMine)
router.get('/posts/feed', auth, feed)
router.get('/posts/friends-feed', auth, friendsFeed)
router.post('/posts/:id/like', auth, like)
router.post('/posts/:id/unlike', auth, unlike)
router.get('/posts/user/:username', auth, getUserPosts)
router.get('/posts/:id/likes', auth, getLikes)
router.get('/posts/:id', auth, getById)
router.get('/posts/:id/tags', auth, getTags)
router.put('/posts/:id/tags', auth, updateTags)

export default router
