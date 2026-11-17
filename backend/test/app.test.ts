import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import app, { isOriginAllowed } from '../src/app.js'
import { register } from '../src/metrics.js'

const server = app.listen(0)
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
after(() => server.close())

test('GET /livez returns 200 without touching the database', async () => {
  const res = await fetch(`${base}/livez`)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: 'alive' })
})

test('GET / returns API info', async () => {
  const res = await fetch(`${base}/`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.name, 'DotChat API')
  assert.equal(body.status, 'online')
})

test('protected routes reject requests without a token', async () => {
  const res = await fetch(`${base}/chat`)
  assert.ok([401, 403, 404].includes(res.status), `unexpected status ${res.status}`)
})

test('requests are recorded in Prometheus metrics', async () => {
  await fetch(`${base}/livez`)
  const metrics = await register.metrics()
  assert.match(metrics, /http_requests_total\{[^}]*route="\/livez"[^}]*\} \d+/)
  assert.match(metrics, /http_request_duration_seconds_bucket/)
  assert.match(metrics, /process_cpu_seconds_total/)
})

test('isOriginAllowed accepts the configured client origin', () => {
  assert.equal(isOriginAllowed('http://localhost:3000'), true)
  assert.equal(isOriginAllowed(undefined), true)
})
