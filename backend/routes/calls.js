import { Router } from 'express'
import { offer, answer, iceCandidate, end, missed } from '../controllers/calls.js'
import auth from '../middleware/auth.js'

const router = Router()

router.post('/calls/offer', auth, offer)
router.post('/calls/answer', auth, answer)
router.post('/calls/ice-candidate', auth, iceCandidate)
router.post('/calls/end', auth, end)
router.post('/calls/missed', auth, missed)

export default router
