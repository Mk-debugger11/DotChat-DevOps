import express from 'express'
const router = express.Router()
import { messages, getMessage, markThreadRead } from '../controllers/messageController.js'
import authMiddleware from '../middleware/authMiddleware.js'
router.use(authMiddleware)

router.post('/', messages)
router.get('/:threadId', getMessage)
router.post('/read/:threadId', markThreadRead)

export default router
