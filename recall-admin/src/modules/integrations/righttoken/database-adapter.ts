import { Pool } from "pg";

import type {
  RightTokenAdapter,
  RightTokenUserSnapshot
} from "@/modules/integrations/righttoken/adapter";

type DateValue = Date | string;

export type RightTokenUserFactRow = {
  id: bigint | number | string;
  email: string;
  display_name: string | null;
  registered_at: DateValue;
  effective_updated_at: DateValue;
  deleted_at?: DateValue | null;
  registration_ip: string | null;
  checkout_started_at: DateValue | null;
  first_paid_at: DateValue | null;
  total_paid_minor: bigint | number | string;
  first_call_at?: DateValue | null;
  successful_call_count: bigint | number | string;
  last_call_at: DateValue | null;
  balance_minor: bigint | number | string;
  anomaly_active: boolean;
};

export type RightTokenDatabaseQuery = (
  text: string,
  values: readonly unknown[]
) => Promise<{ rows: RightTokenUserFactRow[] }>;

type DatabaseCursor = {
  updatedAt: string;
  userId: string;
};

function buildRightTokenUsersSql(
  changedUserIdsSql: string,
  finalClause: string
): string {
  return `
WITH changed_user_ids AS (
    ${changedUserIdsSql}
),
payment_stats AS (
    SELECT
        po.user_id,
        MIN(po.created_at) AS checkout_started_at,
        MIN(po.paid_at) FILTER (
            WHERE po.paid_at IS NOT NULL
        ) AS first_paid_at,
        COALESCE(SUM(
            GREATEST(po.amount - COALESCE(po.refund_amount, 0), 0)
        ) FILTER (
            WHERE po.paid_at IS NOT NULL
        ), 0) AS total_paid_cny,
        MAX(po.updated_at) AS payment_updated_at
    FROM public.payment_orders po
    JOIN changed_user_ids changed ON changed.user_id = po.user_id
    GROUP BY po.user_id
),
first_payment_ip AS (
    SELECT DISTINCT ON (po.user_id)
        po.user_id,
        NULLIF(po.client_ip, '') AS client_ip
    FROM public.payment_orders po
    JOIN changed_user_ids changed ON changed.user_id = po.user_id
    WHERE NULLIF(po.client_ip, '') IS NOT NULL
    ORDER BY po.user_id, po.created_at ASC, po.id ASC
),
successful_usage_stats AS (
    SELECT
        ul.user_id,
        MIN(ul.created_at) AS first_call_at,
        COUNT(*) AS successful_call_count,
        MAX(ul.created_at) AS last_call_at
    FROM public.usage_logs ul
    JOIN changed_user_ids changed ON changed.user_id = ul.user_id
    GROUP BY ul.user_id
),
first_usage_ip AS (
    SELECT DISTINCT ON (ul.user_id)
        ul.user_id,
        NULLIF(ul.ip_address, '') AS ip_address
    FROM public.usage_logs ul
    JOIN changed_user_ids changed ON changed.user_id = ul.user_id
    WHERE NULLIF(ul.ip_address, '') IS NOT NULL
    ORDER BY ul.user_id, ul.created_at ASC, ul.id ASC
),
anomaly_stats AS (
    SELECT
        error_log.user_id,
        BOOL_OR(
            COALESCE(error_log.resolved, false) = false
            AND COALESCE(error_log.is_business_limited, false) = false
            AND error_log.severity IN ('P0', 'P1')
        ) AS anomaly_active,
        MAX(COALESCE(error_log.resolved_at, error_log.created_at))
            AS anomaly_updated_at
    FROM public.ops_error_logs error_log
    JOIN changed_user_ids changed
      ON changed.user_id = error_log.user_id
    WHERE error_log.user_id IS NOT NULL
    GROUP BY error_log.user_id
),
snapshots AS (
    SELECT
        u.id,
        u.email,
        NULLIF(u.username, '') AS display_name,
        u.created_at AS registered_at,
        u.deleted_at,
        GREATEST(
            u.updated_at,
            COALESCE(ps.payment_updated_at, u.updated_at),
            COALESCE(us.last_call_at, u.updated_at),
            COALESCE(ans.anomaly_updated_at, u.updated_at)
        ) AS effective_updated_at,
        COALESCE(
            NULLIF(u.registration_ip, ''),
            fpi.client_ip,
            fui.ip_address
        ) AS registration_ip,
        ps.checkout_started_at,
        ps.first_paid_at,
        COALESCE(ROUND(ps.total_paid_cny / 7.0 * 100), 0)::bigint
            AS total_paid_minor,
        us.first_call_at,
        COALESCE(us.successful_call_count, 0)::bigint
            AS successful_call_count,
        us.last_call_at,
        ROUND(u.balance * 100)::bigint AS balance_minor,
        COALESCE(ans.anomaly_active, false) AS anomaly_active
    FROM public.users u
    JOIN changed_user_ids changed ON changed.user_id = u.id
    LEFT JOIN payment_stats ps ON ps.user_id = u.id
    LEFT JOIN first_payment_ip fpi ON fpi.user_id = u.id
    LEFT JOIN successful_usage_stats us ON us.user_id = u.id
    LEFT JOIN first_usage_ip fui ON fui.user_id = u.id
    LEFT JOIN anomaly_stats ans ON ans.user_id = u.id
)
SELECT
    id,
    email,
    display_name,
    registered_at,
    effective_updated_at,
    deleted_at,
    registration_ip,
    checkout_started_at,
    first_paid_at,
    total_paid_minor,
    first_call_at,
    successful_call_count,
    last_call_at,
    balance_minor,
    anomaly_active
FROM snapshots
${finalClause}`;
}

