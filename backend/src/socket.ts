import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import prisma from './config/db.js'
import { socketConnections, messagesSentTotal } from './metrics.js'

interface JwtPayload {
  userId: string
}

let ioInstance: Server | null = null

// Cluster-wide presence: fetchSockets() goes through the adapter, so with the Redis
// adapter it returns sockets from EVERY backend replica, not just this pod.
async function getOnlineUserIds(io: Server): Promise<string[]> {
  const sockets = await io.fetchSockets()
  return [...new Set(sockets.map((s) => s.data.userId as string))]
}

async function userConnectionCount(io: Server, userId: string): Promise<number> {
  return (await io.in(`user_${userId}`).fetchSockets()).length
}

export function initSocketServer(io: Server): void {
  ioInstance = io

  // 1. Authenticate Socket Connection via JWT
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization
        ? socket.handshake.headers.authorization.split(' ')[1]
        : null)

    if (!token) {
      return next(new Error('Authentication error: Token missing'))
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET_KEY as string
      ) as JwtPayload
      socket.data.userId = decoded.userId
      next()
    } catch {
      return next(new Error('Authentication error: Invalid or expired token'))
    }
  })

  // 2. Handle Socket Events
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId
    socketConnections.inc()

    // Automatically join user-specific notification room
    socket.join(`user_${userId}`)

    // Presence (async, cluster-wide). Event listeners below are registered synchronously
    // so no client events are missed while this runs.
    ;(async () => {
      try {
        // Broadcast online status if this is the user's first active connection anywhere
        if ((await userConnectionCount(io, userId)) === 1) {
          io.emit('user_status_changed', { userId, status: 'online' })
        }
        // Send the current list of online user IDs to the connected client
        socket.emit('online_users', await getOnlineUserIds(io))
      } catch (err) {
        console.error('presence error:', err)
      }
    })()

    // Allow explicit fetch of online users
    socket.on('get_online_users', async (callback?: (users: string[]) => void) => {
      if (callback) {
        try {
          callback(await getOnlineUserIds(io))
        } catch {
          callback([])
        }
      }
    })

    // Join a specific chat thread room
    socket.on('join_thread', async (data: { threadId: string }, callback) => {
      try {
        const { threadId } = data
        if (!threadId) {
          if (callback) callback({ error: 'threadId is required' })
          return
        }

        // Authorization: Verify user is a participant of this thread
        const isParticipant = await prisma.chatParticipant.findFirst({
          where: {
            userId: userId,
            threadId: threadId,
          },
        })

        if (!isParticipant) {
          if (callback)
            callback({
              error: 'Unauthorized: You are not a participant in this chat',
            })
          return
        }

        socket.join(threadId)
        if (callback) callback({ success: true })
      } catch (err) {
        console.error('join_thread error:', err)
        if (callback) callback({ error: 'Failed to join thread' })
      }
    })

    // Leave a specific chat thread room
    socket.on('leave_thread', (data: { threadId: string }) => {
      if (data?.threadId) {
        socket.leave(data.threadId)
      }
    })

    // Typing Indicators: Start typing in thread
    socket.on('typing_start', (data: { threadId: string }) => {
      if (data?.threadId) {
        socket.to(data.threadId).emit('user_typing', {
          threadId: data.threadId,
          userId: userId,
        })
      }
    })

    // Typing Indicators: Stop typing in thread
    socket.on('typing_stop', (data: { threadId: string }) => {
      if (data?.threadId) {
        socket.to(data.threadId).emit('user_stop_typing', {
          threadId: data.threadId,
          userId: userId,
        })
      }
    })

    // Read Receipts: Mark messages in thread as read
    socket.on('mark_read', async (data: { threadId: string }) => {
      try {
        if (!data?.threadId) return
        const { threadId } = data

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

        // Find all participants of this thread
        const participants = await prisma.chatParticipant.findMany({
          where: { threadId },
          select: { userId: true },
        })

        // Broadcast to thread room
        io.to(threadId).emit('messages_read', {
          threadId,
          readerId: userId,
        })

        // ALSO broadcast to every participant's personal room for guaranteed real-time delivery
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
      } catch (err) {
        console.error('mark_read socket error:', err)
      }
    })

    // Send a message via WebSocket
    socket.on(
      'send_message',
      async (
        data: { threadId: string; content: string },
        callback?: (res: { success: boolean; data?: unknown; error?: string }) => void
      ) => {
        try {
          const { threadId, content } = data

          // Validation
          if (!content || !content.trim() || !threadId) {
            if (callback)
              callback({ success: false, error: 'Invalid message content or threadId' })
            return
          }

          // Authorization: Verify user belongs to the thread
          const isParticipant = await prisma.chatParticipant.findFirst({
            where: {
              userId: userId,
              threadId: threadId,
            },
          })

          if (!isParticipant) {
            if (callback)
              callback({
                success: false,
                error: 'Unauthorized: You are not a participant in this chat',
              })
            return
          }

          // Persist message in MongoDB via Prisma
          const message = await prisma.message.create({
            data: {
              content: content.trim(),
              senderId: userId,
              threadId: threadId,
              isRead: false,
              readBy: [userId],
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
                      avatarUrl: true,
                    },
                  },
                },
              },
            },
          })

          messagesSentTotal.inc()

          // Real-time broadcast to all participants in this thread room and personal rooms
          io.to(threadId).emit('new_message', message)

          const participants = await prisma.chatParticipant.findMany({
            where: { threadId },
            select: { userId: true },
          })

          for (const p of participants) {
            io.to(`user_${p.userId}`).emit('new_message', message)
            io.to(`user_${p.userId}`).emit('thread_updated', {
              threadId,
              lastMessage: message,
            })
          }

          if (callback) callback({ success: true, data: message })
        } catch (err) {
          console.error('send_message socket error:', err)
          if (callback)
            callback({ success: false, error: 'Failed to save and send message' })
        }
      }
    )

    socket.on('disconnect', async () => {
      socketConnections.dec()
      try {
        // Socket has already left its rooms here; 0 means no tabs/devices remain on any pod
        if ((await userConnectionCount(io, userId)) === 0) {
          io.emit('user_status_changed', { userId, status: 'offline' })
        }
      } catch (err) {
        console.error('presence error:', err)
      }
    })
  })
}

export function getIO(): Server | null {
  return ioInstance
}
