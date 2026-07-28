# RightToken Recall Users API Implementation Plan

> Execute with test-driven development. Do not commit or push until the user explicitly requests GitHub synchronization.

**Goal:** Add a secret-authenticated, read-only RightToken user snapshot endpoint and connect it to the recall admin HTTP adapter without persisting real customer data in the repository.

**Architecture:** A dedicated Gin route uses a narrowly scoped Bearer-secret middleware. A recall export service performs keyset pagination over user facts and aggregate payment/usage data. Registration IP is captured for new registrations and uses read-only historical fallback during export. The recall admin consumes the endpoint through its existing adapter.

**Tech stack:** Go, Gin, Ent/PostgreSQL, TypeScript, Next.js, Zod, Vitest.

---

## Task 1: Lock the HTTP contract with failing tests

**Files:**

- Create: `backend/internal/handler/admin/recall_user_handler_test.go`
- Create: `backend/internal/server/middleware/recall_export_auth_test.go`
- Modify: `recall-admin/tests/unit/integrations/righttoken-http-adapter.test.ts`

1. Add tests proving missing and incorrect Bearer secrets return `401`.
2. Add a test proving a correct independent secret reaches the handler.
3. Add handler tests for default `limit`, maximum `limit`, invalid `updated_after`, and invalid cursor.
4. Add adapter contract coverage for `/api/v1/admin/recall/users`.
5. Run the focused tests and verify they fail for the expected missing implementation.

## Task 2: Add secure configuration and route authentication

**Files:**

- Modify: `backend/internal/config/config.go`
- Modify: relevant example configuration files
- Create: `backend/internal/server/middleware/recall_export_auth.go`
- Modify: backend route registration files

1. Add a recall export configuration section sourced from `RECALL_EXPORT_SECRET`.
2. Make an empty secret fail closed for this route.
3. Implement strict Bearer parsing and fixed-time secret comparison.
4. Register the exact read-only route without admin JWT middleware.
5. Run middleware and route tests.

## Task 3: Capture registration IP for new users

**Files:**

- Modify: `backend/ent/schema/user.go`
- Create: next numbered backend SQL migration
- Modify: `backend/internal/service/user.go` or corresponding user model
- Modify: auth handler and auth service registration inputs
- Modify: OAuth registration handlers/services where applicable
- Add/modify focused auth and repository tests

1. Write a failing test showing a newly registered user retains the supplied registration IP.
2. Add the nullable database column and Ent field.
3. Pass trusted client IP from HTTP registration entry points into new-user creation.
4. Ensure login and repeat OAuth login never overwrite the original value.
5. Run generation/formatting needed by Ent and the focused tests.

## Task 4: Implement snapshot aggregation and keyset pagination

**Files:**

- Create: backend recall export service/model files
- Create: backend recall export repository files
- Create: focused unit and integration tests

1. Create fixtures for users with no orders/calls, pending checkout, paid orders, and usage logs.
2. Write failing tests for all response field mappings.
3. Write failing tests for registration IP fallback order.
4. Write failing tests for `(effective_updated_at, user_id)` pagination across equal timestamps.
5. Implement a bounded aggregate query that avoids per-user N+1 queries.
6. Convert monetary decimals deterministically to minor units.
7. Return nullable location/profile fields explicitly and `anomalyActive=false` until a real anomaly source exists.
8. Run focused repository/service tests.

## Task 5: Implement the handler and exact JSON response

**Files:**

- Create: `backend/internal/handler/admin/recall_user_handler.go`
- Modify: handler dependency assembly
- Modify: route registration

1. Parse and validate query parameters.
2. Call the recall export service.
3. Emit `{users, nextCursor}` using the exact camelCase contract.
4. Confirm only `GET` exists and unsupported methods cannot mutate state.
5. Run handler and route tests.

## Task 6: Connect the recall admin adapter

**Files:**

- Modify: `recall-admin/src/modules/integrations/righttoken/http-adapter.ts`
- Modify: `recall-admin/src/app/api/integrations/righttoken/route.ts`
- Modify: `recall-admin/.env.example`
- Modify: `recall-admin/docs/deployment.md`
- Modify: focused adapter/config tests

1. Change the default users path to `/api/v1/admin/recall/users`.
2. Keep the secret server-only and never expose it through client components.
3. Add documentation for separate main-site and recall-service environment variables.
4. Run adapter, environment, and integration tests.

## Task 7: Verify privacy and the complete local flow

1. Run Go formatting, focused Go tests, and the relevant backend test suite.
2. Run recall admin unit tests, type checking, linting, and build.
3. Search tracked and untracked project files for accidental real-user exports, secret literals, CSV/JSON snapshots, and debug response dumps.
4. Start local services and test with generated fixtures.
5. When production access is available, request at most five real users in memory, confirm import → location → segment → assignment → task generation, and do not redirect the response to a file.
6. Report any main-site fields that remain unavailable instead of fabricating them.
