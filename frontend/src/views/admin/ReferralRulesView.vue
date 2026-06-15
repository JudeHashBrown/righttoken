<template>
  <AppLayout>
    <div class="mx-auto max-w-3xl space-y-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        {{ t('admin.referral.rulesTitle') }}
      </h1>

      <!-- 当前生效费率 -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div v-for="tier in [1, 2]" :key="tier" class="card p-5">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 dark:text-dark-400">
                {{ t(`admin.referral.tier${tier}`) }}
              </p>
              <p class="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                {{ activeRateOf(tier) }}
              </p>
            </div>
            <button class="btn btn-primary" @click="openEdit(tier)">
              {{ t('admin.referral.editRate') }}
            </button>
          </div>
        </div>
      </div>

      <!-- 历史记录 -->
      <div class="card">
        <div class="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ t('admin.referral.historyTitle') }}
          </h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 dark:bg-dark-800 dark:text-dark-400">
              <tr>
                <th class="px-6 py-3 text-left font-medium">{{ t('admin.referral.colTier') }}</th>
                <th class="px-6 py-3 text-left font-medium">{{ t('admin.referral.colRate') }}</th>
                <th class="px-6 py-3 text-left font-medium">{{ t('admin.referral.colEffectiveFrom') }}</th>
                <th class="px-6 py-3 text-left font-medium">{{ t('admin.referral.colEffectiveUntil') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-dark-700">
              <tr v-for="r in rules" :key="r.id">
                <td class="px-6 py-3">Lv{{ r.tier }}</td>
                <td class="px-6 py-3">{{ (r.rate * 100).toFixed(2) }}%</td>
                <td class="px-6 py-3 text-xs text-gray-500 dark:text-dark-400">{{ formatDateTime(r.effective_from) }}</td>
                <td class="px-6 py-3 text-xs text-gray-500 dark:text-dark-400">
                  {{ r.effective_until ? formatDateTime(r.effective_until) : t('admin.referral.active') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 编辑弹窗 -->
      <div v-if="editing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="card w-full max-w-md p-6">
          <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            {{ t('admin.referral.editTitle', { tier: editing.tier }) }}
          </h3>
          <label class="input-label">{{ t('admin.referral.rateLabel') }}</label>
          <input v-model="editing.rateInput" type="text" inputmode="decimal" class="input mt-1" placeholder="0.05" />
          <p class="text-xs text-gray-500 mt-1">{{ t('admin.referral.rateHint') }}</p>
          <div class="mt-4 flex gap-2 justify-end">
            <button class="btn btn-secondary" @click="editing = null">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" :disabled="saving" @click="save">{{ t('common.save') }}</button>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import adminReferralAPI, { type ReferralRule } from '@/api/admin/referral'
import { formatDateTime } from '@/utils/format'

const { t } = useI18n()
const rules = ref<ReferralRule[]>([])
const editing = ref<{ tier: number; rateInput: string } | null>(null)
const saving = ref(false)

function activeRateOf(tier: number): string {
  const r = rules.value.find((x) => x.tier === tier && !x.effective_until)
  return r ? `${(r.rate * 100).toFixed(2)}%` : '—'
}

function openEdit(tier: number) {
  const cur = rules.value.find((x) => x.tier === tier && !x.effective_until)
  editing.value = { tier, rateInput: cur ? cur.rate.toFixed(4) : '0.0000' }
}

async function save() {
  if (!editing.value) return
  const rate = Number(editing.value.rateInput)
  if (Number.isNaN(rate) || rate < 0 || rate > 1) {
    alert(t('admin.referral.rateOutOfRange'))
    return
  }
  saving.value = true
  try {
    await adminReferralAPI.updateRule(editing.value.tier, rate)
    await load()
    editing.value = null
  } finally {
    saving.value = false
  }
}

async function load() {
  const res = await adminReferralAPI.listRules()
  rules.value = res.items
}

onMounted(load)
</script>
