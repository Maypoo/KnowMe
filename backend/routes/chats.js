import { Router } from 'express'
import { list as listChats, create, createGroup, unreadTotal, getMessages, sendMessage, editMessage, deleteMessage, markRead, updateGroup, addMembers, promoteAdmin, leaveGroup } from '../controllers/chats.js'
import auth from '../middleware/auth.js'

const router = Router()

router.get('/chats', auth, listChats)
router.post('/chats', auth, create)
router.post('/chats/group', auth, createGroup)
router.get('/chats/unread/total', auth, unreadTotal)
router.get('/chats/:chatId/messages', auth, getMessages)
router.post('/chats/:chatId/messages', auth, sendMessage)
router.patch('/chats/:chatId/messages/:messageId', auth, editMessage)
router.delete('/chats/:chatId/messages/:messageId', auth, deleteMessage)
router.post('/chats/:chatId/read', auth, markRead)
router.patch('/chats/:chatId', auth, updateGroup)
router.post('/chats/:chatId/members', auth, addMembers)
router.post('/chats/:chatId/admins', auth, promoteAdmin)
router.delete('/chats/:chatId/leave', auth, leaveGroup)

export default router
