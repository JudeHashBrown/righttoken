import { describe, expect, it } from 'vitest'

import { appendUserOperationsAfterProfile } from '../nav-items'

describe('appendUserOperationsAfterProfile', () => {
  const items = [
    { path: '/dashboard', label: '仪表盘' },
    { path: '/profile', label: '个人资料' }
  ]
  const operations = {
    path: '/user-operations',
    label: '用户运营管理'
  }

  it('adds the entry immediately after profile for an authorized member', () => {
    expect(
      appendUserOperationsAfterProfile(items, true, operations).map((item) => item.path)
    ).toEqual(['/dashboard', '/profile', '/user-operations'])
  })

  it('does not add the entry for an unauthorized member', () => {
    expect(appendUserOperationsAfterProfile(items, false, operations)).toEqual(items)
  })

  it('appends the entry when a navigation set has no profile item', () => {
    expect(
      appendUserOperationsAfterProfile(
        [{ path: '/admin/dashboard', label: '仪表盘' }],
        true,
        operations
      ).map((item) => item.path)
    ).toEqual(['/admin/dashboard', '/user-operations'])
  })
})
