//go:build recallcontract

package admin

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/repository"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/require"
)

func TestRecallUserExportAgainstMigratedPostgres(t *testing.T) {
	dsn := os.Getenv("RECALL_CONTRACT_DATABASE_URL")
	if dsn == "" {
		t.Skip("RECALL_CONTRACT_DATABASE_URL is not configured")
	}

	db, err := sql.Open("postgres", dsn)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)
	require.NoError(t, db.PingContext(ctx))
	require.NoError(t, repository.ApplyMigrations(ctx, db))

	requireMigrationApplied(t, db, "109_add_user_registration_ip.sql")
	requireMigrationApplied(t, db, "110_recall_export_indexes_notx.sql")
	requireIndexExists(t, db, "idx_users_recall_updated_id")
	requireIndexExists(t, db, "idx_payment_orders_recall_updated_user")
	requireIndexExists(t, db, "idx_ops_error_logs_recall_updated_user")

	fixture := insertRecallContractFixture(t, db)
	t.Cleanup(func() { deleteRecallContractFixture(db, fixture) })

	users, err := (&sqlRecallUserStore{db: db}).ListRecallUsers(
		ctx,
		time.Unix(0, 0).UTC(),
		0,
		10,
	)
	require.NoError(t, err)

	var exported *recallUserSnapshot
	for index := range users {
		if users[index].userID == fixture.userID {
			exported = &users[index]
			break
		}
	}
	require.NotNil(t, exported)
	require.Equal(t, fixture.email, exported.Email)
	require.Equal(t, "203.0.113.42", requireStringPointer(t, exported.RegistrationIP))
	require.Equal(t, fixture.checkoutStartedAt.UTC(), exported.CheckoutStartedAt.UTC())
	require.Equal(t, fixture.firstPaidAt.UTC(), exported.FirstPaidAt.UTC())
	require.Equal(t, int64(900), exported.TotalPaidMinor)
	require.Equal(t, "USD", exported.TotalPaidCurrency)
	require.Equal(t, int64(2), exported.SuccessfulCallCount)
	require.Equal(t, int64(1234), exported.BalanceMinor)
	require.Equal(t, "USD", exported.BalanceCurrency)
	require.Equal(t, int64(1234), exported.BalanceUSDMinor)
	require.True(t, exported.AnomalyActive)
	require.Equal(
		t,
		fixture.anomalyChangedAt.UTC(),
		exported.AnomalyChangedAt.UTC(),
	)
}

