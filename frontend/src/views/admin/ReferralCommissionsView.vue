<template>
  <AppLayout>
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ t('admin.referral.commissionsTitle') }}
        </h1>
        <div class="flex items-center gap-2">
          <select v-model="statusFilter" class="input py-1 px-2 text-sm" @change="load(1)">
            <option value="">{{ t('admin.referral.statusAll') }}</option>
            <option value="pending">{{ t('admin.referral.statusPending') }}</option>
            <option value="settled">{{ t('admin.referral.statusSettled') }}</option>
            <option value="voided">{{ t('admin.referral.statusVoided') }}</option>
          </select>
          <input v-model="inviterIdFilter" type="number" :placeholder="t('admin.referral.inviterIdPlaceholder')" class="input py-1 px-2 text-sm w-44" @change="load(1)" />
        </div>
      </div>

      <div class="card">
        <div v-if="selected.length > 0" class="border-b border-gray-100 px-6 py-3 flex items-center gap-2 dark:border-dark-700">
          <span class="text-sm text-gray-500">{{ t('admin.referral.selectedCount', { n: selected.length }) }}</span>
          <button class="btn btn-primary text-sm" @click="actionDialog = 'settled'">{{ t('admin.referral.markSettled') }}</button>
          <button class="btn btn-secondary text-sm" @click="actionDialog = 'voided'">{{ t('admin.referral.markVoided') }}</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 dark:bg-dark-800 dark:text-dark-400">
              <tr>
                <th class="px-4 py-3 text-left"><input type="checkbox" :checked="allSelected" @change="toggleAll" /></th>
                <th class="px-4 py-3 text-left font-medium">{{ t('admin.referral.colCreatedAt') }}</th>
                <th class="px-4 py-3 text-left font-medium">{{ t('admin.referral.colInviter') }}</th>
                <th class="px-4 py-3 text-left font-medium">{{ t('admin.referral.colDownline') }}</th>
                <th class="px-4 py-3 text-left font-medium">{{ t('admin.referral.colKind') }}</th>
                <th class="px-4 py-3 text-right font-medium">{{ t('admin.referral.colBase') }}</th>
                <th class="px-4 py-3 text-right font-medium">{{ t('admin.referral.colRate') }}</th>
                <th class="px-4 py-3 text-right font-medium">{{ t('admin.referral.colCommission') }}</th>
                <th class="px-4 py-3 text-left font-medium">{{ t('admin.referral.colStatus') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-dark-700">
              <tr v-for="c in commissions" :key="c.id">
                <td class="px-4 py-3"><input type="checkbox" :value="c.id" v-model="selected" :disabled="c.status !== 'pending'" /></td>
                <td class="px-4 py-3 text-xs text-gray-500 dark:text-dark-400">{{ formatDateTime(c.created_at) }}</td>
                <td class="px-4 py-3">
                  <div class="font-medium text-gray-900 dark:text-white">{{ c.inviter_email || '—' }}</div>
                  <div class="text-xs text-gray-400">ID {{ c.inviter_id }}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-gray-700 dark:text-dark-300">{{ c.downline_email || '—' }}</div>
                  <div class="text-xs text-gray-400">ID {{ c.downline_id }}</div>
                </td>
                <td class="px-4 py-3">{{ kindLabel(c.kind, c.tier) }}</td>
                <td class="px-4 py-3 text-right">${{ c.base_amount.toFixed(4) }}</td>
                <td class="px-4 py-3 text-right">{{ (c.rate * 100).toFixed(2) }}%</td>
                <td class="px-4 py-3 text-right font-semibold">${{ c.commission_amount.toFixed(4) }}</td>
                <td class="px-4 py-3"><StatusPill :status="c.status" /></td>
              </tr>
              <tr v-if="!commissions.length">
                <td colspan="9" class="px-4 py-10 text-center text-sm text-gray-500">{{ t('admin.referral.empty') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3 dark:border-dark-700">
          <button class="btn btn-secondary text-sm" :disabled="page <= 1" @click="load(page - 1)">‹</button>
          <span class="text-sm text-gray-500">{{ page }} / {{ totalPages }}</span>
          <button class="btn btn-secondary text-sm" :disabled="page >= totalPages" @click="load(page + 1)">›</button>
        </div>
      </div>

      <!-- 批量动作弹窗 -->
      <div v-if="actionDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="card w-full max-w-md p-6">
          <h3 class="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
            {{ actionDialog === 'settled' ? t('admin.referral.confirmSettled') : t('admin.referral.confirmVoid') }}
          </h3>
          <p class="text-sm text-gray-500 mb-3">{{ t('admin.referral.affectN', { n: selected.length }) }}</p>
          <label class="input-label">{{ t('admin.referral.noteLabel') }}</label>
          <textarea v-model="note" rows="3" class="input mt-1" />
          <div class="mt-4 flex gap-2 justify-end">
            <button class="btn btn-secondary" @click="actionDialog = null">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" :disabled="acting" @click="confirmAction">{{ t('common.confirm') }}</button>
          </div>
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
import adminReferralAPI from '@/api/admin/referral'
import type { ReferralCommission } from '@/api/referral'
import { formatDateTime } from '@/utils/format'

const { t } = useI18n()

const commissions = ref<ReferralCommission[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const statusFilter = ref('')
const inviterIdFilter = ref<number | null>(null)
const selected = ref<number[]>([])
const actionDialog = ref<null | 'settled' | 'voided'>(null)
const note = ref('')
const acting = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const allSelected = computed(
  () =>
    commissions.value.length > 0 &&
    commissions.value.filter((c) => c.status === 'pending').every((c) => selected.value.includes(c.id))
)

function kindLabel(kind: string, tier: number) {
  if (kind === 'first_recharge') return t('admin.referral.kindLabels.first_recharge')
  if (kind === 'agent_lv1') return t('admin.referral.kindLabels.agent_lv1')
  if (kind === 'agent_lv2') return t('admin.referral.kindLabels.agent_lv2')
  return `Lv${tier}`
}

function toggleAll() {
  const pendingIds = commissions.value.filter((c) => c.status === 'pending').map((c) => c.id)
  if (allSelected.value) {
    selected.value = selected.value.filter((id) => !pendingIds.includes(id))
  } else {
    const set = new Set(selected.value)
    for (const id of pendingIds) set.add(id)
    selected.value = [...set]
  }
}

async function load(p = 1) {
  page.value = p
  selected.value = []
  const res = await adminReferralAPI.listCommissions({
    status: statusFilter.value || undefined,
    inviter_id: inviterIdFilter.value || undefined,
    page: p,
    page_size: pageSize.value
  })
  commissions.value = res.items
  total.value = res.total
}

async function confirmAction() {
  if (!actionDialog.value || selected.value.length === 0) return
  acting.value = true
  try {
    if (actionDialog.value === 'settled') {
      await adminReferralAPI.markSettled(selected.value, note.value)
    } else {
      await adminReferralAPI.markVoided(selected.value, note.value)
    }
    actionDialog.value = null
    note.value = ''
    await load(page.value)
  } finally {
    acting.value = false
  }
}

onMounted(() => load(1))
</script>
