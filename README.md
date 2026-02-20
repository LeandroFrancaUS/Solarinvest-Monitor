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

```bash
pnpm install
pnpm dev