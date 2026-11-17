import http from 'http'
import client from 'prom-client'
import type { Request, Response, NextFunction } from 'express'

// Prometheus registry with default Node.js process metrics (CPU, memory, event loop lag, GC)
export const register = new client.Registry()
register.setDefaultLabels({ app: 'dotchat-backend' })
client.collectDefaultMetrics({ register })

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
})

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
})

export const socketConnections = new client.Gauge({
  name: 'socketio_connected_clients',
  help: 'Socket.IO clients currently connected to this pod',
  registers: [register],
})

export const messagesSentTotal = new client.Counter({
  name: 'chat_messages_sent_total',
  help: 'Chat messages persisted and broadcast',
  registers: [register],
})

// Metrics are served on a separate internal port so they are never exposed through
// the public ingress — only Prometheus (inside the cluster) can scrape them.
export function startMetricsServer(port: number): http.Server {
  return http
    .createServer(async (req, res) => {
      if (req.url === '/metrics') {
        res.setHeader('Content-Type', register.contentType)
        res.end(await register.metrics())
      } else {
        res.statusCode = 404
        res.end()
      }
    })
    .listen(port, () => console.log(`📈 Metrics server on :${port}/metrics`))
}

// Express middleware: records count + latency per route.
// Uses the matched route pattern (e.g. /chat/:id) to keep label cardinality low.
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpRequestDuration.startTimer()
  res.on('finish', () => {
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.baseUrl || 'unmatched'
    const labels = { method: req.method, route, status: String(res.statusCode) }
    httpRequestsTotal.inc(labels)
    end(labels)
  })
  next()
}
