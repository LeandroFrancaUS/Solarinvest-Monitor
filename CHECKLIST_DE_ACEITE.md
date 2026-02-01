# Checklist de Aceite – Solarinvest Monitor

Este checklist define quando uma entrega é considerada válida.

---

## Arquitetura
- [ ] Monorepo organizado (web/api/worker)
- [ ] Docker-compose funcional
- [ ] `.env.example` presente

---

## Segurança
- [ ] Credenciais criptografadas (AES-256-GCM)
- [ ] Rotação de chave implementada
- [ ] Nenhum segredo em logs
- [ ] bcrypt cost ≥ 12

---

## Integrações
- [ ] Todos os adapters seguem o contrato
- [ ] testConnection nunca lança exceção
- [ ] Mock mode funcional
- [ ] Rate limit respeitado

---

## Worker
- [ ] PollLog gravado em todo job
- [ ] Locks Redis por usina
- [ ] JobId determinístico
- [ ] Retry + backoff implementados

---

## Alertas
- [ ] Dedupe funcional
- [ ] Estados NEW / ACKED / RESOLVED
- [ ] GREY aplicado quando integração não está ativa
- [ ] Silenciamento funcional

---

## UI
- [ ] Dashboard operacional
- [ ] Lista de usinas com filtros
- [ ] Página de detalhe
- [ ] Mapa com clustering e cores corretas

---

## Final
- [ ] `pnpm dev` sobe tudo localmente
- [ ] MVP funcional sem APIs reais
