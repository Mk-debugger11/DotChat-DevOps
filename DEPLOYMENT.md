# DotChat — Production Deployment Guide

This guide provides step-by-step instructions for deploying DotChat to production.

---

## Architecture Overview

DotChat consists of two services:
1. **Frontend:** Next.js 16 (React 19, Tailwind CSS v4, Socket.IO Client, Standalone output).
2. **Backend:** Node.js Express 5 + Socket.IO Server + Prisma ORM + MongoDB Atlas.

---

## Deployment Option 1: Vercel (Frontend) + Render / Railway (Backend)
*(Recommended — Free tier available, zero server maintenance, automatic SSL & CI/CD)*

### Step 1: Deploy Backend to Render or Railway

#### On Render (Web Service):
1. Push your repository to GitHub / GitLab.
2. In the [Render Dashboard](https://dashboard.render.com/), click **New + > Web Service**.
3. Connect your repository and configure:
   - **Root Directory:** `backend`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Add the following **Environment Variables**:
   | Key | Value | Description |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Production mode |
   | `PORT` | `8080` | Service listening port |
   | `DATABASE_URL` | `mongodb+srv://...` | Your MongoDB Atlas connection string |
   | `JWT_SECRET_KEY` | `your_secure_secret_key` | Secret used to sign user JWTs |
   | `CLIENT_URL` | `https://your-frontend.vercel.app` | Your Vercel frontend URL (supports comma-separated origins) |
   | `GOOGLE_CLIENT_ID` | `your-client-id.apps.googleusercontent.com` | (Optional) For Google OAuth |
5. Click **Create Web Service**. Note your backend URL (e.g. `https://dotchat-api.onrender.com`).

---

### Step 2: Deploy Frontend to Vercel

1. In the [Vercel Dashboard](https://vercel.com/), click **Add New > Project**.
2. Select your repository.
3. In **Project Settings**:
   - **Root Directory:** `frontend`
   - **Framework Preset:** `Next.js`
4. Add **Environment Variables**:
   | Key | Value | Description |
   | :--- | :--- | :--- |
   | `NEXT_PUBLIC_API_URL` | `https://dotchat-api.onrender.com` | Backend REST API URL (no trailing slash) |
   | `NEXT_PUBLIC_SOCKET_URL` | `https://dotchat-api.onrender.com` | Backend WebSocket URL (no trailing slash) |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `your-client-id.apps.googleusercontent.com` | (Optional) For Google OAuth |
5. Click **Deploy**. Vercel will build and assign a production URL (e.g. `https://dotchat.vercel.app`).
6. *Important:* Update `CLIENT_URL` in your Render backend settings to match your new Vercel URL!

---

## Deployment Option 2: Docker Compose (VPS / Single Server)
*(DigitalOcean Droplet, AWS EC2, Hetzner, Linode, Ubuntu/Debian server)*

### 1. Prerequisites on the Server
- Docker (`docker --version`) & Docker Compose (`docker compose version`).
- Git.

### 2. Deployment Steps
1. Clone the repository on your server:
   ```bash
   git clone <your-repo-url>
   cd ChatApp
   ```
2. Create your root `.env` file for Docker Compose:
   ```env
   DATABASE_URL="mongodb+srv://user:pass@cluster.mongodb.net/dotchat?retryWrites=true&w=majority"
   JWT_SECRET_KEY="generate_a_secure_random_key_here"
   CLIENT_URL="https://chat.yourdomain.com"
   NEXT_PUBLIC_API_URL="https://api.yourdomain.com"
   NEXT_PUBLIC_SOCKET_URL="https://api.yourdomain.com"
   GOOGLE_CLIENT_ID=""
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
   ```
3. Build and launch containers in background:
   ```bash
   docker compose up -d --build
   ```
4. Check running services:
   ```bash
   docker compose ps
   ```
5. View live logs:
   ```bash
   docker compose logs -f
   ```

---

## Health Check & Monitoring

The backend exposes an automated health check endpoint for cloud load balancers and uptime monitors:
- **`GET /health`**
- Returns:
  ```json
  {
    "status": "healthy",
    "uptime": 1420,
    "timestamp": "2026-09-20T21:15:00.000Z",
    "database": "connected",
    "environment": "production"
  }
  ```

---

## Google Cloud Console OAuth Setup (Optional)

When deploying to production with Google Sign-In enabled:
1. Go to [Google Cloud Console](https://console.cloud.google.com/) > **APIs & Services > Credentials**.
2. Select your OAuth 2.0 Web Client.
3. Under **Authorized JavaScript origins**, add your production frontend domain:
   - `https://your-frontend.vercel.app`
   - `https://chat.yourdomain.com`
4. Save changes.
