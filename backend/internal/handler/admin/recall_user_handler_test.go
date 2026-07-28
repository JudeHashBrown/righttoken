//go:build unit

package admin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRecallUserQueryUsesDocumentedBusinessFacts(t *testing.T) {
	require.Contains(t, listRecallUsersQuery, "MIN(po.created_at) AS checkout_started_at")
	require.Contains(t, listRecallUsersQuery, "changed_user_ids AS")
	require.Contains(t, listRecallUsersQuery, "updated_at >= $1")
	require.Contains(t, listRecallUsersQuery, "JOIN changed_user_ids")
	require.Contains(t, listRecallUsersQuery, "FROM usage_logs")
	require.Contains(t, listRecallUsersQuery, "FROM ops_error_logs")
	require.Contains(t, listRecallUsersQuery, "po.amount - COALESCE(po.refund_amount, 0)")
	require.Contains(t, listRecallUsersQuery, "ps.total_paid_cny / 7.0 * 100")
	require.NotContains(t, listRecallUsersQuery, "pay_amount")
	require.NotContains(t, strings.ToLower(listRecallUsersQuery), "select *")
}

func TestRecallUserQueryUsesStrictAnomalyStateMachine(t *testing.T) {
	require.Contains(t, listRecallUsersQuery, "final_request_events AS")
	require.Contains(t, listRecallUsersQuery, "error_log.status_code >= 400")
	require.Contains(t, listRecallUsersQuery, "INTERVAL '30 minutes'")
	require.Contains(t, listRecallUsersQuery, "event.consecutive_failures >= 3")
	require.Contains(t, listRecallUsersQuery, "event.failure_count * 2 >= event.request_count")
	require.Contains(t, listRecallUsersQuery, "event.consecutive_successes >= 3")
	require.Contains(t, listRecallUsersQuery, "INTERVAL '24 hours'")
	require.Contains(t, listRecallUsersQuery, "anomaly_changed_at")
	require.NotContains(
		t,
		listRecallUsersQuery,
		"COALESCE(error_log.resolved, false) = false",
	)
}

func TestMinorUnitsRoundsDecimalBoundaries(t *testing.T) {
	require.Equal(t, int64(123), minorUnits(1.234))
	require.Equal(t, int64(124), minorUnits(1.235))
	require.Equal(t, int64(0), minorUnits(0))
}

type stubRecallUserStore struct {
	list func(
		ctx context.Context,
		after time.Time,
		afterUserID int64,
		limit int,
	) ([]recallUserSnapshot, error)
}

func (s stubRecallUserStore) ListRecallUsers(
	ctx context.Context,
	after time.Time,
	afterUserID int64,
	limit int,
) ([]recallUserSnapshot, error) {
	return s.list(ctx, after, afterUserID, limit)
}

func TestRecallUserHandlerList(t *testing.T) {
	gin.SetMode(gin.TestMode)
	firstUpdate := time.Date(2026, 7, 24, 1, 0, 0, 0, time.UTC)
	secondUpdate := firstUpdate.Add(time.Hour)
	thirdUpdate := secondUpdate.Add(time.Hour)

	store := stubRecallUserStore{
		list: func(
			_ context.Context,
			after time.Time,
			afterUserID int64,
			limit int,
		) ([]recallUserSnapshot, error) {
			require.Equal(t, time.Unix(0, 0).UTC(), after)
			require.Zero(t, afterUserID)
			require.Equal(t, 3, limit)
			return []recallUserSnapshot{
				testRecallSnapshot(1, firstUpdate),
				testRecallSnapshot(2, secondUpdate),
				testRecallSnapshot(3, thirdUpdate),
			}, nil
		},
	}

	router := gin.New()
	router.GET("/users", newRecallUserHandlerWithStore(store).List)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/users?limit=2", nil)

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	var body struct {
		Users      []map[string]any `json:"users"`
		NextCursor *string          `json:"nextCursor"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
	require.Len(t, body.Users, 2)
	require.NotNil(t, body.NextCursor)
	require.Equal(t, "1", body.Users[0]["externalUserId"])
	require.Equal(t, "USD", body.Users[0]["totalPaidCurrency"])
	require.Equal(t, "USD", body.Users[0]["balanceCurrency"])

	cursor, err := decodeRecallUserCursor(*body.NextCursor)
	require.NoError(t, err)
	require.Equal(t, int64(2), cursor.UserID)
	require.Equal(t, secondUpdate, cursor.UpdatedAt)
}

func TestRecallUserHandlerRejectsInvalidQueries(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := newRecallUserHandlerWithStore(stubRecallUserStore{
		list: func(
			context.Context,
			time.Time,
			int64,
			int,
		) ([]recallUserSnapshot, error) {
			t.Fatal("store must not be called for invalid input")
			return nil, nil
		},
	})

	tests := []string{
		"/users?limit=0",
		"/users?limit=201",
		"/users?limit=not-a-number",
		"/users?updated_after=yesterday",
		"/users?cursor=not-base64",
	}
	for _, target := range tests {
		response := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, target, nil)
		context, _ := gin.CreateTestContext(response)
		context.Request = request

		handler.List(context)

		require.Equal(t, http.StatusBadRequest, response.Code, target)
	}
}

func TestRecallCursorTakesPrecedenceOverUpdatedAfter(t *testing.T) {
	cursorTime := time.Date(2026, 7, 25, 3, 0, 0, 0, time.UTC)
	encoded, err := encodeRecallUserCursor(recallUserCursor{
		UpdatedAt: cursorTime,
		UserID:    42,
	})
	require.NoError(t, err)

	after, userID, err := parseRecallUserPosition(
		encoded,
		"not-a-valid-time",
	)

	require.NoError(t, err)
	require.Equal(t, cursorTime, after)
	require.Equal(t, int64(42), userID)
}

func testRecallSnapshot(id int64, updatedAt time.Time) recallUserSnapshot {
	return recallUserSnapshot{
		ExternalUserID:      string(rune('0' + id)),
		Email:               "fixture@example.test",
		RegisteredAt:        updatedAt.Add(-time.Hour),
		UpdatedAt:           updatedAt,
		TotalPaidMinor:      0,
		TotalPaidCurrency:   "USD",
		SuccessfulCallCount: 0,
		BalanceMinor:        0,
		BalanceCurrency:     "USD",
		BalanceUSDMinor:     0,
		AnomalyActive:       false,
		userID:              id,
	}
}
