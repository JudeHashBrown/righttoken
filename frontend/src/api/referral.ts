/**
 * Referral (二级分销) API endpoints
 */
import { apiClient } from './client'

export interface ReferralCommissionSummary {
  tier: number
  pending_amount: number
  settled_amount: number
  voided_amount: number
  pending_count: number
  settled_count: number
  voided_count: number
}

export interface ReferralDownlineRowLv1 {
  downline_id: number
  downline_email: string
  joined_at: string
  total_usage: number
  pending_amount: number
  settled_amount: number
  total_commission: number
}

export interface ReferralDownlineSummaryLv2 {
  downline_count: number
  pending_amount: number
  settled_amount: number
  total_commission: number
}

export interface ReferralDashboard {
  invite_code: string
  lv1_rate: number
  lv2_rate: number
  lv1_summary: ReferralCommissionSummary
  lv2_summary: ReferralDownlineSummaryLv2
  lv1_rows: ReferralDownlineRowLv1[]
}

export interface ReferralCommission {
  id: number
  inviter_id: number
  downline_id: number
  tier: number
  source_request_id: string
  base_amount: number
  rate: number
  commission_amount: number
  status: 'pending' | 'settled' | 'voided'
  settled_at: string | null
  settled_by_admin_id: number | null
  settled_note: string | null
  created_at: string
  // 仅 admin 列表会返回；用户视角不需要
  inviter_email?: string
  downline_email?: string
}

export interface ReferralCommissionListResponse {
  items: ReferralCommission[]
  total: number
  page: number
  page_size: number
}

export async function getDashboard(): Promise<ReferralDashboard> {
  const { data } = await apiClient.get<ReferralDashboard>('/referral/dashboard')
  return data
}

export async function listMyCommissions(params: {
  status?: string
  page?: number
  page_size?: number
}): Promise<ReferralCommissionListResponse> {
  const { data } = await apiClient.get<ReferralCommissionListResponse>('/referral/commissions', { params })
  return data
}

export interface FirstRechargeEligibility {
  eligible: boolean
  bonus_rate: number
}

export async function getFirstRechargeEligibility(): Promise<FirstRechargeEligibility> {
  const { data } = await apiClient.get<FirstRechargeEligibility>('/referral/first-recharge-eligibility')
  return data
}

const referralAPI = {
  getDashboard,
  listMyCommissions,
  getFirstRechargeEligibility
}

export default referralAPI
