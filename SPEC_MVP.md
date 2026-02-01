---

# 2️⃣ `SPEC_MVP.md`

```md
# Solarinvest Monitor – SPEC MVP

## 1. Objetivo
Criar uma plataforma interna de monitoramento técnico para a SolarInvest, com foco em:
- Operação proativa
- Detecção antecipada de falhas
- Padronização de dados entre fabricantes

---

## 2. Escopo do MVP

### Incluído
- Monitoramento de usinas solares
- Geração diária, instantânea e total
- Alertas automáticos
- Mapa operacional (Brasil / UF / cidade)
- Marcas:
  - Huawei
  - Solis
  - GoodWe
  - Dele (stub inicial)

### Fora do escopo
- Controle remoto de inversores
- Portal do cliente final
- Faturamento ou billing
- Automação comercial

---

## 3. Arquitetura

- Web App (Next.js)
- API (Node.js)
- Worker assíncrono (BullMQ)
- PostgreSQL + Redis

Separação obrigatória:
- UI ≠ Vendor APIs
- Worker ≠ UI
- Integrações isoladas por adapter

---

## 4. Modelo de Status da Usina

| Status | Significado |
|------|------------|
| GREEN | Operação normal |
| YELLOW | Problema leve (conectividade, alerta menor) |
| RED | Falha crítica (offline prolongado, falha elétrica) |
| GREY | Integração indisponível ou pendente |

---

## 5. Alertas

Tipos principais:
- OFFLINE
- LOW_GEN
- FAULT
- STRING
- VOLTAGE
- API_ERROR

Regras:
- Deduplicação obrigatória
- Estados: NEW → ACKED → RESOLVED
- Reenvio de alerta a cada 6h se persistente
- Silenciamento manual por data

---

## 6. Worker & Polling

- Polling por marca com filas separadas
- Lock Redis por usina
- JobId determinístico
- Rate limit conforme capabilities do adapter
- PollLog obrigatório em todo job

---

## 7. Segurança

- Credenciais criptografadas (AES-256-GCM)
- Rotação de chave suportada
- Senhas com bcrypt (cost ≥ 12)
- Rate limit no login
- Nenhum segredo em logs

---

## 8. Mock Mode

- `INTEGRATION_MOCK_MODE=true`
- Respostas carregadas de `/fixtures/<brand>`
- Obrigatório para testes locais

---

## 9. UI

- Dashboard geral
- Lista de usinas com filtros
- Página de detalhe da usina
- Mapa com clustering e cores por status

---

## 10. Deploy

- Domínio: monitor.solarinvest.info
- Web: Vercel
- API/Worker: container/VPS
