package handler

import (
	"context"
	"net/http"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

type recallSSOUser interface {
	GetByID(ctx context.Context, id int64) (*service.User, error)
}

type recallSSO interface {
	CheckAccess(ctx context.Context, user *service.User) (bool, error)
	CreateLoginURL(user *service.User, next string) (string, error)
}

type RecallSSOHandler struct {
	users recallSSOUser
	sso   recallSSO
}

func NewRecallSSOHandler(
	users *service.UserService,
	sso *service.RecallSSOService,
) *RecallSSOHandler {
	return newRecallSSOHandler(users, sso)
}

func newRecallSSOHandler(
	users recallSSOUser,
	sso recallSSO,
) *RecallSSOHandler {
	return &RecallSSOHandler{users: users, sso: sso}
}

func (h *RecallSSOHandler) currentUser(c *gin.Context) (*service.User, bool) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return nil, false
	}
	user, err := h.users.GetByID(c.Request.Context(), subject.UserID)
	if err != nil {
		response.ErrorFrom(c, err)
		return nil, false
	}
	return user, true
}

// Access reports whether the current RightToken identity is an active recall member.
func (h *RecallSSOHandler) Access(c *gin.Context) {
	user, ok := h.currentUser(c)
	if !ok {
		return
	}
	allowed, err := h.sso.CheckAccess(c.Request.Context(), user)
	if err != nil {
		response.Error(c, http.StatusServiceUnavailable, "User operations access is unavailable")
		return
	}
	response.Success(c, gin.H{"allowed": allowed})
}

// Start returns a short-lived one-time login URL after rechecking access.
func (h *RecallSSOHandler) Start(c *gin.Context) {
	user, ok := h.currentUser(c)
	if !ok {
		return
	}
	allowed, err := h.sso.CheckAccess(c.Request.Context(), user)
	if err != nil {
		response.Error(c, http.StatusServiceUnavailable, "User operations access is unavailable")
		return
	}
	if !allowed {
		response.Forbidden(c, "User operations access denied")
		return
	}

	next := strings.TrimSpace(c.Query("next"))
	if next == "" {
		next = "/dashboard"
	}
	loginURL, err := h.sso.CreateLoginURL(user, next)
	if err != nil {
		response.Error(c, http.StatusServiceUnavailable, "User operations login is unavailable")
		return
	}
	response.Success(c, gin.H{"url": loginURL})
}
