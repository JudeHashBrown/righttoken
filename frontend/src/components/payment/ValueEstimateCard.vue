<template>
  <div
    class="rounded-2xl border border-primary-200/60 bg-gradient-to-br from-primary-50/40 to-white/60 p-5 backdrop-blur-sm dark:border-primary-800/40 dark:from-primary-900/15 dark:to-dark-800/60"
  >
    <div class="mb-4 flex items-center gap-2">
      <span class="text-lg leading-none">💡</span>
      <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
        {{ t('payment.valueEstimate.title', { amount: amount }) }}
      </h3>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <!-- Claude -->
      <div class="rounded-xl bg-white/70 p-4 dark:bg-dark-800/70">
        <div class="mb-2 flex items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 text-xs font-bold text-white">C</span>
          <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ t('payment.valueEstimate.claude.title') }}</span>
        </div>
        <ul class="space-y-1 text-xs leading-relaxed text-gray-600 dark:text-dark-300">
          <li>≈ <span class="font-medium text-gray-800 dark:text-dark-100">{{ claudeStats.tokens }}</span> {{ t('payment.valueEstimate.unitTokens') }}</li>
          <li>≈ <span class="font-medium text-gray-800 dark:text-dark-100">{{ claudeStats.articles }}</span> {{ t('payment.valueEstimate.unitArticles') }}</li>
        </ul>
        <p class="mt-2 border-t border-gray-200/50 pt-2 text-[11px] text-gray-500 dark:border-dark-700/50 dark:text-dark-400">
          {{ t('payment.valueEstimate.claude.bestFor') }}
        </p>
      </div>

      <!-- GPT -->
      <div class="rounded-xl bg-white/70 p-4 dark:bg-dark-800/70">
        <div class="mb-2 flex items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-green-600 text-xs font-bold text-white">G</span>
          <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ t('payment.valueEstimate.gpt.title') }}</span>
        </div>
        <ul class="space-y-1 text-xs leading-relaxed text-gray-600 dark:text-dark-300">
          <li>≈ <span class="font-medium text-gray-800 dark:text-dark-100">{{ gptStats.tokens }}</span> {{ t('payment.valueEstimate.unitTokens') }}</li>
          <li>≈ <span class="font-medium text-gray-800 dark:text-dark-100">{{ gptStats.articles }}</span> {{ t('payment.valueEstimate.unitArticles') }}</li>
        </ul>
        <p class="mt-2 border-t border-gray-200/50 pt-2 text-[11px] text-gray-500 dark:border-dark-700/50 dark:text-dark-400">
          {{ t('payment.valueEstimate.gpt.bestFor') }}
        </p>
      </div>
    </div>

    <p class="mt-3 text-[11px] text-gray-400 dark:text-dark-500">
      {{ t('payment.valueEstimate.footnote') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  amount: number   // CNY amount entered by user
}>()

const { t } = useI18n()

// Constants (kept here for transparency / easy tuning).
// We assume a 4:1 input:output ratio and that ~50% of input hits prompt
// cache (their actual cache hit rate runs ~79%, so 50% is conservative).
const FX_CNY_TO_USD = 7
// Claude Opus 4 (5折): cache_read $0.50/M, fresh input $2.50/M, output $12.50/M
// Effective input = 0.5×$0.50 + 0.5×$2.50 = $1.50/M
// 4:1 blend = (4×1.5 + 12.5)/5 = $3.70/M
const CLAUDE_BLENDED_PRICE_PER_M = 3.7
// GPT-5 (7折): cache_read $0.22/M, fresh input $0.88/M, output $7/M (30% cache hit)
// Effective input = 0.3×0.22 + 0.7×0.88 = $0.682/M
// 4:1 blend = (4×0.682 + 7)/5 = $1.95/M
const GPT_BLENDED_PRICE_PER_M = 1.95
// 1 篇中等文章 ≈ 1500 output + 4500 input context = 6000 total tokens
const TOKENS_PER_ARTICLE = 6000

function formatTokens(t: number): string {
  if (t <= 0) return '0'
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(t >= 10_000_000 ? 0 : 1)}M`
  if (t >= 10_000) return `${(t / 10_000).toFixed(0)}万`
  if (t >= 1000) return `${(t / 1000).toFixed(1)}千`
  return Math.round(t).toString()
}

function formatCount(c: number): string {
  if (c <= 0) return '0'
  if (c >= 10_000) return `${(c / 10_000).toFixed(1)}万`
  if (c >= 1000) return `${(c / 1000).toFixed(1)}千`
  if (c >= 100) return Math.round(c / 10).toString() + '0'
  return Math.round(c).toString()
}

function buildStats(blendedPricePerM: number) {
  const usd = (props.amount || 0) / FX_CNY_TO_USD
  const tokens = (usd / blendedPricePerM) * 1_000_000
  return {
    tokens: formatTokens(tokens),
    articles: formatCount(tokens / TOKENS_PER_ARTICLE),
  }
}

const claudeStats = computed(() => buildStats(CLAUDE_BLENDED_PRICE_PER_M))
const gptStats = computed(() => buildStats(GPT_BLENDED_PRICE_PER_M))
</script>
