# Solarinvest Monitor – Integration Contracts

## Objetivo
Definir um **contrato técnico único** para todas as integrações com fabricantes de inversores.

Nenhuma parte do sistema pode depender de payloads específicos de fabricantes.

---

## Princípios

- Todos os adapters implementam a mesma interface
- Dados sempre normalizados
- Unidades padronizadas (W, kWh)
- Erros tipados e previsíveis
- Mock mode obrigatório

---

## Contrato Principal (resumo)

Cada adapter DEVE implementar:

- testConnection()
- getPlantSummary()
- getDailyEnergySeries()
- getAlarmsSince()

---

## Normalização Obrigatória

- Potência → Watts
- Energia → kWh
- Datas → ISO 8601
- Status → GREEN / YELLOW / RED / GREY

---

## Governança de Polling

Cada adapter informa:
- Intervalo mínimo
- Concorrência máxima
- Requests por minuto
- Timeout recomendado

---

## Erros Tipados

| Situação | Tipo |
|--------|-----|
| 401 / 403 | AUTH_FAILED |
| 429 | RATE_LIMIT_EXCEEDED |
| Timeout | NETWORK_TIMEOUT |
| Payload inválido | INVALID_DATA_FORMAT |

---

## Marcas MVP

- Solis (SolisCloud API)
- Huawei (FusionSolar Northbound)
- GoodWe (SEMS Open API)
- Dele (stub / pendente confirmação)

---

## Mock Mode

- Variável: `INTEGRATION_MOCK_MODE=true`
- Fixtures JSON por marca
- Nenhum adapter pode depender de API real em testes
