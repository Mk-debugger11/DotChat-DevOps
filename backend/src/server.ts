import http from 'http'
import { Server } from 'socket.io'
import app, { allowedOrigins, isOriginAllowed } from './app.js'
import { createClient } from 'redis'
import { createAdapter } from '@socket.io/redis-adapter'
import { initSocketServer } from './socket.js'
import prisma from './config/db.js'
import { startMetricsServer } from './metrics.js'

// 1. Validate required environment variables on startup
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET_KEY']
const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v])

if (missingEnvVars.length > 0) {
  console.error(
    `FATAL: Missing required environment variables: ${missingEnvVars.join(', ')}`
  )
  console.error('Please configure them in your environment or .env file before running.')
  process.exit(1)
}

const PORT = process.env.PORT || 8080

const httpServer = http.createServer(app)

// 2. Dynamic Socket.IO CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true)
      }
      return callback(new Error(`Socket CORS blocked for origin: ${origin}`), false)
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

// 3. Horizontal scaling: with REDIS_URL set, Socket.IO events are relayed between all
// backend replicas through Redis pub/sub, so a message sent to pod A reaches users on pod B.
type RedisClient = ReturnType<typeof createClient>
let redisClients: RedisClient[] = []

if (process.env.REDIS_URL) {
  const pubClient = createClient({ url: process.env.REDIS_URL })
  const subClient = pubClient.duplicate()
  pubClient.on('error', (err) => console.error('Redis pub error:', err.message))
  subClient.on('error', (err) => console.error('Redis sub error:', err.message))
  await Promise.all([pubClient.connect(), subClient.connect()])
  io.adapter(createAdapter(pubClient, subClient))
  redisClients = [pubClient, subClient]
  console.log('🔁 Socket.IO Redis adapter enabled (multi-replica mode)')
}

initSocketServer(io)

const metricsServer = startMetricsServer(Number(process.env.METRICS_PORT || 9464))

httpServer.listen(PORT, () => {
  console.log(
    `🚀 DotChat Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`
  )
  console.log(`Allowed CORS origins:`, allowedOrigins)
})

// 4. Graceful Shutdown Handler (Docker, Kubernetes, Render, Railway, Systemd)
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Initiating graceful shutdown...`)

  httpServer.close(async () => {
    console.log('HTTP server closed.')
    try {
      io.close()
      console.log('Socket.IO connections closed.')
      metricsServer.close()
      await Promise.all(redisClients.map((c) => c.quit().catch(() => undefined)))
      await prisma.$disconnect()
      console.log('Prisma database disconnected.')
      process.exit(0)
    } catch (err) {
      console.error('Error during shutdown:', err)
      process.exit(1)
    }
  })

  setTimeout(() => {
    console.error('Forcefully shutting down after timeout.')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
