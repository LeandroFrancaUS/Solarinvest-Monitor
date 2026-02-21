# Deployment Guide

## Overview

Solarinvest Monitor uses a **hybrid deployment model**:
- **Web**: Vercel (Next.js optimized)
- **API + Worker**: Docker on VPS
- **Database**: PostgreSQL (Docker or managed)
- **Redis**: Docker or managed service

**Critical**: Worker MUST NOT run on Vercel (requires long-running processes for BullMQ).

---

## Development Setup

### Prerequisites
- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Docker + Docker Compose

### Quick Start
```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure services
cd infra && docker compose up -d

# 3. Run database migrations
pnpm db:migrate
pnpm db:generate

# 4. Seed data
pnpm seed:admin        # Create admin user (save password!)
pnpm seed:test-plants  # Seed test plants (Phase 3B)

# 5. Start all services
pnpm dev               # Starts web, api, worker

# Service URLs:
# - Web: http://localhost:3000
# - API: http://localhost:3001
# - Mailhog: http://localhost:8025
# - Postgres: localhost:5432
# - Redis: localhost:6379
```

### Individual Services
```bash
pnpm --filter web dev      # Next.js frontend
pnpm --filter api dev      # Fastify API server
pnpm --filter worker dev   # BullMQ worker
```

---

## Production Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Vercel (Web App)                                       │
│  https://monitor.solarinvest.info                       │
└───────────────────┬─────────────────────────────────────┘
                    │
                    │ HTTPS
                    ▼
┌─────────────────────────────────────────────────────────┐
│  VPS (Docker)                                           │
│  ┌─────────────────┐  ┌──────────────┐                 │
│  │  Nginx/Caddy    │  │  API Server  │                 │
│  │  Reverse Proxy  │──│  Fastify     │                 │
│  │                 │  │  Port 3001   │                 │
│  └─────────────────┘  └──────────────┘                 │
│                       ┌──────────────┐                 │
│                       │  Worker      │                 │
│                       │  BullMQ      │                 │
│                       │  (internal)  │                 │
│                       └──────────────┘                 │
│                       ┌──────────────┐                 │
│                       │  PostgreSQL  │                 │
│                       │  Port 5432   │                 │
│                       └──────────────┘                 │
│                       ┌──────────────┐                 │
│                       │  Redis       │                 │
│                       │  Port 6379   │                 │
│                       └──────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

---

## Web App (Vercel)

### Configuration

**Vercel Project Settings**:
```
Root Directory: apps/web
Build Command: cd ../.. && pnpm install && pnpm build --filter web
Output Directory: .next
Install Command: pnpm install
Framework Preset: Next.js
Node.js Version: 18.x
```

**Environment Variables** (Vercel Dashboard):
```bash
NEXT_PUBLIC_API_URL=https://monitor.solarinvest.info/api/v1
```

### DNS Configuration
```
Domain: monitor.solarinvest.info
Type: CNAME
Value: cname.vercel-dns.com
```

### Build Settings
**File**: `apps/web/next.config.js`
```javascript
module.exports = {
  output: 'standalone',  // Optimized for serverless
  reactStrictMode: true,
};
```

**File**: `apps/web/package.json`
```json
{
  "scripts": {
    "build": "next build",
    "start": "next start"
  }
}
```

### Monorepo Build Support
Vercel automatically detects `pnpm-workspace.yaml` and runs:
```bash
pnpm install              # Install all workspace dependencies
pnpm build --filter web   # Build only web app
```

---

## API + Worker (Docker on VPS)

### Dockerfile

**File**: `apps/api/Dockerfile`
```dockerfile
FROM node:18-alpine AS base
RUN npm install -g pnpm

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/integrations/core/package.json packages/integrations/core/
COPY packages/integrations/solis/package.json packages/integrations/solis/
COPY packages/integrations/huawei/package.json packages/integrations/huawei/
COPY packages/integrations/goodwe/package.json packages/integrations/goodwe/
COPY packages/integrations/dele/package.json packages/integrations/dele/
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate
RUN pnpm build --filter api

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

**File**: `apps/worker/Dockerfile` (similar structure)
```dockerfile
# ... same base, deps, builder stages
CMD ["node", "dist/index.js"]
```

### Docker Compose (Production)

**File**: `docker-compose.prod.yml`
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: solarinvest
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: monitor_prod
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://solarinvest:${POSTGRES_PASSWORD}@postgres:5432/monitor_prod
      REDIS_URL: redis://redis:6379
      MASTER_KEY_CURRENT: ${MASTER_KEY_CURRENT}
      MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS}
      JWT_SECRET: ${JWT_SECRET}
      INTEGRATION_MOCK_MODE: ${INTEGRATION_MOCK_MODE}
      EMAIL_SMTP_HOST: ${EMAIL_SMTP_HOST}
      EMAIL_SMTP_PORT: ${EMAIL_SMTP_PORT}
      EMAIL_SMTP_USER: ${EMAIL_SMTP_USER}
      EMAIL_SMTP_PASS: ${EMAIL_SMTP_PASS}
    depends_on:
      - postgres
      - redis
    ports:
      - "3001:3001"
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    environment:
      DATABASE_URL: postgresql://solarinvest:${POSTGRES_PASSWORD}@postgres:5432/monitor_prod
      REDIS_URL: redis://redis:6379
      MASTER_KEY_CURRENT: ${MASTER_KEY_CURRENT}
      INTEGRATION_MOCK_MODE: ${INTEGRATION_MOCK_MODE}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Environment Variables (Production)

**File**: `.env.production` (git-ignored)
```bash
# Database
POSTGRES_PASSWORD=<strong-password>

