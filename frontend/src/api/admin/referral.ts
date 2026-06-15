/**
 * Admin Referral API endpoints
 */
import { apiClient } from '../client'
import type { ReferralCommission, ReferralCommissionListResponse } from '../referral'

export interface ReferralRule {
  id: number
  tier: number
  rate: number
  effective_from: string
  effective_until: string | null
  created_by_admin_id: number | null
  created_at: string
}

export interface ReferralRuleListResponse {
  items: ReferralRule[]
}

export async function listRules(): Promise<ReferralRuleListResponse> {
  const { data } = await apiClient.get<ReferralRuleListResponse>('/admin/referral/rules')
  return data
}

export async function updateRule(tier: number, rate: number): Promise<ReferralRule> {
  const { data } = await apiClient.put<ReferralRule>(`/admin/referral/rules/${tier}`, { rate })
  return data
}

export async function listCommissions(params: {
  status?: string
  inviter_id?: number
  downline_id?: number
  page?: number
  page_size?: number
}): Promise<ReferralCommissionListResponse> {
  const { data } = await apiClient.get<ReferralCommissionListResponse>('/admin/referral/commissions', { params })
  return data
}

export async function markSettled(ids: number[], note: string = ''): Promise<{ updated: number }> {
  const { data } = await apiClient.post<{ updated: number }>('/admin/referral/commissions/mark-settled', { ids, note })
  return data
}

export async function markVoided(ids: number[], note: string = ''): Promise<{ voided: number }> {
  const { data } = await apiClient.post<{ voided: number }>('/admin/referral/commissions/void', { ids, note })
  return data
}

const adminReferralAPI = {
  listRules,
  updateRule,
  listCommissions,
  markSettled,
  markVoided
}

export type AdminReferralCommission = ReferralCommission

export default adminReferralAPI
