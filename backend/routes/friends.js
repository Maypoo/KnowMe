import { Router } from 'express'
import { request, listRequests, requestsCount, respond, list, pending, remove, cancelRequest, getUserFriends } from '../controllers/friends.js'
import auth from '../middleware/auth.js'

const router = Router()

router.post('/friends/request', auth, request)
router.get('/friends/requests', auth, listRequests)
router.get('/friends/requests/count', auth, requestsCount)
router.post('/friends/respond', auth, respond)
router.get('/friends', auth, list)
router.get('/friends/pending', auth, pending)
router.delete('/friends/:friendId', auth, remove)
router.delete('/friends/request/:requestId', auth, cancelRequest)
router.get('/friends/:username', auth, getUserFriends)

export default router
