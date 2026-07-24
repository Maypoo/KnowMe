import { Router } from 'express'
import { refresh, logout, deleteAccount, google, setupUsername, me } from '../controllers/auth.js'
import { authLimiter } from '../middleware/rateLimit.js'
import auth from '../middleware/auth.js'

const router = Router()

router.post('/refresh', authLimiter, refresh)
router.post('/logout', authLimiter, logout)
router.post('/delete-account', authLimiter, deleteAccount)
router.post('/google', authLimiter, google)
router.post('/setup-username', authLimiter, setupUsername)
router.get('/me', auth, me)

export default router
