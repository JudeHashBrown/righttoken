<template>
  <AppLayout>
    <div class="space-y-6">
      <div v-if="showNewUserBonus" class="fixed bottom-4 left-4 right-4 z-40 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 shadow-xl backdrop-blur-md sm:bottom-auto sm:left-auto sm:right-4 sm:top-1/2 sm:w-72 sm:-translate-y-1/2 dark:border-amber-500/30 dark:bg-dark-900/95">
        <span class="text-xl" aria-hidden="true">🎁</span>
        <div>
          <p class="font-semibold text-amber-900 dark:text-amber-100">{{ t('dashboard.newUserBonus.title') }}</p>
          <p class="mt-0.5 text-sm text-amber-800/90 dark:text-amber-200/80">{{ t('dashboard.newUserBonus.description') }}</p>
        </div>
      </div>
      <div v-if="loading" class="flex items-center justify-center py-12"><LoadingSpinner /></div>
      <template v-else-if="stats">
        <UserDashboardStats :stats="stats" :balance="user?.balance || 0" :is-simple="authStore.isSimpleMode" />
        <UserDashboardCharts v-model:startDate="startDate" v-model:endDate="endDate" v-model:granularity="granularity" :loading="loadingCharts" :trend="trendData" :models="modelStats" @dateRangeChange="loadCharts" @granularityChange="loadCharts" @refresh="refreshAll" />
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div class="lg:col-span-2"><UserDashboardRecentUsage :data="recentUsage" :loading="loadingUsage" /></div>
          <div class="lg:col-span-1"><UserDashboardQuickActions /></div>
        </div>
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'; import { useI18n } from 'vue-i18n'; import { useAuthStore } from '@/stores/auth'; import { usageAPI, type UserDashboardStats as UserStatsType } from '@/api/usage'; import { paymentAPI } from '@/api/payment'
import AppLayout from '@/components/layout/AppLayout.vue'; import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import UserDashboardStats from '@/components/user/dashboard/UserDashboardStats.vue'; import UserDashboardCharts from '@/components/user/dashboard/UserDashboardCharts.vue'
import UserDashboardRecentUsage from '@/components/user/dashboard/UserDashboardRecentUsage.vue'; import UserDashboardQuickActions from '@/components/user/dashboard/UserDashboardQuickActions.vue'
import type { UsageLog, TrendDataPoint, ModelStat } from '@/types'

const { t } = useI18n(); const authStore = useAuthStore(); const user = computed(() => authStore.user)
const stats = ref<UserStatsType | null>(null); const loading = ref(false); const loadingUsage = ref(false); const loadingCharts = ref(false)
const showNewUserBonus = ref(false)
const trendData = ref<TrendDataPoint[]>([]); const modelStats = ref<ModelStat[]>([]); const recentUsage = ref<UsageLog[]>([])

const formatLD = (d: Date) => d.toISOString().split('T')[0]
const startDate = ref(formatLD(new Date(Date.now() - 6 * 86400000))); const endDate = ref(formatLD(new Date())); const granularity = ref('day')

const loadStats = async () => { loading.value = true; try { await authStore.refreshUser(); stats.value = await usageAPI.getDashboardStats() } catch (error) { console.error('Failed to load dashboard stats:', error) } finally { loading.value = false } }
const loadCharts = async () => { loadingCharts.value = true; try { const res = await Promise.all([usageAPI.getDashboardTrend({ start_date: startDate.value, end_date: endDate.value, granularity: granularity.value as any }), usageAPI.getDashboardModels({ start_date: startDate.value, end_date: endDate.value })]); trendData.value = res[0].trend || []; modelStats.value = res[1].models || [] } catch (error) { console.error('Failed to load charts:', error) } finally { loadingCharts.value = false } }
const loadRecent = async () => { loadingUsage.value = true; try { const res = await usageAPI.getByDateRange(startDate.value, endDate.value); recentUsage.value = res.items.slice(0, 5) } catch (error) { console.error('Failed to load recent usage:', error) } finally { loadingUsage.value = false } }
const loadNewUserBonusVisibility = async () => { try { const res = await paymentAPI.getMyOrders({ page: 1, page_size: 1, status: 'COMPLETED', order_type: 'balance' }); showNewUserBonus.value = (res.data.total || 0) === 0 } catch (error) { console.error('Failed to check recharge history:', error); showNewUserBonus.value = false } }
const refreshAll = () => { loadStats(); loadCharts(); loadRecent() }

onMounted(() => { refreshAll(); loadNewUserBonusVisibility() })
</script>
