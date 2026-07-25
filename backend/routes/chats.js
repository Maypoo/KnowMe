import { Router } from 'express'
import { list as listChats, create, unreadTotal, getMessages, sendMessage, editMessage, deleteMessage, markRead } from '../controllers/chats.js'
import auth from '../middleware/auth.js'

const router = Router()

router.get('/chats', auth, listChats)
router.post('/chats', auth, create)
router.get('/chats/unread/total', auth, unreadTotal)
router.get('/chats/:chatId/messages', auth, getMessages)
router.post('/chats/:chatId/messages', auth, sendMessage)
router.patch('/chats/:chatId/messages/:messageId', auth, editMessage)
router.delete('/chats/:chatId/messages/:messageId', auth, deleteMessage)
router.post('/chats/:chatId/read', auth, markRead)

export default router
