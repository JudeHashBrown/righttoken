# Operational Location Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build email-first operational location attribution with local IP databases, auditable evidence, administrator-managed rules, and deterministic operator assignment.

**Architecture:** A pure attribution engine combines normalized email-domain rules with an injected IP resolver chain. Registration stores both raw IP-derived geography and the final operational geography; existing assignment rules continue consuming `countryCode` and `region`.

**Tech Stack:** TypeScript, Next.js 16, Prisma 7/PostgreSQL, Vitest, MaxMind MMDB.

## Global Constraints

- Email exact-domain rules outrank email suffix rules, and all email rules outrank IP.
- VPN and proxy detection is out of scope; use the observed registration IP.
- Valid public IPs use local MMDB first and a local RIR range snapshot as fallback.
- Invalid or missing IP data routes to the configured default responsible member, never the public pool.
- Database lookup failure must not block registration.
- Local database files must not be committed to Git.
- Keep all work local; do not create commits or push GitHub.

---

### Task 1: Pure email attribution engine

**Files:**
- Create: `src/modules/location/email-domain.ts`
- Create: `src/modules/location/attribution.ts`
- Test: `tests/unit/location/email-domain.test.ts`
- Test: `tests/unit/location/attribution.test.ts`

**Interfaces:**
- Produces: `normalizeEmailDomain(email: string): string | null`
- Produces: `matchEmailLocation(domain: string, rules: LocationRule[]): LocationMatch | null`
- Produces: `resolveOperationalLocation(input: AttributionInput): AttributionResult`

- [ ] Write tests for exact-domain precedence, suffix matching on a DNS-label boundary, uppercase normalization, global-domain exclusions, and email-over-IP behavior.
- [ ] Run `npm exec vitest run tests/unit/location/email-domain.test.ts tests/unit/location/attribution.test.ts` and verify failure because the modules do not exist.
- [ ] Implement the minimal pure functions and types.
- [ ] Run the focused tests and verify they pass.

### Task 2: Persistent evidence and editable rules

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260725_operational_location_attribution/migration.sql`
- Modify: `prisma/seed.ts`
- Create: `src/modules/location/rule-schema.ts`
- Test: `tests/unit/location/rule-schema.test.ts`

**Interfaces:**
- Adds `UserProfile.ipCountryCode`, `ipRegion`, `locationSource`, `locationRuleId`, `locationEvaluatedAt`.
- Adds `LocationAttributionRule` with exact-domain and suffix match types.
- Produces `locationRuleInputSchema`.

- [ ] Write schema tests for valid exact domains, suffixes, ISO country codes, duplicates, and prohibited global suffixes.
- [ ] Run the focused test and verify it fails.
- [ ] Add Prisma fields, rule model, migration backfill, and default seed rules.
- [ ] Generate Prisma client and run the focused test.

### Task 3: Local MMDB and RIR resolver chain

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/modules/geoip/mmdb-resolver.ts`
- Create: `src/modules/geoip/rir-resolver.ts`
- Create: `src/modules/geoip/resolver-chain.ts`
- Test: `tests/unit/geoip/mmdb-resolver.test.ts`
- Test: `tests/unit/geoip/rir-resolver.test.ts`
- Test: `tests/unit/geoip/resolver-chain.test.ts`

**Interfaces:**
- Produces `MmdbGeoIpResolver`.
- Produces `RirGeoIpResolver` using sorted IPv4/IPv6 ranges.
- Produces `FallbackGeoIpResolver` that queries MMDB, then RIR, then optional HTTP.

- [ ] Write failing tests using injected reader/range fixtures.
- [ ] Verify failures occur because the resolver classes do not exist.
- [ ] Install the `maxmind` package and implement lazy, reusable MMDB reading.
- [ ] Implement RIR range parsing and binary search for IPv4 and IPv6.
- [ ] Implement resolver chaining and verify focused tests pass.

### Task 4: Registration integration

**Files:**
- Modify: `src/modules/users/registration-location.ts`
- Modify: `src/modules/users/apply-event.ts`
- Test: `tests/unit/users/registration-location.test.ts`
- Test: `tests/unit/location/registration-attribution.test.ts`

**Interfaces:**
- Registration consumes current enabled location rules and `GeoIpResolver`.
- Registration persists raw IP geography and final operational geography.

- [ ] Add failing tests for Russian IP + QQ, Hong Kong IP + generic `.com`, `.ru` override, and resolver failure.
- [ ] Verify the new tests fail for missing behavior.
- [ ] Integrate attribution before the database transaction and persist evidence inside the transaction.
- [ ] Verify focused registration tests pass.

### Task 5: Rule management and compact administrator UI

**Files:**
- Create: `src/modules/location/rule-service.ts`
- Create: `src/app/api/automation/location-rules/route.ts`
- Create: `src/app/api/automation/location-rules/preview/route.ts`
- Create: `src/components/automation/location-rule-editor.tsx`
- Modify: `src/app/(dashboard)/automation/assignment/page.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Test: `tests/unit/components/location-rule-editor.test.tsx`
- Test: `tests/integration/location/rule-routes.test.ts`

**Interfaces:**
- `POST /api/automation/location-rules/preview` returns impacted user counts.
- `POST /api/automation/location-rules` atomically publishes the rule set and records an audit entry.

- [ ] Write failing component and route tests.
- [ ] Implement atomic preview/publish services and authorization.
- [ ] Implement the compact editor without exposing internal algorithm language.
- [ ] Verify focused component tests; run integration tests when PostgreSQL is reachable.

### Task 6: Full recomputation and deterministic fallback owner

**Files:**
- Create: `src/modules/location/recompute-users.ts`
- Create: `src/worker/handlers/location-recalculation.ts`
- Modify: `src/modules/assignment/assign-task.ts`
- Modify: `src/modules/assignment/match-rule.ts`
- Test: `tests/unit/location/recompute-users.test.ts`
- Test: `tests/unit/assignment/match-rule.test.ts`
- Test: `tests/integration/location/recalculation.test.ts`

**Interfaces:**
- Publishing rules schedules a paginated recomputation.
- Assignment falls back to the configured default responsible member rather than a public pool for location-related assignment.

- [ ] Write failing tests for paginated recomputation, reassignment, audit logging, retry isolation, and default-owner fallback.
- [ ] Implement the recomputation handler and default-owner decision.
- [ ] Verify unit tests and integration tests when PostgreSQL is reachable.

### Task 7: Environment, container, and update documentation

**Files:**
- Modify: `src/lib/env/server.ts`
- Modify: `.env.example`
- Modify: `../deploy/recall.env.example`
- Modify: `../deploy/docker-compose.recall.yml`
- Modify: `docs/runbooks/deployment.md`
- Modify: `tests/unit/env/server.test.ts`
- Modify: `tests/unit/config/compose-files.test.ts`

**Interfaces:**
- Adds `GEOIP_MMDB_PATH`, `GEOIP_RIR_PATH`, and a default-owner configuration.

- [ ] Add failing environment and compose tests.
- [ ] Add read-only database mounts and documented update procedure.
- [ ] Verify focused tests pass.

### Task 8: Final verification

**Files:**
- Verify all changed files.

- [ ] Run `npm exec vitest run tests/unit`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Review the requirement checklist and report any integration tests blocked by unavailable PostgreSQL separately.

