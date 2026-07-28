package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
)

var ErrRecallSSOUnavailable = errors.New("recall SSO is unavailable")

const recallSSOTicketLifetime = 60 * time.Second

type RecallSSOService struct {
	cfg        config.RecallSSOConfig
	httpClient *http.Client
	now        func() time.Time
	random     func(int) ([]byte, error)
}

func NewRecallSSOService(cfg *config.Config) *RecallSSOService {
	recallCfg := config.RecallSSOConfig{}
	if cfg != nil {
		recallCfg = cfg.RecallSSO
	}
	return newRecallSSOService(
		recallCfg,
		&http.Client{Timeout: 5 * time.Second},
		time.Now,
		randomBytes,
	)
}

func newRecallSSOService(
	cfg config.RecallSSOConfig,
	httpClient *http.Client,
	now func() time.Time,
	random func(int) ([]byte, error),
) *RecallSSOService {
	return &RecallSSOService{
		cfg:        cfg,
		httpClient: httpClient,
		now:        now,
		random:     random,
	}
}

func randomBytes(size int) ([]byte, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return nil, err
	}
	return value, nil
}

func (s *RecallSSOService) configured() bool {
	return s != nil &&
		strings.TrimSpace(s.cfg.BaseURL) != "" &&
		len(strings.TrimSpace(s.cfg.InternalSecret)) >= 32 &&
		len(strings.TrimSpace(s.cfg.SSOSecret)) >= 32 &&
		strings.TrimSpace(s.cfg.Issuer) != "" &&
		strings.TrimSpace(s.cfg.Audience) != ""
}

func (s *RecallSSOService) CheckAccess(
	ctx context.Context,
	user *User,
) (bool, error) {
	if !s.configured() || user == nil || user.ID < 1 || strings.TrimSpace(user.Email) == "" {
		return false, ErrRecallSSOUnavailable
	}

	body, err := json.Marshal(map[string]string{
		"externalUserId": strconv.FormatInt(user.ID, 10),
		"email":          strings.ToLower(strings.TrimSpace(user.Email)),
	})
	if err != nil {
		return false, fmt.Errorf("encode recall access request: %w", err)
	}

	endpoint := strings.TrimRight(s.cfg.BaseURL, "/") + "/api/internal/righttoken/access-check"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return false, fmt.Errorf("create recall access request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+s.cfg.InternalSecret)
	request.Header.Set("Content-Type", "application/json")

	response, err := s.httpClient.Do(request)
	if err != nil {
		return false, fmt.Errorf("check recall access: %w", err)
	}
	defer func() {
		_ = response.Body.Close()
	}()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4<<10))
		return false, fmt.Errorf("check recall access: status %d", response.StatusCode)
	}

	var result struct {
		Allowed bool `json:"allowed"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&result); err != nil {
		return false, fmt.Errorf("decode recall access response: %w", err)
	}
	return result.Allowed, nil
}

type recallSSOTicketClaims struct {
	Issuer    string `json:"iss"`
	Audience  string `json:"aud"`
	Subject   string `json:"sub"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
	ID        string `json:"jti"`
}

func (s *RecallSSOService) CreateLoginURL(
	user *User,
	next string,
) (string, error) {
	if !s.configured() || user == nil || user.ID < 1 || strings.TrimSpace(user.Email) == "" {
		return "", ErrRecallSSOUnavailable
	}

	randomID, err := s.random(16)
	if err != nil {
		return "", fmt.Errorf("generate recall SSO ticket id: %w", err)
	}
	now := s.now().UTC().Truncate(time.Second)
	claims := recallSSOTicketClaims{
		Issuer:    s.cfg.Issuer,
		Audience:  s.cfg.Audience,
		Subject:   strconv.FormatInt(user.ID, 10),
		Email:     strings.ToLower(strings.TrimSpace(user.Email)),
		Name:      strings.TrimSpace(user.Username),
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(recallSSOTicketLifetime).Unix(),
		ID:        base64.RawURLEncoding.EncodeToString(randomID),
	}

	ticket, err := signRecallSSOTicket(claims, s.cfg.SSOSecret)
	if err != nil {
		return "", err
	}
	base, err := url.Parse(strings.TrimRight(s.cfg.BaseURL, "/"))
	if err != nil || base.Scheme == "" || base.Host == "" {
		return "", ErrRecallSSOUnavailable
	}
	base.Path = "/api/auth/righttoken/callback"
	query := base.Query()
	query.Set("ticket", ticket)
	query.Set("next", next)
	base.RawQuery = query.Encode()
	return base.String(), nil
}

func signRecallSSOTicket(
	claims recallSSOTicketClaims,
	secret string,
) (string, error) {
	header, err := json.Marshal(map[string]string{
		"alg": "HS256",
		"typ": "JWT",
	})
	if err != nil {
		return "", fmt.Errorf("encode recall SSO header: %w", err)
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("encode recall SSO claims: %w", err)
	}

	message := base64.RawURLEncoding.EncodeToString(header) + "." +
		base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(message))
	return message + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
