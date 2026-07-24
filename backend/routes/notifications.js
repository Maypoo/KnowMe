import { Router } from 'express'
import { list, unreadCount, markRead, clear } from '../controllers/notifications.js'
import auth from '../middleware/auth.js'

const router = Router()

router.get('/notifications', auth, list)
router.get('/notifications/unread/count', auth, unreadCount)
router.post('/notifications/read', auth, markRead)
router.delete('/notifications', auth, clear)

export default router
