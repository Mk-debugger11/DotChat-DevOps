import { Request, Response } from 'express'
import prisma from "../config/db.js"

export async function findThread(userA: string, userB: string): Promise<string> {
    // we have to find a thread where both the participants are there
    const isExist = await prisma.chatParticipant.findFirst({
        where: {
            userId: userA,
            thread: {
                participants: {
                    some: {
                        userId: userB
                    }
                }
            }
        }
    })
    if (isExist) {
        return isExist.threadId
    }

    const userBExists = await prisma.user.findUnique({ where: { id: userB } })
    if (!userBExists) {
        throw new Error("Participant user does not exist")
    }

    const thread = await prisma.chatThread.create({
        data: {}
    })
    await prisma.chatParticipant.createMany({
        data: [
            { userId: userA, threadId: thread.id },
            { userId: userB, threadId: thread.id }
        ],
        // skipDuplicates:true //this is used to prevent race condition such that both user create simultaneously which will throw error
    })
    return thread.id
}

export async function threads(req: Request, res: Response): Promise<void> {
    try {
        const userId: string = req.user!.userId
        const participants = await prisma.chatParticipant.findMany({
            where: {
                userId
            },
            include: {
                thread: {
                    include: {
                        participants: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        email: true,
                                        profile: true
                                    }
                                }
                            }
                        },
                        messages: {
                            orderBy: {
                                createdAt: 'desc'
                            },
                            take: 1
                        }
                    }
                }
            }
        })
        // Calculate unread message count for each thread
        const results = await Promise.all(
            participants.map(async (p) => {
                const unreadCount = await prisma.message.count({
                    where: {
                        threadId: p.threadId,
                        senderId: { not: userId },
                        isRead: false
                    }
                })
                return {
                    ...p,
                    unreadCount
                }
            })
        )

        // Sort threads by most recent message or thread creation
        results.sort((a, b) => {
            const timeA = a.thread.messages[0]?.createdAt
                ? new Date(a.thread.messages[0].createdAt).getTime()
                : new Date(a.thread.createdAt).getTime()
            const timeB = b.thread.messages[0]?.createdAt
                ? new Date(b.thread.messages[0].createdAt).getTime()
                : new Date(b.thread.createdAt).getTime()
            return timeB - timeA
        })

        res.status(200).json({
            data: results
        })
    } catch (error) {
        console.error("Error fetching threads:", error)
        res.status(500).json({ message: "Something went wrong" })
    }
}

export async function createOrGetThread(req: Request, res: Response): Promise<void> {
    try {
        const userId: string = req.user!.userId
        const { participantId } = req.body as { participantId?: string }
        if (!participantId) {
            res.status(400).json({ message: "participantId is required" })
            return
        }
        const threadId = await findThread(userId, participantId)
        res.status(200).json({ threadId })
    } catch (error) {
        console.error("Error creating/getting thread:", error)
        res.status(500).json({ message: "Something went wrong" })
    }
}
