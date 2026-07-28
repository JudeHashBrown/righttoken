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

-- Strict F-group anomaly state:
-- final failures only, user-side errors excluded, 3 failures / 50% trigger,
-- 3 consecutive successes recover, and no active state may outlive 24 hours.
WITH final_request_events AS (
  SELECT
    ul.user_id,
    ul.created_at,
    ul.id AS event_id,
    0 AS source_order,
    false AS failed
  FROM usage_logs ul
  WHERE ul.created_at >= NOW() - INTERVAL '24 hours 30 minutes'

  UNION ALL

  SELECT
    error_log.user_id,
    error_log.created_at,
    error_log.id AS event_id,
    1 AS source_order,
    true AS failed
  FROM ops_error_logs error_log
  WHERE error_log.user_id IS NOT NULL
    AND error_log.created_at >= NOW() - INTERVAL '24 hours 30 minutes'
    AND error_log.status_code >= 400
    AND COALESCE(error_log.is_business_limited, false) = false
    AND COALESCE(error_log.error_owner, 'platform') <> 'client'
    AND COALESCE(error_log.error_phase, 'internal') NOT IN ('request', 'auth')
    AND COALESCE(error_log.error_type, '') NOT IN (
      'invalid_request_error',
      'authentication_error',
      'billing_error',
      'subscription_error'
    )
),
request_event_transitions AS (
  SELECT
    event.*,
    CASE
      WHEN LAG(event.failed) OVER (
        PARTITION BY event.user_id
        ORDER BY event.created_at, event.source_order, event.event_id
      ) IS DISTINCT FROM event.failed
      THEN 1
      ELSE 0
    END AS starts_new_run
  FROM final_request_events event
),
request_event_windows AS (
  SELECT
    event.*,
    SUM(event.starts_new_run) OVER (
      PARTITION BY event.user_id
      ORDER BY event.created_at, event.source_order, event.event_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS run_id,
    COUNT(*) OVER (
      PARTITION BY event.user_id
      ORDER BY event.created_at
      RANGE BETWEEN INTERVAL '30 minutes' PRECEDING AND CURRENT ROW
    ) AS request_count,
    COUNT(*) FILTER (WHERE event.failed) OVER (
      PARTITION BY event.user_id
      ORDER BY event.created_at
      RANGE BETWEEN INTERVAL '30 minutes' PRECEDING AND CURRENT ROW
    ) AS failure_count
  FROM request_event_transitions event
),
request_event_metrics AS (
  SELECT
    event.*,
    CASE
      WHEN event.failed THEN COUNT(*) OVER (
        PARTITION BY event.user_id, event.run_id
        ORDER BY event.created_at, event.source_order, event.event_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )
      ELSE 0
    END AS consecutive_failures,
    CASE
      WHEN NOT event.failed THEN COUNT(*) OVER (
        PARTITION BY event.user_id, event.run_id
        ORDER BY event.created_at, event.source_order, event.event_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )
      ELSE 0
    END AS consecutive_successes
  FROM request_event_windows event
),
request_state_markers AS (
  SELECT
    event.user_id,
    event.created_at,
    event.source_order,
    event.event_id,
    CASE
      WHEN event.failed
        AND (
          event.consecutive_failures >= 3
          OR (
            event.request_count >= 3
            AND event.failure_count * 2 >= event.request_count
          )
        )
      THEN true
      WHEN NOT event.failed
        AND event.consecutive_successes >= 3
      THEN false
      ELSE NULL
    END AS anomaly_active
  FROM request_event_metrics event
  WHERE event.created_at >= NOW() - INTERVAL '24 hours'
),
latest_anomaly_state AS (
  SELECT DISTINCT ON (marker.user_id)
    marker.user_id,
    marker.anomaly_active,
    marker.created_at AS anomaly_changed_at
  FROM request_state_markers marker
  WHERE marker.anomaly_active IS NOT NULL
  ORDER BY
    marker.user_id,
    marker.created_at DESC,
    marker.source_order DESC,
    marker.event_id DESC
)
SELECT
  COUNT(*) FILTER (
    WHERE anomaly_active
      AND anomaly_changed_at >= NOW() - INTERVAL '24 hours'
  ) AS active_recall_anomalies,
  COUNT(*) FILTER (
    WHERE anomaly_active
      AND anomaly_changed_at < NOW() - INTERVAL '24 hours'
  ) AS expired_but_active
FROM latest_anomaly_state;

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
