import express, { Request, Response, NextFunction } from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import authRouter from './routes/authRoutes.js'
import userRouter from './routes/userRoutes.js'
import chatRouter from './routes/chatRoutes.js'
import messageRouter from './routes/messageRoutes.js'
import groupRouter from './routes/groupRoutes.js'
import prisma from './config/db.js'
import { metricsMiddleware } from './metrics.js'

dotenv.config()

const app = express()

// Behind the Kubernetes ingress: trust X-Forwarded-For so rate limiting sees real client IPs
app.set('trust proxy', 1)

// Prometheus request metrics (registered before routes so every request is timed)
app.use(metricsMiddleware)

// 1. Allowed CORS origins (supports single or multiple comma-separated URLs, with or without protocol)
export const allowedOrigins: string[] = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').flatMap((raw) => {
      const trimmed = raw.trim().replace(/\/+$/, '')
      if (!trimmed) return []
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return [trimmed]
      }
      return [`https://${trimmed}`, `http://${trimmed}`]
    })
  : ['http://localhost:3000']

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true
  const cleanOrigin = origin.replace(/\/+$/, '')
  const originHost = cleanOrigin.replace(/^https?:\/\//, '')

  if (
    allowedOrigins.includes(cleanOrigin) ||
    allowedOrigins.some((allowed) => allowed.replace(/^https?:\/\//, '') === originHost) ||
    allowedOrigins.includes('*') ||
    process.env.NODE_ENV !== 'production'
  ) {
    return true
  }
  return false
}

// 2. Helmet Security Headers (configured with Cross-Origin Resource Sharing compatibility)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)

// 3. CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true)
      }
      return callback(null, false)
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
)

// 4. Rate Limiting on Authentication endpoints (brute-force defense)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts, please try again later.' },
})

app.use(express.json({ limit: '10mb' }))

// 5. Routes
app.use('/auth', authLimiter, authRouter)
app.use('/user', userRouter)
app.use('/chat', chatRouter)
app.use('/message', messageRouter)
app.use('/group', groupRouter)

// 6. Health check endpoints for cloud monitoring and load balancers
app.get('/health', async (_req: Request, res: Response) => {
  let dbStatus = 'connected'
  try {
    await prisma.$runCommandRaw({ ping: 1 })
  } catch {
    dbStatus = 'disconnected'
  }

  const isHealthy = dbStatus === 'connected'
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development',
  })
})

// Liveness probe: process is up and the event loop responds. Deliberately does NOT
// touch the database, so a DB outage never makes Kubernetes restart healthy pods.
app.get('/livez', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' })
})

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'DotChat API',
    status: 'online',
    version: '1.0.0',
  })
})

// 7. Centralized Error Handling Middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled server error:', err)
  res.status(500).json({
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Something went wrong',
  })
})

export default app