const listRightTokenUsersSql = buildRightTokenUsersSql(
  `SELECT id AS user_id
    FROM public.users
    WHERE updated_at >= $1
    UNION
    SELECT user_id
    FROM public.payment_orders
    WHERE updated_at >= $1
    UNION
    SELECT user_id
    FROM public.usage_logs
    WHERE created_at >= $1
    UNION
    SELECT user_id
    FROM public.ops_error_logs
    WHERE user_id IS NOT NULL
      AND COALESCE(resolved_at, created_at) >= $1`,
  `WHERE (effective_updated_at, id) > ($1, $2)
ORDER BY effective_updated_at ASC, id ASC
LIMIT $3`
);

const getRightTokenUsersByIdsSql = buildRightTokenUsersSql(
  `SELECT id AS user_id
    FROM public.users
    WHERE id = ANY($1::bigint[])`,
  "ORDER BY id ASC"
);

let sharedPool: Pool | undefined;

function defaultDatabaseQuery(
  text: string,
  values: readonly unknown[]
): Promise<{ rows: RightTokenUserFactRow[] }> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  sharedPool ??= new Pool({ connectionString });
  return sharedPool.query<RightTokenUserFactRow>(text, [...values]);
}

function dateValue(value: DateValue): Date {
  const result = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(result.getTime())) {
    throw new Error("RIGHTTOKEN_DATABASE_DATE_INVALID");
  }
  return result;
}

function nullableDateValue(value: DateValue | null): Date | null {
  return value === null ? null : dateValue(value);
}

function safeInteger(value: bigint | number | string): number {
  let result: number;
  if (typeof value === "bigint") {
    result = Number(value);
  } else if (typeof value === "string") {
    if (!/^-?\d+$/.test(value)) {
      throw new Error("RIGHTTOKEN_DATABASE_INTEGER_INVALID");
    }
    result = Number(value);
  } else {
    result = value;
  }
  if (!Number.isSafeInteger(result)) {
    throw new Error("RIGHTTOKEN_DATABASE_INTEGER_OUT_OF_RANGE");
  }
  return result;
}

function userIdValue(value: bigint | number | string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error("RIGHTTOKEN_DATABASE_USER_ID_INVALID");
  }
}

function encodeCursor(row: RightTokenUserFactRow): string {
  const cursor: DatabaseCursor = {
    updatedAt: dateValue(row.effective_updated_at).toISOString(),
    userId: userIdValue(row.id).toString()
  };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(raw: string): {
  updatedAt: Date;
  userId: bigint;
} {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as Partial<DatabaseCursor>;
    if (
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.userId !== "string" ||
      !/^\d+$/.test(parsed.userId)
    ) {
      throw new Error("invalid cursor fields");
    }
    return {
      updatedAt: dateValue(parsed.updatedAt),
      userId: BigInt(parsed.userId)
    };
  } catch {
    throw new Error("RIGHTTOKEN_DATABASE_CURSOR_INVALID");
  }
}

function snapshotFromRow(row: RightTokenUserFactRow): RightTokenUserSnapshot {
  return {
    externalUserId: userIdValue(row.id).toString(),
    email: row.email,
    displayName: row.display_name,
    registeredAt: dateValue(row.registered_at),
    updatedAt: dateValue(row.effective_updated_at),
    deletedAt: nullableDateValue(row.deleted_at ?? null),
    registrationIp: row.registration_ip,
    countryCode: null,
    region: null,
    language: null,
    timezone: null,
    source: null,
    checkoutStartedAt: nullableDateValue(row.checkout_started_at),
    firstPaidAt: nullableDateValue(row.first_paid_at),
    totalPaidMinor: safeInteger(row.total_paid_minor),
    totalPaidCurrency: "USD",
    firstCallAt: nullableDateValue(row.first_call_at ?? null),
    successfulCallCount: safeInteger(row.successful_call_count),
    lastCallAt: nullableDateValue(row.last_call_at),
    balanceMinor: safeInteger(row.balance_minor),
    balanceCurrency: "USD",
    balanceUsdMinor: safeInteger(row.balance_minor),
    anomalyActive: row.anomaly_active
  };
}

export async function getRightTokenUserSnapshotsByIds(
  externalUserIds: string[],
  query: RightTokenDatabaseQuery = defaultDatabaseQuery
): Promise<RightTokenUserSnapshot[]> {
  const uniqueIds = [
    ...new Set(externalUserIds.map((value) => userIdValue(value)))
  ];
  if (uniqueIds.length === 0) {
    return [];
  }
  if (uniqueIds.length > 1_000) {
    throw new Error("RIGHTTOKEN_DATABASE_BATCH_LIMIT_EXCEEDED");
  }
  const result = await query(getRightTokenUsersByIdsSql, [uniqueIds]);
  return result.rows.map(snapshotFromRow);
}

export function createRightTokenDatabaseAdapter(
  query: RightTokenDatabaseQuery = defaultDatabaseQuery
): RightTokenAdapter {
  return {
    async verifyConnection() {
      await query("SELECT 1 AS ok", []);
      return {
        ok: true,
        source: "righttoken-database"
      };
    },

    async listUsers(input) {
      const limit = Math.min(500, Math.max(1, input.limit));
      const boundary = input.cursor
        ? decodeCursor(input.cursor)
        : {
            updatedAt: input.updatedAfter
              ? new Date(input.updatedAfter)
              : new Date(0),
            userId: 0n
          };
      const result = await query(listRightTokenUsersSql, [
        boundary.updatedAt,
        boundary.userId,
        limit + 1
      ]);
      const hasMore = result.rows.length > limit;
      const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
      return {
        users: rows.map(snapshotFromRow),
        nextCursor:
          hasMore && rows.length > 0
            ? encodeCursor(rows[rows.length - 1]!)
            : null
      };
    }
  };
}