func TestRecallStrictAnomalyLifecycleAgainstMigratedPostgres(t *testing.T) {
	dsn := os.Getenv("RECALL_CONTRACT_DATABASE_URL")
	if dsn == "" {
		t.Skip("RECALL_CONTRACT_DATABASE_URL is not configured")
	}

	db, err := sql.Open("postgres", dsn)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)
	require.NoError(t, db.PingContext(ctx))
	require.NoError(t, repository.ApplyMigrations(ctx, db))

	fixture := insertRecallContractFixture(t, db)
	t.Cleanup(func() { deleteRecallContractFixture(db, fixture) })
	anchor := time.Now().UTC().Truncate(time.Second).Add(-10 * time.Minute)

	success := func(offset time.Duration) contractRequestEvent {
		return contractRequestEvent{offset: offset, success: true}
	}
	failure := func(offset time.Duration) contractRequestEvent {
		return contractRequestEvent{
			offset:     offset,
			statusCode: 500,
			errorPhase: "upstream",
			errorType:  "upstream_error",
			errorOwner: "provider",
		}
	}
	durationPointer := func(value time.Duration) *time.Duration {
		return &value
	}

	tests := []struct {
		name              string
		events            []contractRequestEvent
		wantActive        bool
		wantChangedOffset *time.Duration
	}{
		{
			name: "two isolated failures do not trigger",
			events: []contractRequestEvent{
				failure(0),
				failure(time.Minute),
			},
			wantActive: false,
		},
		{
			name: "three consecutive failures trigger",
			events: []contractRequestEvent{
				failure(0),
				failure(time.Minute),
				failure(2 * time.Minute),
			},
			wantActive:        true,
			wantChangedOffset: durationPointer(2 * time.Minute),
		},
		{
			name: "two failures out of three requests trigger",
			events: []contractRequestEvent{
				failure(0),
				success(time.Minute),
				failure(2 * time.Minute),
			},
			wantActive:        true,
			wantChangedOffset: durationPointer(2 * time.Minute),
		},
		{
			name: "failure rate below fifty percent does not trigger",
			events: []contractRequestEvent{
				failure(0),
				success(time.Minute),
				success(2 * time.Minute),
			},
			wantActive: false,
		},
		{
			name: "three consecutive successes recover",
			events: []contractRequestEvent{
				failure(0),
				failure(time.Minute),
				failure(2 * time.Minute),
				success(3 * time.Minute),
				success(4 * time.Minute),
				success(5 * time.Minute),
			},
			wantActive:        false,
			wantChangedOffset: durationPointer(5 * time.Minute),
		},
		{
			name: "two successes do not recover",
			events: []contractRequestEvent{
				failure(0),
				failure(time.Minute),
				failure(2 * time.Minute),
				success(3 * time.Minute),
				success(4 * time.Minute),
			},
			wantActive:        true,
			wantChangedOffset: durationPointer(2 * time.Minute),
		},
		{
			name: "recovered upstream attempts do not count",
			events: []contractRequestEvent{
				{
					offset:     0,
					statusCode: 200,
					errorPhase: "upstream",
					errorType:  "upstream_error",
					errorOwner: "provider",
				},
				{
					offset:     time.Minute,
					statusCode: 200,
					errorPhase: "upstream",
					errorType:  "upstream_error",
					errorOwner: "provider",
				},
				{
					offset:     2 * time.Minute,
					statusCode: 200,
					errorPhase: "upstream",
					errorType:  "upstream_error",
					errorOwner: "provider",
				},
			},
			wantActive: false,
		},
		{
			name: "business and client failures do not count",
			events: []contractRequestEvent{
				{
					offset:          0,
					statusCode:      402,
					errorPhase:      "request",
					errorType:       "billing_error",
					errorOwner:      "client",
					businessLimited: true,
				},
				{
					offset:     time.Minute,
					statusCode: 401,
					errorPhase: "auth",
					errorType:  "authentication_error",
					errorOwner: "client",
				},
				{
					offset:     2 * time.Minute,
					statusCode: 400,
					errorPhase: "request",
					errorType:  "invalid_request_error",
					errorOwner: "client",
				},
				{
					offset:     3 * time.Minute,
					statusCode: 429,
					errorPhase: "request",
					errorType:  "rate_limit_error",
					errorOwner: "client",
				},
			},
			wantActive: false,
		},
		{
			name: "trigger older than twenty four hours expires",
			events: []contractRequestEvent{
				failure(-25 * time.Hour),
				failure(-25*time.Hour + time.Minute),
				failure(-25*time.Hour + 2*time.Minute),
			},
			wantActive: false,
		},
		{
			name: "new trigger refreshes the lifetime",
			events: []contractRequestEvent{
				failure(-23 * time.Hour),
				failure(-23*time.Hour + time.Minute),
				failure(-23*time.Hour + 2*time.Minute),
				failure(0),
				failure(time.Minute),
				failure(2 * time.Minute),
			},
			wantActive:        true,
			wantChangedOffset: durationPointer(2 * time.Minute),
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			resetRecallContractEvents(t, db, fixture.userID)
			insertRecallContractEvents(t, db, fixture, anchor, test.events)

			users, err := (&sqlRecallUserStore{db: db}).ListRecallUsers(
				ctx,
				time.Unix(0, 0).UTC(),
				0,
				100,
			)
			require.NoError(t, err)
			exported := findRecallSnapshot(t, users, fixture.userID)
			require.Equal(t, test.wantActive, exported.AnomalyActive)
			if test.wantChangedOffset == nil {
				require.Nil(t, exported.AnomalyChangedAt)
			} else {
				require.NotNil(t, exported.AnomalyChangedAt)
				require.Equal(
					t,
					anchor.Add(*test.wantChangedOffset),
					exported.AnomalyChangedAt.UTC(),
				)
			}
		})
	}
}

