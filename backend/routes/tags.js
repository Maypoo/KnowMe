import { Router } from 'express'
import { resolve, list } from '../controllers/tags.js'
import auth from '../middleware/auth.js'

const router = Router()

router.post('/tags/resolve', auth, resolve)
router.get('/tags', auth, list)

export default router
