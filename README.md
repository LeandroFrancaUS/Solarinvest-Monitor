# Solarinvest-Monitor
# Solarinvest Monitor

Plataforma unificada de monitoramento avançado de usinas solares da **SolarInvest**.

Este projeto centraliza o monitoramento técnico de usinas fotovoltaicas de múltiplos fabricantes de inversores, normalizando dados, gerando alertas automáticos e oferecendo uma visão operacional única para o time técnico da SolarInvest.

---

## 🎯 Objetivo do MVP

- Monitoramento centralizado de usinas solares
- Geração diária, geração instantânea e geração total
- Alertas automáticos por e-mail e push (Web Push / PWA)
- Visualização por mapa (Brasil, UF, cidade)
- Suporte inicial às marcas:
  - Huawei
  - Solis
  - GoodWe
  - Dele (stub inicial)

---

## 🧱 Arquitetura

- **Frontend:** Next.js + TypeScript + Tailwind
- **Backend/API:** Node.js (NestJS ou Fastify)
- **Worker:** BullMQ + Redis (polling e alertas)
- **Banco:** PostgreSQL
- **Cache/Fila:** Redis
- **Mapas:** Leaflet + OpenStreetMap
- **Deploy:**
  - Web: Vercel
  - API/Worker: VPS ou container service
- **Domínio:** https://monitor.solarinvest.info

---

## 🔐 Acesso (MVP)

- Apenas um usuário inicial:
  - **brsolarinvest@gmail.com**
- Senha temporária gerada no seed
- Troca obrigatória no primeiro login
- Estrutura preparada para múltiplos operadores no futuro

---

## 🧠 Documentação do Projeto

Estes arquivos são a **fonte da verdade técnica**:

- [`SPEC_MVP.md`](./SPEC_MVP.md)  
  Escopo, arquitetura, regras de negócio e fluxo do sistema

- [`INTEGRATION_CONTRACTS.md`](./INTEGRATION_CONTRACTS.md)  
  Contratos TypeScript e padrão único para integração com fabricantes

- [`CHECKLIST_DE_ACEITE.md`](./CHECKLIST_DE_ACEITE.md)  
  Critérios obrigatórios para considerar uma entrega válida

---

## 🚀 Desenvolvimento Local

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Docker and Docker Compose

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Infrastructure Services

Start PostgreSQL, Redis, and Mailhog using Docker Compose:

```bash
cd infra
docker compose up -d
```

Verify services are running:

```bash
docker ps --filter "name=solarinvest"
```

### 3. Configure Environment

Copy the example environment file and configure as needed:

```bash
cp .env.example .env
```

For local development, update the DATABASE_URL:

```
DATABASE_URL=postgresql://solarinvest:solarinvest_dev@localhost:5432/solarinvest_monitor
```

### 4. Setup Database

Run migrations to create database schema:

```bash
pnpm db:migrate
```

Generate Prisma client:

```bash
pnpm db:generate
```

Create the admin user:

```bash
pnpm seed:admin
```

**Important:** Save the generated password displayed in the console. It will only be shown once.

### 5. Run Development Servers

Start all services concurrently (web, api, and worker):

```bash
pnpm dev
```

Or run services individually:

```bash
# Web app (http://localhost:3000)
pnpm --filter web dev

# API server (http://localhost:3001)
pnpm --filter api dev

# Worker process
pnpm --filter worker dev
```

### 6. Verify Installation

- Web app: http://localhost:3000
- API health: http://localhost:3001/health
- Mailhog UI: http://localhost:8025
- Database: PostgreSQL on localhost:5432

---

## 📦 Project Structure

```
/apps
  /web          # Next.js 14+ App Router + Tailwind
  /api          # Fastify + TypeScript + Prisma
  /worker       # Node + BullMQ + TypeScript
/packages
  /integrations
    /core       # contracts.ts, health.ts, shared utils
    /solis      # Solis adapter
    /huawei     # Huawei adapter
    /goodwe     # GoodWe adapter
    /dele       # Dele adapter (stub)
/fixtures       # mock payloads by brand
/infra          # docker-compose.yml
/prisma         # database schema
```

---

## 📜 Available Scripts

### Development
- `pnpm dev` - Start all services in development mode
- `pnpm build` - Build all applications
- `pnpm lint` - Lint all applications
- `pnpm test` - Run tests (to be implemented)

### Database
- `pnpm db:migrate` - Run database migrations (production)
- `pnpm db:migrate:dev` - Create and apply new migration (development)
- `pnpm db:generate` - Generate Prisma client
- `pnpm seed:admin` - Create initial admin user