type contractRequestEvent struct {
	offset          time.Duration
	success         bool
	statusCode      int
	errorPhase      string
	errorType       string
	errorOwner      string
	businessLimited bool
}

type recallContractFixture struct {
	userID            int64
	apiKeyID          int64
	accountID         int64
	groupID           int64
	email             string
	checkoutStartedAt time.Time
	firstPaidAt       time.Time
	anomalyChangedAt  time.Time
}

func resetRecallContractEvents(
	t *testing.T,
	db *sql.DB,
	userID int64,
) {
	t.Helper()
	_, err := db.Exec("DELETE FROM ops_error_logs WHERE user_id = $1", userID)
	require.NoError(t, err)
	_, err = db.Exec("DELETE FROM usage_logs WHERE user_id = $1", userID)
	require.NoError(t, err)
}

func insertRecallContractEvents(
	t *testing.T,
	db *sql.DB,
	fixture recallContractFixture,
	anchor time.Time,
	events []contractRequestEvent,
) {
	t.Helper()
	for _, event := range events {
		occurredAt := anchor.Add(event.offset)
		if event.success {
			_, err := db.Exec(`
				INSERT INTO usage_logs (
					user_id, api_key_id, account_id, model, ip_address, created_at
				)
				VALUES ($1, $2, $3, 'gpt-5', '198.51.100.9', $4)
			`, fixture.userID, fixture.apiKeyID, fixture.accountID, occurredAt)
			require.NoError(t, err)
			continue
		}
		_, err := db.Exec(`
			INSERT INTO ops_error_logs (
				user_id, error_phase, error_type, error_owner, severity,
				status_code, is_business_limited, resolved, created_at
			)
			VALUES ($1, $2, $3, $4, 'P1', $5, $6, false, $7)
		`, fixture.userID, event.errorPhase, event.errorType,
			event.errorOwner, event.statusCode, event.businessLimited,
			occurredAt)
		require.NoError(t, err)
	}
}

func findRecallSnapshot(
	t *testing.T,
	users []recallUserSnapshot,
	userID int64,
) *recallUserSnapshot {
	t.Helper()
	for index := range users {
		if users[index].userID == userID {
			return &users[index]
		}
	}
	require.FailNow(t, "recall snapshot was not exported")
	return nil
}

