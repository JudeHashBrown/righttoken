import { beforeEach, describe, expect, it, vi } from 'vitest'

const { post } = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: { post },
}))

import { reportSuccessfulVisit, trackPageVisit } from '@/api/analytics'

describe('visit analytics', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ status: 204 })
  })

  it('posts only a pathname to the same-origin backend', () => {
    trackPageVisit('/pricing?coupon=secret#checkout')

    expect(post).toHaveBeenCalledWith('/analytics/visit', {
      path: '/pricing',
    })
  })

  it('reports successful navigation including the initial route', () => {
    reportSuccessfulVisit('/home')
    reportSuccessfulVisit('/dashboard')

    expect(post).toHaveBeenNthCalledWith(1, '/analytics/visit', {
      path: '/home',
    })
    expect(post).toHaveBeenNthCalledWith(2, '/analytics/visit', {
      path: '/dashboard',
    })
  })

  it('skips failed navigation and swallows tracking failures', async () => {
    post.mockRejectedValue(new Error('offline'))

    reportSuccessfulVisit('/blocked', new Error('aborted'))
    reportSuccessfulVisit('/pricing')
    await Promise.resolve()

    expect(post).toHaveBeenCalledTimes(1)
  })
})
