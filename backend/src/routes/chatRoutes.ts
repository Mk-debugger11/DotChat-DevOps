import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
const router = express.Router()
import { threads, createOrGetThread } from '../controllers/chatController.js'
router.use(authMiddleware)

router.get('/', threads)
router.post('/', createOrGetThread)

export default router