# Encryption
MASTER_KEY_CURRENT=<64-hex-chars>
MASTER_KEY_PREVIOUS=<64-hex-chars>

# JWT
JWT_SECRET=<random-secret>

# Email
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=ops@solarinvest.info
EMAIL_SMTP_PASS=<app-password>

# Integration Mode
INTEGRATION_MOCK_MODE=false  # Phase 4+: real vendor APIs

# Web Push
VAPID_PUBLIC_KEY=<base64-public-key>
VAPID_PRIVATE_KEY=<base64-private-key>
```

**Load with**:
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

---

## Reverse Proxy (Nginx)

### Configuration

**File**: `/etc/nginx/sites-available/monitor.solarinvest.info`
```nginx
server {
    listen 80;
    server_name monitor.solarinvest.info;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name monitor.solarinvest.info;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/monitor.solarinvest.info/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitor.solarinvest.info/privkey.pem;

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout for long polling (if needed)
        proxy_read_timeout 90s;
    }

    # Block direct access to worker
    location /worker {
        return 403;
    }
}
```

**Enable site**:
```bash
sudo ln -s /etc/nginx/sites-available/monitor.solarinvest.info /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL with Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d monitor.solarinvest.info
```

**Auto-renewal**:
```bash
sudo certbot renew --dry-run
```

---

## Database Migrations (Production)

### Run Migrations
```bash
# Inside API container
docker compose exec api sh
pnpm db:migrate
exit
```

### Backup Database
```bash
# Automated daily backup
docker exec postgres pg_dump -U solarinvest monitor_prod | gzip > backup-$(date +%Y%m%d).sql.gz
```

### Restore Database
```bash
gunzip -c backup-20260218.sql.gz | docker exec -i postgres psql -U solarinvest -d monitor_prod
```

---

## Monitoring & Logging

### Docker Logs
```bash
# View logs
docker compose logs -f api
docker compose logs -f worker

# Last 100 lines
docker compose logs --tail=100 worker

# Filter errors
docker compose logs worker | grep ERROR
```

### Log Rotation
**File**: `/etc/docker/daemon.json`
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

### Health Checks
```bash
# API health endpoint
curl https://monitor.solarinvest.info/api/v1/health

# Expected response
{"status":"ok","timestamp":"2026-02-18T10:30:00.000Z"}
```

### BullMQ Dashboard (Dev Only)
```typescript
// apps/worker/src/index.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';

const serverAdapter = new FastifyAdapter();
createBullBoard({
  queues: [
    new BullMQAdapter(solisQueue),
    new BullMQAdapter(huaweiQueue),
    // ...
  ],
  serverAdapter
});

// Access at http://localhost:3002/admin/queues (internal only)
```

---

## Scaling Considerations

### Horizontal Scaling (Future)
```yaml
# docker-compose.prod.yml
services:
  worker:
    deploy:
      replicas: 3  # Multiple worker instances
```

**BullMQ automatically distributes jobs across workers.**

### Database Connection Pooling
**File**: `apps/api/src/index.ts`
```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=10'
    }
  }
});
```

### Redis Managed Service (Future)
- **AWS ElastiCache**: Fully managed, high availability
- **Redis Cloud**: Multi-region replication
- **DigitalOcean Managed Redis**: Simple setup

Replace `REDIS_URL` with managed service endpoint.

---

## Security Hardening

### Firewall Rules
```bash
# Allow only SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3001/tcp  # Block direct API access
sudo ufw deny 5432/tcp  # Block direct database access
sudo ufw enable
```

### Docker Security
```yaml
# docker-compose.prod.yml
services:
  api:
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

### Environment Variable Protection
```bash
# Restrict .env.production permissions
chmod 600 .env.production
```

---

## Deployment Checklist

### Before First Deploy
- [ ] Domain DNS configured (`monitor.solarinvest.info`)
- [ ] SSL certificate obtained (Let's Encrypt)
- [ ] `.env.production` created with all secrets
- [ ] Database migrations tested locally
- [ ] Firewall rules configured
- [ ] Nginx reverse proxy tested

### Deployment Steps
1. **Build images**:
   ```bash
   docker compose -f docker-compose.prod.yml build
   ```

2. **Run migrations**:
   ```bash
   docker compose exec api pnpm db:migrate
   ```

3. **Seed admin user**:
   ```bash
   docker compose exec api pnpm seed:admin
   ```

4. **Start services**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

5. **Verify health**:
   ```bash
   curl https://monitor.solarinvest.info/api/v1/health
   ```

6. **Deploy web to Vercel**:
   ```bash
   # Vercel auto-deploys on git push to main branch
   git push origin main
   ```

### Post-Deploy Verification
- [ ] Web app loads: `https://monitor.solarinvest.info`
- [ ] API health check passes
- [ ] Login works (test admin user)
- [ ] Worker polls plants (check PollLog table)
- [ ] Alerts generated (check Alert table)
- [ ] Email notifications sent (check SMTP logs)

---

## Rollback Procedure

### Database Rollback
```bash
# Revert last migration
docker compose exec api pnpm prisma migrate resolve --rolled-back <migration-name>
```

### Code Rollback
```bash
# Redeploy previous commit
git revert HEAD
docker compose -f docker-compose.prod.yml up -d --build
```

### Emergency Stop
```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Restore database from backup
gunzip -c backup-latest.sql.gz | docker exec -i postgres psql -U solarinvest -d monitor_prod

# Restart services
docker compose -f docker-compose.prod.yml up -d
```

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) – System overview
- [SECURITY_MODEL.md](./SECURITY_MODEL.md) – Secrets management
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) – Common deployment issues
