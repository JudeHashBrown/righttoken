import { readonly, ref, type Ref } from 'vue'
import type { RecallAccess, RecallSSO } from '@/api/recall'

export type RecallAccessAPI = {
  getAccess(): Promise<RecallAccess>
  startSSO(next?: string): Promise<RecallSSO>
}

export type RecallAccessController = {
  allowed: Readonly<Ref<boolean>>
  loading: Readonly<Ref<boolean>>
  refresh(): Promise<void>
  open(next?: string): Promise<void>
}

const runtimeRecallAPI: RecallAccessAPI = {
  async getAccess() {
    const { recallAPI } = await import('@/api/recall')
    return recallAPI.getAccess()
  },
  async startSSO(next) {
    const { recallAPI } = await import('@/api/recall')
    return recallAPI.startSSO(next)
  }
}

export function createRecallAccessController(
  api: RecallAccessAPI = runtimeRecallAPI,
  navigate: (url: string) => void = (url) => window.location.assign(url)
): RecallAccessController {
  const allowed = ref(false)
  const loading = ref(false)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const result = await api.getAccess()
      allowed.value = result.allowed === true
    } catch {
      allowed.value = false
    } finally {
      loading.value = false
    }
  }

  async function open(next = '/dashboard'): Promise<void> {
    const result = await api.startSSO(next)
    if (!result.url.startsWith('https://') && !result.url.startsWith('http://')) {
      throw new Error('Invalid user operations login URL')
    }
    navigate(result.url)
  }

  return {
    allowed: readonly(allowed),
    loading: readonly(loading),
    refresh,
    open
  }
}

let sharedController: RecallAccessController | undefined

export function useRecallAccess(): RecallAccessController {
  sharedController ??= createRecallAccessController()
  return sharedController
}
