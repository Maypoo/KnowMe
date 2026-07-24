import { Router } from 'express'
import { getByUsername, update, avatar, checkUsername } from '../controllers/profile.js'
import auth from '../middleware/auth.js'

const router = Router()

router.get('/profile/:username', auth, getByUsername)
router.patch('/profile', auth, update)
router.post('/avatar', auth, avatar)
router.get('/username/check', checkUsername)

export default router
