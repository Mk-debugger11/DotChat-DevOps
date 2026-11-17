import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import {
  createGroup,
  getGroups,
  getGroupDetails,
} from '../controllers/groupController.js'

const router = express.Router()

router.use(authMiddleware)

router.post('/', createGroup)
router.get('/', getGroups)
router.get('/:id', getGroupDetails)

export default router
