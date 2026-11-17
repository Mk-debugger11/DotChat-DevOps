import { Request, Response } from 'express'
import prisma from '../config/db.js'
import { getIO } from '../socket.js'

export async function createGroup(req: Request, res: Response): Promise<void> {
  try {
    const currentUserId: string = req.user!.userId
    const { name, memberIds } = req.body as {
      name?: string
      memberIds?: string[]
    }

    if (!name || !name.trim()) {
      res.status(400).json({ message: 'Group name is required' })
      return
    }

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      res.status(400).json({ message: 'At least one group member must be selected' })
      return
    }

    // Ensure all memberIds exist in database
    const validUsers = await prisma.user.findMany({
      where: {
        id: { in: memberIds },
      },
      select: { id: true },
    })

    if (validUsers.length !== memberIds.length) {
      res.status(400).json({ message: 'One or more selected members do not exist' })
      return
    }

    // Unique participants including the creator
    const allParticipantIds = Array.from(new Set([currentUserId, ...memberIds]))

    const groupThread = await prisma.chatThread.create({
      data: {
        isGroup: true,
        name: name.trim(),
        adminId: currentUserId,
        participants: {
          create: allParticipantIds.map((userId) => ({ userId })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: true,
              },
            },
          },
        },
        messages: {
          take: 1,
        },
      },
    })

    // Notify other participants in real time via Socket.IO
    const io = getIO()
    if (io) {
      for (const uid of allParticipantIds) {
        if (uid !== currentUserId) {
          io.to(`user_${uid}`).emit('group_created', groupThread)
        }
      }
    }

    res.status(201).json({
      message: 'Group created successfully',
      data: groupThread,
    })
  } catch (error) {
    console.error('Create group error:', error)
    res.status(500).json({ message: 'Failed to create group' })
  }
}

export async function getGroups(req: Request, res: Response): Promise<void> {
  try {
    const currentUserId: string = req.user!.userId

    const groups = await prisma.chatThread.findMany({
      where: {
        isGroup: true,
        participants: {
          some: {
            userId: currentUserId,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    })

    // Sort by latest message or thread creation
    groups.sort((a, b) => {
      const timeA = a.messages[0]?.createdAt
        ? new Date(a.messages[0].createdAt).getTime()
        : new Date(a.createdAt).getTime()
      const timeB = b.messages[0]?.createdAt
        ? new Date(b.messages[0].createdAt).getTime()
        : new Date(b.createdAt).getTime()
      return timeB - timeA
    })

    res.status(200).json({ data: groups })
  } catch (error) {
    console.error('Get groups error:', error)
    res.status(500).json({ message: 'Failed to fetch groups' })
  }
}

export async function getGroupDetails(req: Request, res: Response): Promise<void> {
  try {
    const currentUserId: string = req.user!.userId
    const { id } = req.params as { id: string }

    const group = await prisma.chatThread.findFirst({
      where: {
        id,
        isGroup: true,
        participants: {
          some: {
            userId: currentUserId,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: true,
              },
            },
          },
        },
      },
    })

    if (!group) {
      res.status(404).json({ message: 'Group not found or unauthorized' })
      return
    }

    res.status(200).json({ data: group })
  } catch (error) {
    console.error('Get group details error:', error)
    res.status(500).json({ message: 'Failed to fetch group details' })
  }
}
