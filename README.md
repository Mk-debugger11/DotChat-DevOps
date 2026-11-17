# DotChat — Real-time Chat on Kubernetes with a full DevOps pipeline

DotChat is a real-time chat app (Next.js + Express + Socket.IO + MongoDB) deployed to a
**Kubernetes (k3s) cluster on AWS EC2**, shipped by a **GitHub Actions CI/CD pipeline** with
security gates, zero-downtime rolling updates, automatic rollback, autoscaling and
**Prometheus + Grafana** monitoring.

| | URL |
|---|---|
| App | https://dotchat.13-232-16-107.sslip.io |
| API health | https://api.13-232-16-107.sslip.io/health |
| Grafana | https://grafana.13-232-16-107.sslip.io (dashboard: *DotChat — Production Overview*) |

## Architecture

```
 Developer ── git push ──▶ GitHub
                             │
          ┌──────────────────▼───────────────────────────────────────────┐
          │ GitHub Actions                                               │
          │  CI       : typecheck · unit tests · lint · build · kubeconform│
          │  Security : Gitleaks · npm audit · Trivy (IaC + images)      │
          │  CD       : build → Trivy scan → push GHCR → rolling deploy  │
          │             → auto-rollback on failure → HTTPS smoke test    │
          └──────────────────┬───────────────────────────────────────────┘
                             │ SSH (deploy key)
 ┌───────────────────────────▼──── AWS EC2 (m7i-flex.large, ap-south-1) ─────────────┐
 │ k3s Kubernetes                                                                    │
 │                                                                                   │
 │  Traefik Ingress + cert-manager (Let's Encrypt TLS, HTTP→HTTPS redirect)          │
 │    dotchat.*  ──▶ frontend Service ──▶ Next.js pods (2–4, HPA)                    │
 │    api.*      ──▶ backend Service  ──▶ Express + Socket.IO pods (2–5, HPA)        │
 │                     (sticky cookie)        │  ▲                                   │
 │                                            ▼  │ pub/sub between replicas          │
 │                                         Redis (NetworkPolicy: backend only)       │
 │                                                                                   │
 │  monitoring ns: Prometheus ◀── :9464/metrics (internal only)   Grafana            │
 └───────────────────────────────────────────────┬───────────────────────────────────┘
                                                 ▼
                                          MongoDB Atlas
```

## What each DevOps piece does

| Area | Implementation | Where |
|---|---|---|
| Containers | Multi-stage Dockerfiles, non-root users, dev deps pruned | `backend/Dockerfile`, `frontend/Dockerfile` |
| Orchestration | Deployments, Services, Ingress, ConfigMap/Secret, Kustomize | `k8s/` |
| Zero downtime | `maxUnavailable: 0` rolling updates, readiness gates, `preStop` drain, PodDisruptionBudgets | `k8s/*.yaml` |
| Self-healing | liveness (`/livez`, no DB) vs readiness (`/health`, checks MongoDB) vs startup probes | `k8s/backend.yaml` |
| Autoscaling | HPA on CPU: backend 2→5, frontend 2→4 | `k8s/autoscaling.yaml` |
| Horizontal scaling of WebSockets | Socket.IO Redis adapter + cluster-wide presence + sticky sessions | `backend/src/server.ts`, `socket.ts` |
| CI | Typecheck, unit tests, lint, build, manifest schema validation | `.github/workflows/ci.yml` |
| CD | Build → scan → push to GHCR (SHA tags) → deploy → auto-rollback → smoke test | `.github/workflows/cd.yml` |
| DevSecOps | Gitleaks, npm audit, Trivy config + image scans, read-only root FS, dropped capabilities, seccomp, NetworkPolicy, secrets only in cluster | `security.yml`, `k8s/` |
| TLS | cert-manager + Let's Encrypt, auto-renewing | `k8s/cluster/cluster-issuer.yaml` |
| Observability | prom-client metrics (RED + sockets + messages), kube-prometheus-stack, Grafana dashboard, alert rules | `backend/src/metrics.ts`, `monitoring/` |

## CI/CD flow

1. **Pull request / feature branch** → `CI` + `Security` workflows must pass.
2. **Merge to `main`** → `CD`:
   1. Re-runs the full CI suite (reusable workflow) — `main` is never deployed untested.
   2. Builds both images with layer caching, **Trivy-scans them (blocks CRITICAL CVEs)**, pushes to GHCR tagged with the commit SHA.
   3. Pins `k8s/kustomization.yaml` to that SHA, `kubectl apply -k`, waits for the rolling update.
   4. If a rollout doesn't become healthy → **automatic `kubectl rollout undo`** and the job fails.
   5. Smoke-tests the public HTTPS endpoints.

## Demo runbook

```bash
ssh -i ~/.ssh/dotchat-k3s ubuntu@13.232.16.107
cd ~/deploy

bash scripts/demo.sh status     # deployments, pods, ingress, HPA
bash scripts/demo.sh selfheal   # delete a backend pod -> a replacement is created automatically
bash scripts/demo.sh load       # load generators -> HPA scales backend 2 -> 5 (watch Grafana too)
bash scripts/demo.sh stopload   # scale back down
bash scripts/demo.sh history    # one revision per CD deployment
bash scripts/demo.sh rollback   # instant rollback to the previous version
```

Zero-downtime deploy demo: change something visible in the UI, `git push`, watch the Actions run,
then `kubectl -n dotchat get pods -w` — new pods become Ready before old ones terminate.

## Repository layout

```
.github/workflows/   ci.yml · security.yml · cd.yml
k8s/                 namespace, configmap, redis, backend, frontend, ingress, autoscaling,
                     networkpolicy, kustomization; cluster/ (Let's Encrypt issuer)
monitoring/          kube-prometheus-stack values, ServiceMonitor + alert rules, Grafana dashboard
scripts/             bootstrap-cluster.sh (one-time cluster setup) · demo.sh
backend/             Express 5 + Socket.IO + Prisma (MongoDB) — /livez, /health, :9464/metrics
frontend/            Next.js 16 (standalone output)
docker-compose.yml   local full-stack run
```

## Setup from scratch

1. **Server**: EC2 (Ubuntu 24.04) with ports 22/80/443 open; install k3s, Docker, Helm.
2. **Cluster add-ons**: `bash scripts/bootstrap-cluster.sh` (cert-manager, Prometheus, Grafana, dashboard).
3. **App secret** (never committed): see `k8s/secret.example.yaml`.
4. **GitHub repository secrets**: `EC2_HOST`, `EC2_SSH_KEY` (deploy private key), `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
5. Push to `main` → the pipeline deploys.

Local development: `docker compose up --build` (see `DEPLOYMENT.md`).
