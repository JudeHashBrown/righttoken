<template>
  <span :class="['inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', classMap[status]]">
    {{ t(`referral.statusValues.${status}`) }}
  </span>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ status: 'pending' | 'settled' | 'voided' }>()

const { t } = useI18n()

const classMap: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  settled: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  voided: 'bg-gray-200 text-gray-600 dark:bg-dark-700 dark:text-dark-400'
}
</script>