func insertRecallContractFixture(
	t *testing.T,
	db *sql.DB,
) recallContractFixture {
	t.Helper()

	now := time.Now().UTC().Truncate(time.Second)
	fixture := recallContractFixture{
		email:             fmt.Sprintf("recall-contract-%d@example.test", now.UnixNano()),
		checkoutStartedAt: now.Add(-2 * time.Hour),
		firstPaidAt:       now.Add(-90 * time.Minute),
		anomalyChangedAt:  now.Add(4 * time.Minute),
	}

	require.NoError(t, db.QueryRow(`
		INSERT INTO users (
			email, password_hash, username, balance, registration_ip,
			created_at, updated_at
		)
		VALUES ($1, 'not-a-real-password', 'Recall Contract', 12.34, '203.0.113.42',
			$2, $3)
		RETURNING id
	`, fixture.email, now.Add(-24*time.Hour), now).Scan(&fixture.userID))

	require.NoError(t, db.QueryRow(`
		INSERT INTO groups (name, description)
		VALUES ($1, 'recall contract fixture')
		RETURNING id
	`, fmt.Sprintf("recall-contract-%d", now.UnixNano())).Scan(&fixture.groupID))

	require.NoError(t, db.QueryRow(`
		INSERT INTO accounts (name, platform, type)
		VALUES ($1, 'openai', 'apikey')
		RETURNING id
	`, fmt.Sprintf("recall-contract-%d", now.UnixNano())).Scan(&fixture.accountID))

	require.NoError(t, db.QueryRow(`
		INSERT INTO api_keys (user_id, key, name, group_id)
		VALUES ($1, $2, 'Recall Contract', $3)
		RETURNING id
	`, fixture.userID, fmt.Sprintf("sk-recall-contract-%d", now.UnixNano()), fixture.groupID).
		Scan(&fixture.apiKeyID))

	require.NoError(t, db.QueryRow(`
		INSERT INTO payment_orders (
			user_id, user_email, amount, pay_amount, refund_amount,
			status, expires_at, paid_at, client_ip, created_at, updated_at
		)
		VALUES ($1, $2, 70.00, 70.00, 7.00, 'PAID', $3, $4,
			'198.51.100.8', $5, $4)
		RETURNING id
	`, fixture.userID, fixture.email, now.Add(time.Hour), fixture.firstPaidAt,
		fixture.checkoutStartedAt).Scan(new(int64)))

	for offset := range 2 {
		_, err := db.Exec(`
			INSERT INTO usage_logs (
				user_id, api_key_id, account_id, model, ip_address, created_at
			)
			VALUES ($1, $2, $3, 'gpt-5', '198.51.100.9', $4)
		`, fixture.userID, fixture.apiKeyID, fixture.accountID,
			now.Add(time.Duration(offset)*time.Minute))
		require.NoError(t, err)
	}

	for offset := range 3 {
		_, err := db.Exec(`
			INSERT INTO ops_error_logs (
				user_id, error_phase, error_type, error_owner, severity,
				status_code, is_business_limited, resolved, created_at
			)
			VALUES (
				$1, 'upstream', 'upstream_error', 'provider', 'P1',
				500, false, false, $2
			)
		`, fixture.userID, now.Add(time.Duration(offset+2)*time.Minute))
		require.NoError(t, err)
	}

	return fixture
}

func deleteRecallContractFixture(
	db *sql.DB,
	fixture recallContractFixture,
) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, _ = db.ExecContext(ctx, "DELETE FROM ops_error_logs WHERE user_id = $1", fixture.userID)
	_, _ = db.ExecContext(ctx, "DELETE FROM usage_logs WHERE user_id = $1", fixture.userID)
	_, _ = db.ExecContext(ctx, "DELETE FROM payment_orders WHERE user_id = $1", fixture.userID)
	_, _ = db.ExecContext(ctx, "DELETE FROM api_keys WHERE id = $1", fixture.apiKeyID)
	_, _ = db.ExecContext(ctx, "DELETE FROM accounts WHERE id = $1", fixture.accountID)
	_, _ = db.ExecContext(ctx, "DELETE FROM groups WHERE id = $1", fixture.groupID)
	_, _ = db.ExecContext(ctx, "DELETE FROM users WHERE id = $1", fixture.userID)
}

func requireMigrationApplied(t *testing.T, db *sql.DB, name string) {
	t.Helper()
	var applied bool
	require.NoError(t, db.QueryRow(
		"SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = $1)",
		name,
	).Scan(&applied))
	require.True(t, applied, "migration %s must be applied", name)
}

func requireIndexExists(t *testing.T, db *sql.DB, name string) {
	t.Helper()
	var exists bool
	require.NoError(t, db.QueryRow(
		"SELECT to_regclass('public.' || $1) IS NOT NULL",
		name,
	).Scan(&exists))
	require.True(t, exists, "index %s must exist", name)
}

func requireStringPointer(t *testing.T, value *string) string {
	t.Helper()
	require.NotNil(t, value)
	return *value
}
