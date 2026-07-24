import { Router } from 'express'
import { getTags, updateTags } from '../controllers/preferences.js'
import auth from '../middleware/auth.js'

const router = Router()

router.get('/preferences/tags', auth, getTags)
router.put('/preferences/tags', auth, updateTags)

export default router
