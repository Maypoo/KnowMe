import { Router } from 'express'
import { follow, unfollow, getFollowers } from '../controllers/follow.js'
import auth from '../middleware/auth.js'

const router = Router()

router.post('/follow/:username', auth, follow)
router.delete('/follow/:username', auth, unfollow)
router.get('/followers/:username', auth, getFollowers)

export default router
