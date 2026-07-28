import { describe, expect, it, vi } from 'vitest'
import { createRecallAccessController } from './useRecallAccess'

describe('createRecallAccessController', () => {
  it('keeps the entry hidden when access is denied or unavailable', async () => {
    const denied = createRecallAccessController({
      getAccess: vi.fn().mockResolvedValue({ allowed: false }),
      startSSO: vi.fn()
    })
    await denied.refresh()
    expect(denied.allowed.value).toBe(false)

    const unavailable = createRecallAccessController({
      getAccess: vi.fn().mockRejectedValue(new Error('offline')),
      startSSO: vi.fn()
    })
    await unavailable.refresh()
    expect(unavailable.allowed.value).toBe(false)
  })

  it('shows the entry only after the backend authorizes the user', async () => {
    const controller = createRecallAccessController({
      getAccess: vi.fn().mockResolvedValue({ allowed: true }),
      startSSO: vi.fn()
    })

    await controller.refresh()

    expect(controller.allowed.value).toBe(true)
  })

  it('navigates only to the SSO URL returned by the backend', async () => {
    const navigate = vi.fn()
    const controller = createRecallAccessController(
      {
        getAccess: vi.fn().mockResolvedValue({ allowed: true }),
        startSSO: vi.fn().mockResolvedValue({
          url: 'https://recall.righttoken.ai/api/auth/righttoken/callback?ticket=redacted'
        })
      },
      navigate
    )

    await controller.open('/dashboard')

    expect(navigate).toHaveBeenCalledWith(
      'https://recall.righttoken.ai/api/auth/righttoken/callback?ticket=redacted'
    )
  })
})
