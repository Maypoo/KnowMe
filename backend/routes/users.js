import { Router } from 'express'
import { search } from '../controllers/users.js'
import auth from '../middleware/auth.js'

const router = Router()

router.get('/users/search', auth, search)

export default router
