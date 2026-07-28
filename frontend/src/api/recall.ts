import { apiClient } from './client'

export type RecallAccess = {
  allowed: boolean
}

export type RecallSSO = {
  url: string
}

export const recallAPI = {
  async getAccess(): Promise<RecallAccess> {
    const { data } = await apiClient.get<RecallAccess>('/user/recall/access')
    return data
  },

  async startSSO(next = '/dashboard'): Promise<RecallSSO> {
    const { data } = await apiClient.post<RecallSSO>('/user/recall/sso', undefined, {
      params: { next }
    })
    return data
  }
}
