package admin

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	defaultRecallUserLimit = 50
	maxRecallUserLimit     = 200
)

type recallUserCursor struct {
	UpdatedAt time.Time `json:"updatedAt"`
	UserID    int64     `json:"userId"`
}

type recallUserSnapshot struct {
	ExternalUserID      string     `json:"externalUserId"`
	Email               string     `json:"email"`
	DisplayName         *string    `json:"displayName"`
	RegisteredAt        time.Time  `json:"registeredAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
	RegistrationIP      *string    `json:"registrationIp"`
	CountryCode         *string    `json:"countryCode"`
	Region              *string    `json:"region"`
	Language            *string    `json:"language"`
	Timezone            *string    `json:"timezone"`
	Source              *string    `json:"source"`
	CheckoutStartedAt   *time.Time `json:"checkoutStartedAt"`
	FirstPaidAt         *time.Time `json:"firstPaidAt"`
	TotalPaidMinor      int64      `json:"totalPaidMinor"`
	TotalPaidCurrency   string     `json:"totalPaidCurrency"`
	SuccessfulCallCount int64      `json:"successfulCallCount"`
	LastCallAt          *time.Time `json:"lastCallAt"`
	BalanceMinor        int64      `json:"balanceMinor"`
	BalanceCurrency     string     `json:"balanceCurrency"`
	BalanceUSDMinor     int64      `json:"balanceUsdMinor"`
	AnomalyActive       bool       `json:"anomalyActive"`

	userID int64
}

type recallUserStore interface {
	ListRecallUsers(
		ctx context.Context,
		after time.Time,
		afterUserID int64,
		limit int,
	) ([]recallUserSnapshot, error)
}

type sqlRecallUserStore struct {
	db *sql.DB
}

// RecallUserHandler serves the narrowly scoped, read-only recall export.
type RecallUserHandler struct {
	store recallUserStore
}

func NewRecallUserHandler(db *sql.DB) *RecallUserHandler {
	return &RecallUserHandler{store: &sqlRecallUserStore{db: db}}
}

func newRecallUserHandlerWithStore(store recallUserStore) *RecallUserHandler {
	return &RecallUserHandler{store: store}
}

// List returns stable, keyset-paginated user snapshots.
// GET /api/v1/admin/recall/users
func (h *RecallUserHandler) List(c *gin.Context) {
	limit, err := parseRecallUserLimit(c.Query("limit"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "INVALID_LIMIT",
			"message": "limit must be an integer between 1 and 200",
		})
		return
	}

	after, afterUserID, err := parseRecallUserPosition(
		c.Query("cursor"),
		c.Query("updated_after"),
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "INVALID_CURSOR",
			"message": "cursor or updated_after is invalid",
		})
		return
	}

	users, err := h.store.ListRecallUsers(
		c.Request.Context(),
		after,
		afterUserID,
		limit+1,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "RECALL_EXPORT_FAILED",
			"message": "Unable to export recall users",
		})
		return
	}

	var nextCursor *string
	if len(users) > limit {
		users = users[:limit]
		last := users[len(users)-1]
		encoded, encodeErr := encodeRecallUserCursor(recallUserCursor{
			UpdatedAt: last.UpdatedAt,
			UserID:    last.userID,
		})
		if encodeErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"code":    "RECALL_EXPORT_FAILED",
				"message": "Unable to export recall users",
			})
			return
		}
		nextCursor = &encoded
	}

	if users == nil {
		users = []recallUserSnapshot{}
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"users":      users,
		"nextCursor": nextCursor,
	})
}

func parseRecallUserLimit(raw string) (int, error) {
	if strings.TrimSpace(raw) == "" {
		return defaultRecallUserLimit, nil
	}
	limit, err := strconv.Atoi(raw)
	if err != nil || limit < 1 || limit > maxRecallUserLimit {
		return 0, errors.New("invalid limit")
	}
	return limit, nil
}

func parseRecallUserPosition(cursorRaw, updatedAfterRaw string) (time.Time, int64, error) {
	if strings.TrimSpace(cursorRaw) != "" {
		cursor, err := decodeRecallUserCursor(cursorRaw)
		if err != nil || cursor.UserID < 1 || cursor.UpdatedAt.IsZero() {
			return time.Time{}, 0, errors.New("invalid cursor")
		}
		return cursor.UpdatedAt.UTC(), cursor.UserID, nil
	}
	if strings.TrimSpace(updatedAfterRaw) == "" {
		return time.Unix(0, 0).UTC(), 0, nil
	}
	updatedAfter, err := time.Parse(time.RFC3339Nano, updatedAfterRaw)
	if err != nil {
		return time.Time{}, 0, err
	}
	// A timestamp-only boundary is strictly "after". The maximum user ID
	// excludes rows whose effective update time is exactly equal to it.
	return updatedAfter.UTC(), math.MaxInt64, nil
}

func encodeRecallUserCursor(cursor recallUserCursor) (string, error) {
	payload, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(payload), nil
}

func decodeRecallUserCursor(raw string) (recallUserCursor, error) {
	payload, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return recallUserCursor{}, err
	}
	var cursor recallUserCursor
	if err := json.Unmarshal(payload, &cursor); err != nil {
		return recallUserCursor{}, err
	}
	return cursor, nil
}

const listRecallUsersQuery = `
WITH changed_user_ids AS (
    SELECT id AS user_id
    FROM users
    WHERE updated_at >= $1
    UNION
    SELECT user_id
    FROM payment_orders
    WHERE updated_at >= $1
    UNION
    SELECT user_id
    FROM usage_logs
    WHERE created_at >= $1
    UNION
    SELECT user_id
    FROM ops_error_logs
    WHERE user_id IS NOT NULL
      AND COALESCE(resolved_at, created_at) >= $1
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
    FROM payment_orders po
    JOIN changed_user_ids changed ON changed.user_id = po.user_id
    GROUP BY po.user_id
),
first_payment_ip AS (
    SELECT DISTINCT ON (po.user_id)
        po.user_id,
        NULLIF(po.client_ip, '') AS client_ip
    FROM payment_orders po
    JOIN changed_user_ids changed ON changed.user_id = po.user_id
    WHERE NULLIF(po.client_ip, '') IS NOT NULL
    ORDER BY po.user_id, po.created_at ASC, po.id ASC
),
-- usage_logs is the successful, billable request ledger. Failed requests are
-- stored separately in ops_error_logs and therefore must not be counted here.
successful_usage_stats AS (
    SELECT
        ul.user_id,
        COUNT(*) AS successful_call_count,
        MAX(ul.created_at) AS last_call_at
    FROM usage_logs ul
    JOIN changed_user_ids changed ON changed.user_id = ul.user_id
    GROUP BY ul.user_id
),
first_usage_ip AS (
    SELECT DISTINCT ON (ul.user_id)
        ul.user_id,
        NULLIF(ul.ip_address, '') AS ip_address
    FROM usage_logs ul
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
    FROM ops_error_logs error_log
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
        -- RightToken payment orders are denominated in CNY while recall
        -- amounts and user balances are normalized to USD minor units.
        -- This uses the same fixed 7.0 CNY/USD convention as fulfillment.
        COALESCE(ROUND(ps.total_paid_cny / 7.0 * 100), 0)::bigint
            AS total_paid_minor,
        COALESCE(us.successful_call_count, 0)::bigint AS successful_call_count,
        us.last_call_at,
        ROUND(u.balance * 100)::bigint AS balance_minor,
        COALESCE(ans.anomaly_active, false) AS anomaly_active
    FROM users u
    JOIN changed_user_ids changed ON changed.user_id = u.id
    LEFT JOIN payment_stats ps ON ps.user_id = u.id
    LEFT JOIN first_payment_ip fpi ON fpi.user_id = u.id
    LEFT JOIN successful_usage_stats us ON us.user_id = u.id
    LEFT JOIN first_usage_ip fui ON fui.user_id = u.id
    LEFT JOIN anomaly_stats ans ON ans.user_id = u.id
    WHERE u.deleted_at IS NULL
)
SELECT
    id,
    email,
    display_name,
    registered_at,
    effective_updated_at,
    registration_ip,
    checkout_started_at,
    first_paid_at,
    total_paid_minor,
    successful_call_count,
    last_call_at,
    balance_minor,
    anomaly_active
FROM snapshots
WHERE (effective_updated_at, id) > ($1, $2)
ORDER BY effective_updated_at ASC, id ASC
LIMIT $3`

func (s *sqlRecallUserStore) ListRecallUsers(
	ctx context.Context,
	after time.Time,
	afterUserID int64,
	limit int,
) ([]recallUserSnapshot, error) {
	if s == nil || s.db == nil {
		return nil, errors.New("recall user database is unavailable")
	}

	rows, err := s.db.QueryContext(ctx, listRecallUsersQuery, after, afterUserID, limit)
	if err != nil {
		return nil, fmt.Errorf("query recall users: %w", err)
	}
	defer rows.Close()

	users := make([]recallUserSnapshot, 0, min(limit, maxRecallUserLimit+1))
	for rows.Next() {
		var user recallUserSnapshot
		var displayName sql.NullString
		var registrationIP sql.NullString
		var checkoutStartedAt sql.NullTime
		var firstPaidAt sql.NullTime
		var lastCallAt sql.NullTime

		if err := rows.Scan(
			&user.userID,
			&user.Email,
			&displayName,
			&user.RegisteredAt,
			&user.UpdatedAt,
			&registrationIP,
			&checkoutStartedAt,
			&firstPaidAt,
			&user.TotalPaidMinor,
			&user.SuccessfulCallCount,
			&lastCallAt,
			&user.BalanceMinor,
			&user.AnomalyActive,
		); err != nil {
			return nil, fmt.Errorf("scan recall user: %w", err)
		}

		user.ExternalUserID = strconv.FormatInt(user.userID, 10)
		user.DisplayName = nullStringPointer(displayName)
		user.RegistrationIP = nullStringPointer(registrationIP)
		user.CheckoutStartedAt = nullTimePointer(checkoutStartedAt)
		user.FirstPaidAt = nullTimePointer(firstPaidAt)
		user.LastCallAt = nullTimePointer(lastCallAt)
		user.TotalPaidCurrency = "USD"
		user.BalanceCurrency = "USD"
		user.BalanceUSDMinor = user.BalanceMinor
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recall users: %w", err)
	}
	return users, nil
}

func nullStringPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	trimmed := strings.TrimSpace(value.String)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func nullTimePointer(value sql.NullTime) *time.Time {
	if !value.Valid {
		return nil
	}
	result := value.Time.UTC()
	return &result
}

// minorUnits is kept separate for unit testing decimal boundary behavior.
func minorUnits(value float64) int64 {
	return int64(math.Round(value * 100))
}
