import { apiClient } from './client'

export function trackPageVisit(rawPath: string): void {
  const path = rawPath.split(/[?#]/, 1)[0] || '/'
  void apiClient
    .post('/analytics/visit', { path })
    .catch(() => undefined)
}

export function reportSuccessfulVisit(
  path: string,
  failure?: unknown
): void {
  if (failure) {
    return
  }
  trackPageVisit(path)
}
