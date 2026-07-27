\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

-- Schema readiness. registration_ip must exist before enabling the export.
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'registration_ip'
  ) AS registration_ip_ready;

-- Source totals used when comparing the first full reconciliation.
SELECT
  COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active_users,
  COUNT(*) FILTER (
    WHERE deleted_at IS NULL
      AND NULLIF(registration_ip, '') IS NOT NULL
  ) AS users_with_registration_ip
FROM users;

-- Monetary source-of-truth check:
-- payment order amount/refund_amount are CNY yuan;
-- user balance is USD;
-- the recall API returns normalized USD cents at the existing 7:1 rate.
SELECT
  COUNT(*) FILTER (WHERE paid_at IS NOT NULL) AS paid_orders,
  ROUND(COALESCE(SUM(
    GREATEST(amount - COALESCE(refund_amount, 0), 0)
  ) FILTER (WHERE paid_at IS NOT NULL), 0), 2) AS net_paid_cny,
  ROUND(COALESCE(SUM(
    GREATEST(amount - COALESCE(refund_amount, 0), 0)
  ) FILTER (WHERE paid_at IS NOT NULL), 0) / 7.0, 2)
    AS normalized_net_paid_usd
FROM payment_orders;

SELECT
  ROUND(COALESCE(SUM(balance), 0), 2) AS current_balance_usd,
  ROUND(COALESCE(SUM(balance), 0) * 100, 0)::bigint
    AS current_balance_usd_minor
FROM users
WHERE deleted_at IS NULL;

-- usage_logs is the successful billable ledger. Failed requests are stored in
-- ops_error_logs and are intentionally excluded from successful_call_count.
SELECT
  COUNT(*) AS successful_usage_rows,
  COUNT(DISTINCT user_id) AS users_with_successful_usage,
  MAX(created_at) AS last_successful_usage_at
FROM usage_logs;

SELECT
  COUNT(*) FILTER (
    WHERE user_id IS NOT NULL
      AND COALESCE(resolved, false) = false
      AND COALESCE(is_business_limited, false) = false
      AND severity IN ('P0', 'P1')
  ) AS active_recall_anomalies
FROM ops_error_logs;

-- PII-free sample for field-level review. A payment order is created when the
-- user enters the checkout/order flow, so MIN(created_at) is checkoutStartedAt.
WITH payment_sample AS (
  SELECT
    user_id,
    MIN(created_at) AS checkout_started_at,
    MIN(paid_at) FILTER (WHERE paid_at IS NOT NULL) AS first_paid_at,
    ROUND(COALESCE(SUM(
      GREATEST(amount - COALESCE(refund_amount, 0), 0)
    ) FILTER (WHERE paid_at IS NOT NULL), 0) / 7.0 * 100, 0)::bigint
      AS total_paid_usd_minor,
    MAX(updated_at) AS payment_updated_at
  FROM payment_orders
  GROUP BY user_id
),
usage_sample AS (
  SELECT
    user_id,
    COUNT(*) AS successful_call_count,
    MAX(created_at) AS last_call_at
  FROM usage_logs
  GROUP BY user_id
)
SELECT
  LEFT(MD5(u.id::text || ':' || LOWER(u.email)), 12) AS user_sample_key,
  u.created_at AS registered_at,
  NULLIF(u.registration_ip, '') IS NOT NULL AS has_registration_ip,
  ps.checkout_started_at,
  ps.first_paid_at,
  COALESCE(ps.total_paid_usd_minor, 0) AS total_paid_usd_minor,
  ROUND(u.balance * 100, 0)::bigint AS balance_usd_minor,
  COALESCE(us.successful_call_count, 0) AS successful_call_count,
  us.last_call_at
FROM users u
LEFT JOIN payment_sample ps ON ps.user_id = u.id
LEFT JOIN usage_sample us ON us.user_id = u.id
WHERE u.deleted_at IS NULL
ORDER BY GREATEST(
  u.updated_at,
  COALESCE(ps.payment_updated_at, u.updated_at),
  COALESCE(us.last_call_at, u.updated_at)
) DESC
LIMIT 20;

ROLLBACK;
