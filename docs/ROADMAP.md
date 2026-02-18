# Product Roadmap

## Current Phase: 3B (Mock Monitoring Engine)

**Status**: In Development  
**Timeline**: Q1 2026  
**Goal**: Validate monitoring architecture with fixtures, no real vendor APIs.

**Completed**:
- ✅ Prisma schema with full data model
- ✅ Fastify API with JWT auth
- ✅ BullMQ worker infrastructure
- ✅ BaseMockAdapter pattern
- ✅ Fixture-based polling
- ✅ Docker Compose (postgres, redis, mailhog)

**In Progress**:
- 🔄 Worker polling logic (seed → enqueue → poll → status → alerts)
- 🔄 Alert generation and deduplication
- 🔄 Status calculation (GREEN/YELLOW/RED/GREY)
- 🔄 PollLog auditing

**Validation Criteria**:
- Worker polls all seeded plants every 10 minutes
- MetricSnapshot records created daily
- Plant status updates based on `last_seen_at` and alerts
- Alert deduplication working (same alarm doesn't create duplicates)
- PollLog tracks every poll (success or failure)
- **Zero real vendor API calls** (fixtures only)

**Reference**: [PHASE_3B_SCOPE.md](../PHASE_3B_SCOPE.md), [CHECKLIST_DE_ACEITE.md](../CHECKLIST_DE_ACEITE.md)

---

## Phase 3C: Frontend Dashboard

**Timeline**: Q1 2026  
**Dependencies**: Phase 3B complete  
**Goal**: Operational dashboard with map, filters, and alerts.

### Features

**Dashboard**:
- Total plants count
- Status breakdown (GREEN/YELLOW/RED/GREY)
- Total today energy (sum of all plants)
- Recent alerts (last 7 days)

**Map View**:
- Leaflet + OpenStreetMap
- Clustering with `leaflet.markercluster`
- Color-coded markers:
  - GREEN: `#22C55E`
  - YELLOW: `#FACC15`
  - RED: `#EF4444`
  - GREY: `#9CA3AF`
- Click marker → Plant detail popup

**Filters**:
- Brand (Solis, Huawei, GoodWe, Dele)
- UF (state)
- City
- Status
- Persist filters in URL query params

**Plant Detail Page**:
- Plant metadata (name, city, UF, lat/lng, capacity_kwp)
- Current power output (realtime)
- Today's energy production
- 7-day energy chart (Recharts line chart)
- Active alerts (with acknowledge/resolve buttons)
- Connection status (last_seen_at)

**Alert Management**:
- Alert list with filters (type, severity, status)
- Acknowledge alert (NEW → ACKED)
- Resolve alert (ACKED → RESOLVED)
- Alert history (show resolved alerts)

**Technology**:
- Next.js 14+ (App Router)
- Tailwind CSS
- Leaflet maps (NO alternatives)
- Recharts (NO alternatives)
- React Query (server state)

**Validation Criteria**:
- Map loads with all plants from fixtures
- Filters work and persist in URL
- Plant detail shows mock data from MetricSnapshot
- Alerts display and can be acknowledged/resolved
- Charts render 7 days of fixture data

---

## Phase 4: Real Vendor APIs

**Timeline**: Q2 2026  
**Dependencies**: Phase 3B + 3C complete  
**Goal**: Replace fixtures with real vendor API integrations.

### Preparation

**Vendor Credentials Acquisition**:
- Solis: SolisCloud API key + secret
- Huawei: FusionSolar account + Northbound API access
- GoodWe: SEMS API credentials
- Dele: Vendor documentation + API access (pending)

**Environment**:
```bash
INTEGRATION_MOCK_MODE=false  # Enable real APIs
```

### Implementation

**Adapters** (replace mock implementations):
- `packages/integrations/solis/src/index.ts`
- `packages/integrations/huawei/src/index.ts`
- `packages/integrations/goodwe/src/index.ts`
- `packages/integrations/dele/src/index.ts` (if vendor docs available)

**Rate Limiting**:
- Respect `VendorCapabilities.polling` limits
- Implement backoff for 429 errors
- Use `retryAfterSeconds` from rate limit responses

**Error Handling**:
- Map HTTP errors to `AdapterError` types
- Pause integration on AUTH_FAILED (set `integration_status = PAUSED_AUTH_ERROR`)
- Alert operators on repeated failures

**Validation**:
- Sandbox testing with vendor test accounts
- Compare normalized data with vendor dashboards
- Monitor PollLog for failures
- Verify alarm deduplication with real vendor alarms

### Rollout Strategy

**Phased Rollout**:
1. **Week 1**: Solis (most common brand)
2. **Week 2**: Huawei (second most common)
3. **Week 3**: GoodWe
4. **Week 4**: Dele (if ready)

**Monitoring**:
- Daily review of PollLog table
- Alert on high failure rates (>10%)
- Compare energy totals with vendor dashboards

**Rollback Plan**:
- Revert to mock mode: `INTEGRATION_MOCK_MODE=true`
- Fix issue, test in sandbox
- Re-enable real APIs

---

## Phase 5: Mobile Apps

**Timeline**: Q3-Q4 2026  
**Dependencies**: Phase 4 stable for 30+ days  
**Goal**: Native iOS and Android apps for end customers.

### Architecture

**API-First** (already implemented in MVP):
- Mobile apps consume same `/api/v1` endpoints as web
- No business logic in mobile clients
- All logic in API/Worker

**RBAC** (already modeled):
- `User.role = CUSTOMER` (currently unused)
- `Plant.owner_customer_id` (nullable for MVP, required for mobile)

### New Features

**Authentication**:
- Refresh token support (30-day lifetime)
- Device registration (`DeviceRegistration` table)
- Secure token storage (Keychain on iOS, Secure Storage on Android)

**Endpoints** (new):
```
GET  /api/v1/me                      # Current user profile
GET  /api/v1/customer/plants         # Customer-owned plants only
GET  /api/v1/customer/plants/:id     # Customer plant detail
GET  /api/v1/customer/alerts         # Customer alerts
POST /api/v1/customer/push/register  # Register mobile push token
```

**DTOs**:
- Use `PlantPublicDTO` (no `vendor_plant_id`, `integration_status`, etc.)
- Use `AlertPublicDTO` (no `vendorMeta`, `raw`)

**Push Notifications**:
- iOS: APNs (Apple Push Notification service)
- Android: FCM (Firebase Cloud Messaging)
- Integrate with existing alert engine
- `DeviceRegistration.push_token` (encrypted)

**Data Strategy**:
- Primary source: `MetricSnapshot` (daily aggregates)
- Avoid heavy realtime telemetry (bandwidth-friendly)
- Charts use daily data (not hourly)

### Mobile Tech Stack

**iOS**:
- Swift + SwiftUI
- MapKit (alternative to Leaflet)
- Charts framework

**Android**:
- Kotlin + Jetpack Compose
- Google Maps SDK
- MPAndroidChart

**Cross-Platform Alternative** (if budget limited):
- React Native + Expo
- Reuse web components (Tailwind → NativeWind)
- Single codebase for iOS + Android

### Implementation Phases

**Phase 5A: Authentication + RBAC**:
- Refresh token model
- `/api/v1/me` endpoint
- Customer-scoped queries
- Device registration

**Phase 5B: iOS App**:
- App Store deployment
- APNs integration
- Customer dashboard
- Plant detail view

**Phase 5C: Android App**:
- Google Play deployment
- FCM integration
- Customer dashboard
- Plant detail view

**Phase 5D: Push Notifications**:
- Integrate APNs and FCM with alert engine
- Notification preferences (per-user, per-plant)
- Silence notifications (time-based, per-alert-type)

### Validation Criteria

- [ ] Customer can login from mobile app
- [ ] Customer sees only owned plants
- [ ] Plant detail shows today's energy, status, alerts
- [ ] Push notifications arrive for new alerts
- [ ] Customer can acknowledge alerts from mobile
- [ ] App works offline (cached data)
- [ ] Token refresh works seamlessly

---

## Phase 6: Advanced Features

**Timeline**: 2027+  
**Dependencies**: Phase 5 stable  
**Goal**: Enhanced analytics, automation, and customer features.

### Candidate Features

**Operational**:
- Automated ticket creation (integrate with Zendesk/Jira)
- Predictive maintenance (ML-based failure prediction)
- Performance benchmarking (compare plants in same region)
- Weather correlation (integrate with weather APIs)

**Customer**:
- Energy reports (monthly, yearly)
- Performance comparisons (vs. expected generation)
- Financial metrics (savings, ROI)
- Carbon offset calculations

**Automation**:
- Auto-resolve alerts after 24h (if condition clears)
- Auto-escalate critical alerts (if unacknowledged for 1h)
- Integration with remote control systems (if vendor supports)

**Analytics**:
- Power BI / Grafana dashboards
- Anomaly detection (energy drop without weather cause)
- Fleet-wide insights (top/bottom performers)

**Scalability**:
- Horizontal worker scaling (multiple worker instances)
- Read replicas for PostgreSQL
- Redis Cluster (high availability)
- CDN for static assets

---

## Technical Debt & Future Improvements

### Code Quality
- [ ] Increase test coverage (target: 80%)
- [ ] Add E2E tests (Playwright or Cypress)
- [ ] Implement OpenAPI spec generation (Fastify Swagger)
- [ ] Add CI/CD pipeline (GitHub Actions)

### Performance
- [ ] Implement caching layer (Redis for API responses)
- [ ] Optimize database queries (add indexes)
- [ ] Lazy-load map markers (virtualization for 1000+ plants)
- [ ] Implement pagination on alert list

### Monitoring
- [ ] Add APM (Application Performance Monitoring)
- [ ] Implement structured logging (JSON format)
- [ ] Set up error tracking (Sentry)
- [ ] Create admin dashboard for Worker health

### Documentation
- [ ] API documentation (Swagger UI)
- [ ] User manual (for operators)
- [ ] Runbook (incident response)
- [ ] Architecture decision records (ADRs)

---

## Long-Term Vision

**3-Year Goal**: Unified monitoring platform for all SolarInvest operations.

**Metrics**:
- Monitor 500+ plants across Brazil
- <1 hour alert response time (critical)
- 99.9% uptime (API + Worker)
- <5% false positive rate (alerts)

**Expansion**:
- Support for additional inverter brands (Fronius, SMA, ABB)
- Battery storage monitoring (ESS systems)
- Consumption monitoring (customer load profiles)
- Multi-tenant support (white-label for partners)

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) – Current system design
- [PHASE_3B_MONITORING_LOOP.md](./PHASE_3B_MONITORING_LOOP.md) – Phase 3B details
- [INTEGRATION_CONTRACT.md](./INTEGRATION_CONTRACT.md) – Adapter contracts
- [SECURITY_MODEL.md](./SECURITY_MODEL.md) – Authentication strategy
- [DEPLOYMENT.md](./DEPLOYMENT.md) – Production deployment
- [../PHASE_3B_SCOPE.md](../PHASE_3B_SCOPE.md) – Phase 3B detailed scope
- [../mobile.md](../mobile.md) – Mobile planning document
