import { Request, Response } from 'express'
import prisma from "../config/db.js"
import { findThread } from "./chatController.js"
import { getIO } from "../socket.js"

export async function messages(req: Request, res: Response): Promise<void> {
  try {
    const userId: string = req.user!.userId
    const { reciever, content, threadId: passedThreadId } = req.body as {
      reciever?: string
      content?: string
      threadId?: string
    }

    if (!content || !content.trim()) {
      res.status(400).json({ message: "Message content cannot be empty" })
      return
    }

    let threadId = passedThreadId
    if (!threadId && reciever) {
      threadId = await findThread(userId, reciever)
    }

    if (!threadId) {
      res.status(400).json({ message: "threadId or reciever is required" })
      return
    }

    const msg = await prisma.message.create({
      data: {
        content: content.trim(),
        senderId: userId,
        threadId: threadId
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                name: true,
                username: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    })

    const io = getIO()
    if (io) {
      io.to(threadId).emit('new_message', msg)
      const participants = await prisma.chatParticipant.findMany({
        where: { threadId },
        select: { userId: true },
      })
      for (const p of participants) {
        io.to(`user_${p.userId}`).emit('thread_updated', {
          threadId,
          lastMessage: msg,
        })
      }
    }

    res.status(201).json({
      message: "message created",
      data: msg
    })
  } catch (error) {
    console.error("Message create error:", error)
    res.status(500).json({
      message: "Something went wrong",
      error: error
    })
  }
}

export async function getMessage(req: Request, res: Response): Promise<void> {
  try {
    const { threadId } = req.params as { threadId: string }
    const isParticipant = await prisma.chatParticipant.findFirst({
      where: {
        userId: req.user!.userId,
        threadId: threadId
      }
    })
    if (!isParticipant) {
      res.status(401).json({
        "message": "Unauthorised"
      })
      return
    }
    const data = await prisma.message.findMany({
      where: { threadId },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                name: true,
                username: true,
                avatarUrl: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    })
    res.status(200).json({
      "message": "request successfull",
      data: data
    })
  } catch (error) {
    console.log(error)
    res.status(500).json({
      "message": "Something went wrong"
    })
  }
}

export async function markThreadRead(req: Request, res: Response): Promise<void> {
  try {
    const userId: string = req.user!.userId
    const { threadId } = req.params as { threadId: string }

    if (!threadId) {
      res.status(400).json({ message: "threadId is required" })
      return
    }

    // Verify user is a participant
    const isParticipant = await prisma.chatParticipant.findFirst({
      where: {
        userId,
        threadId,
      },
    })

    if (!isParticipant) {
      res.status(403).json({ message: "Unauthorized" })
      return
    }

    // Update unread messages sent by other participants
    await prisma.message.updateMany({
      where: {
        threadId,
        senderId: { not: userId },
        isRead: false,
      },
      data: {
        isRead: true,
      },
    })

    const io = getIO()
    if (io) {
      // Broadcast real-time read receipt to thread room
      io.to(threadId).emit('messages_read', {
        threadId,
        readerId: userId,
      })

      // Notify all participants' personal rooms so sidebars clear unread badge and checkmarks turn blue
      const participants = await prisma.chatParticipant.findMany({
        where: { threadId },
        select: { userId: true },
      })

      for (const p of participants) {
        io.to(`user_${p.userId}`).emit('messages_read', {
          threadId,
          readerId: userId,
        })
        io.to(`user_${p.userId}`).emit('thread_read', {
          threadId,
          readerId: userId,
        })
      }
    }

    res.status(200).json({
      message: "Messages marked as read",
      threadId,
    })
  } catch (error) {
    console.error("markThreadRead error:", error)
    res.status(500).json({ message: "Something went wrong" })
  }
}

