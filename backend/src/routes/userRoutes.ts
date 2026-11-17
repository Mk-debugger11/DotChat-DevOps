import express from 'express'
const router = express.Router()
import { userProfile, searchUsers, getAllUsers } from '../controllers/userController.js'
import authMiddleware from '../middleware/authMiddleware.js'
router.use(authMiddleware)

router.get('/', getAllUsers)
router.get('/me', userProfile)
router.get('/search', searchUsers)
export default router
