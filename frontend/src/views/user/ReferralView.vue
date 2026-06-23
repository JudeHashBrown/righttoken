<template>
  <AppLayout>
    <div class="mx-auto max-w-5xl space-y-6">
      <!-- 邀请码卡：任何登录用户可见 -->
      <div class="card overflow-hidden">
        <div class="bg-gradient-to-br from-primary-500 to-primary-600 px-6 py-8">
          <div class="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p class="text-sm font-medium text-primary-100">{{ t('referral.myInviteCode') }}</p>
              <p class="mt-2 text-4xl font-bold tracking-widest text-white">
                {{ dashboard?.invite_code || '—' }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                class="btn bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
                @click="copyCode"
              >
                {{ codeCopied ? t('referral.copied') : t('referral.copyCode') }}
              </button>
              <button
                class="btn bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
                @click="copyLink"
              >
                {{ linkCopied ? t('referral.copied') : t('referral.copyLink') }}
              </button>
            </div>
          </div>
          <div
            v-if="shareLink"
            class="mt-5 rounded-lg bg-white/10 p-3 text-xs font-mono text-primary-50 break-all"
          >
            {{ shareLink }}
          </div>
        </div>
      </div>

      <!-- 收益规则说明（任何人）：普通邀请 + 代理（如果是） -->
      <div class="grid grid-cols-1 gap-4" :class="dashboard?.is_referral_partner ? 'md:grid-cols-2' : ''">
        <div
          class="card border-blue-200 bg-blue-50 p-5 text-sm leading-relaxed text-blue-800 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-200"
        >
          <p class="font-semibold mb-2">{{ t('referral.firstRechargeTitle') }}</p>
          <ul class="list-disc pl-5 space-y-1 text-blue-700 dark:text-blue-300">
            <li>{{ t('referral.firstRechargeBenefit1') }}</li>
            <li>
              {{ t('referral.firstRechargeBenefit2', {
                rate: formatPercent(dashboard?.first_recharge_rate ?? 0.05)
              }) }}
            </li>
            <li>{{ t('referral.firstRechargeBenefit3') }}</li>
            <li>{{ t('referral.firstRechargeBenefit4') }}</li>
          </ul>
        </div>
        <div
          v-if="dashboard?.is_referral_partner"
          class="card border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <p class="font-semibold mb-1 flex items-center gap-2">
            <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white">★</span>
            {{ t('referral.agentTitle') }}
          </p>
          <p class="mb-3 text-xs italic text-purple-700 dark:text-purple-300">
            {{ t('referral.agentSubtitle') }}
          </p>
          <ul class="list-disc pl-5 space-y-1 text-amber-700 dark:text-amber-300">
            <li>
              {{ t('referral.agentBenefit1', {
                lv1: formatPercent(dashboard?.lv1_rate ?? 0)
              }) }}
            </li>
            <li>
              {{ t('referral.agentBenefit2', {
                lv2: formatPercent(dashboard?.lv2_rate ?? 0)
              }) }}
            </li>
            <li>{{ t('referral.agentBenefit3') }}</li>
          </ul>
        </div>
      </div>

      <!-- 代理统计卡：仅代理可见 -->
      <div v-if="dashboard?.is_referral_partner" class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="card p-5">
          <p class="text-sm text-gray-500 dark:text-dark-400">{{ t('referral.lv1Title') }}</p>
          <p class="mt-2 text-xs text-gray-400 dark:text-dark-500">{{ t('referral.lv1Subtitle') }}</p>
          <div class="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p class="text-xs text-gray-500 dark:text-dark-400">{{ t('referral.pending') }}</p>
              <p class="text-xl font-semibold text-amber-600 dark:text-amber-400">
                {{ formatUsd(dashboard?.lv1_summary?.pending_amount) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-dark-400">{{ t('referral.settled') }}</p>
              <p class="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                {{ formatUsd(dashboard?.lv1_summary?.settled_amount) }}
              </p>
            </div>
          </div>
        </div>
        <div class="card p-5">
          <p class="text-sm text-gray-500 dark:text-dark-400">{{ t('referral.lv2Title') }}</p>
          <p class="mt-2 text-xs text-gray-400 dark:text-dark-500">{{ t('referral.lv2Subtitle') }}</p>
          <div class="mt-4 grid grid-cols-3 gap-4">
            <div>
              <p class="text-xs text-gray-500 dark:text-dark-400">{{ t('referral.lv2DownlineCount') }}</p>
              <p class="text-xl font-semibold text-gray-900 dark:text-white">
                {{ dashboard?.lv2_summary?.downline_count ?? 0 }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-dark-400">{{ t('referral.pending') }}</p>
              <p class="text-xl font-semibold text-amber-600 dark:text-amber-400">
                {{ formatUsd(dashboard?.lv2_summary?.pending_amount) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-dark-400">{{ t('referral.settled') }}</p>
              <p class="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                {{ formatUsd(dashboard?.lv2_summary?.settled_amount) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Lv1 下线明细表（任何人） -->
      <div class="card">
        <div class="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ t('referral.lv1DownlinesTitle') }}
          </h2>
        </div>
        <div class="overflow-x-auto">
          <table v-if="dashboard?.lv1_rows?.length" class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 dark:bg-dark-800 dark:text-dark-400">
              <tr>
                <th class="px-6 py-3 text-left font-medium">{{ t('referral.colDownline') }}</th>
                <th class="px-6 py-3 text-left font-medium">{{ t('referral.colJoinedAt') }}</th>
                <th class="px-6 py-3 text-right font-medium">{{ t('referral.colUsageTotal') }}</th>
                <th class="px-6 py-3 text-right font-medium">{{ t('referral.pending') }}</th>
                <th class="px-6 py-3 text-right font-medium">{{ t('referral.settled') }}</th>
                <th class="px-6 py-3 text-right font-medium">{{ t('referral.colMyCommission') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-dark-700">
              <tr v-for="row in dashboard.lv1_rows" :key="row.downline_id">
                <td class="px-6 py-3 font-mono text-xs text-gray-700 dark:text-dark-300">
                  {{ row.downline_email }}
                </td>
                <td class="px-6 py-3 text-xs text-gray-500 dark:text-dark-400">
                  {{ formatDateTime(row.joined_at) }}
                </td>
                <td class="px-6 py-3 text-right text-gray-700 dark:text-dark-300">
                  {{ formatUsd(row.total_usage) }}
                </td>
                <td class="px-6 py-3 text-right text-amber-600 dark:text-amber-400">
                  {{ formatUsd(row.pending_amount) }}
                </td>
                <td class="px-6 py-3 text-right text-emerald-600 dark:text-emerald-400">
                  {{ formatUsd(row.settled_amount) }}
                </td>
                <td class="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">
                  {{ formatUsd(row.total_commission) }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="px-6 py-10 text-center text-sm text-gray-500 dark:text-dark-400">
            {{ t('referral.noDownlines') }}
          </div>
        </div>
      </div>

      <!-- 抽佣明细分页表（任何人）-->
      <div class="card">
        <div class="border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-wrap gap-3 dark:border-dark-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ t('referral.commissionLogTitle') }}
          </h2>
          <div class="flex items-center gap-2">
            <select v-model="statusFilter" class="input py-1 px-2 text-sm" @change="loadCommissions(1)">
              <option value="">{{ t('referral.statusAll') }}</option>
              <option value="pending">{{ t('referral.pending') }}</option>
              <option value="settled">{{ t('referral.settled') }}</option>
              <option value="voided">{{ t('referral.voided') }}</option>
            </select>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table v-if="commissions.length" class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 dark:bg-dark-800 dark:text-dark-400">
              <tr>
                <th class="px-6 py-3 text-left font-medium">{{ t('referral.colTime') }}</th>
                <th class="px-6 py-3 text-left font-medium">{{ t('referral.colKind') }}</th>
                <th class="px-6 py-3 text-right font-medium">{{ t('referral.colBase') }}</th>
                <th class="px-6 py-3 text-right font-medium">{{ t('referral.colRate') }}</th>
                <th class="px-6 py-3 text-right font-medium">{{ t('referral.colCommission') }}</th>
                <th class="px-6 py-3 text-left font-medium">{{ t('referral.colStatus') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-dark-700">
              <tr v-for="c in commissions" :key="c.id">
                <td class="px-6 py-3 text-xs text-gray-500 dark:text-dark-400">{{ formatDateTime(c.created_at) }}</td>
                <td class="px-6 py-3">{{ kindLabel(c.kind, c.tier) }}</td>
                <td class="px-6 py-3 text-right">{{ formatUsd(c.base_amount) }}</td>
                <td class="px-6 py-3 text-right">{{ formatPercent(c.rate) }}</td>
                <td class="px-6 py-3 text-right font-semibold">{{ formatUsd(c.commission_amount) }}</td>
                <td class="px-6 py-3"><StatusPill :status="c.status" /></td>
              </tr>
            </tbody>
          </table>
          <div v-else class="px-6 py-10 text-center text-sm text-gray-500 dark:text-dark-400">
            {{ t('referral.noCommissions') }}
          </div>
        </div>
        <div v-if="total > pageSize" class="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3 dark:border-dark-700">
          <button class="btn btn-secondary text-sm" :disabled="page <= 1" @click="loadCommissions(page - 1)">‹</button>
          <span class="text-sm text-gray-500">{{ page }} / {{ totalPages }}</span>
          <button class="btn btn-secondary text-sm" :disabled="page >= totalPages" @click="loadCommissions(page + 1)">›</button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import StatusPill from '@/components/referral/StatusPill.vue'
import referralAPI, { type ReferralDashboard, type ReferralCommission } from '@/api/referral'
import { formatDateTime } from '@/utils/format'
import { useClipboard } from '@/composables/useClipboard'

const { t } = useI18n()
const codeClip = useClipboard()
const linkClip = useClipboard()
const codeCopied = codeClip.copied
const linkCopied = linkClip.copied

const dashboard = ref<ReferralDashboard | null>(null)
const commissions = ref<ReferralCommission[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const statusFilter = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

const shareLink = computed(() => {
  if (!dashboard.value?.invite_code) return ''
  return `${window.location.origin}/register?ref=${dashboard.value.invite_code}`
})

function formatUsd(v?: number) {
  return `$${Number(v || 0).toFixed(4)}`
}

function formatPercent(v?: number) {
  return `${(Number(v || 0) * 100).toFixed(2)}%`
}

function kindLabel(kind: string, tier: number) {
  // 优先按 kind 显示；老数据没 kind 时按 tier 兜底
  if (kind === 'first_recharge') return t('referral.kindLabels.first_recharge')
  if (kind === 'agent_lv1') return t('referral.kindLabels.agent_lv1')
  if (kind === 'agent_lv2') return t('referral.kindLabels.agent_lv2')
  return `Lv${tier}`
}

async function copyCode() {
  if (!dashboard.value?.invite_code) return
  await codeClip.copyToClipboard(dashboard.value.invite_code)
}

async function copyLink() {
  if (!shareLink.value) return
  await linkClip.copyToClipboard(shareLink.value)
}

async function loadDashboard() {
  dashboard.value = await referralAPI.getDashboard()
}

async function loadCommissions(p = 1) {
  page.value = p
  const res = await referralAPI.listMyCommissions({
    status: statusFilter.value || undefined,
    page: p,
    page_size: pageSize.value
  })
  commissions.value = res.items
  total.value = res.total
}

onMounted(async () => {
  await Promise.all([loadDashboard(), loadCommissions(1)])
})
</script>
