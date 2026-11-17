import express, { Request, Response } from 'express'
const router = express.Router()
import { register, login, googleLogin } from '../controllers/authController.js'
import authMiddleware from '../middleware/authMiddleware.js'

router.get('/me', authMiddleware, (_req: Request, res: Response) => {
    res.status(200).json({
        "message": "Req is valid"
    })
})
router.post('/signup', register)
router.post('/login', login)
router.post('/google', googleLogin)

export default router
