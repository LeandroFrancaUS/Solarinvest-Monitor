# Mobile App Planning — Solarinvest Monitor

This document defines architectural and data decisions required to support
future native mobile applications (iOS and Android) without refactoring
the core platform.

The MVP Web platform MUST be implemented with these constraints in mind.

---

## 1. Core Principle

The platform is **API-first**.

- Web UI and future mobile apps consume the same API.
- No business logic lives in the frontend.
- No vendor API is ever exposed to clients.

Breaking changes require a new API version (/api/v2).

---

## 2. User Roles (RBAC)

Roles must exist from day one:

| Role | Description |
|----|------------|
| ADMIN | Full system access |
| OPERATOR | Operational monitoring |
| CUSTOMER | End-user monitoring |

Even if CUSTOMER is unused in MVP, it must be modeled.

---

## 3. Multi-Tenant Ownership

Plants must support ownership:

```text
Plant.owner_customer_id (nullable)