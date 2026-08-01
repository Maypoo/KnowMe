import { Router } from 'express'
import { block, unblock, listBlocks } from '../controllers/blocks.js'
import auth from '../middleware/auth.js'

const router = Router()

router.get('/blocks', auth, listBlocks)
router.post('/blocks/:username', auth, block)
router.delete('/blocks/:username', auth, unblock)

export default router
