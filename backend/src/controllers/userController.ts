import { Request, Response } from 'express'
import prisma from "../config/db.js"

export async function getAllUsers(req: Request, res: Response): Promise<void> {
    try {
        const currentUserId: string = req.user!.userId
        const users = await prisma.userProfile.findMany({
            where: {
                userId: { not: currentUserId }
            },
            take: 30,
            select: {
                userId: true,
                username: true,
                name: true,
                avatarUrl: true
            }
        })
        res.status(200).json({ data: users })
    } catch {
        res.status(500).json({ message: "Something went wrong" })
    }
}

export async function userProfile(req: Request, res: Response): Promise<void> {
    try {
        const userId: string = req.user!.userId
        
        const data = await prisma.user.findUnique({
            where: {
                id: userId
            },
            include: {
                profile: true
            }
        })
        res.status(200).json({
            profile: data
        })
    } catch {
        res.status(500).json({ "message": "Something went wrong" })
    }
}

export async function searchUsers(req: Request, res: Response): Promise<void> {
    try {
        const { q } = req.query as { q?: string }
        if (!q) {
            res.status(400).json({ message: "Search query 'q' is required" })
            return
        }

        // Exclude the current user from search results
        const currentUserId = req.user!.userId

        const users = await prisma.userProfile.findMany({
            where: {
                username: {
                    startsWith: q,
                    mode: 'insensitive' // case-insensitive search
                },
                userId: {
                    not: currentUserId
                }
            },
            take: 10,
            select: {
                userId: true,
                username: true,
                name: true,
                avatarUrl: true
            }
        })

        res.status(200).json({ data: users })
    } catch (error) {
        console.error("Search error:", error)
        res.status(500).json({ message: "Something went wrong during search" })
    }
}
