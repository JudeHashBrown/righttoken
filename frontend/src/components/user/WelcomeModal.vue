<template>
  <BaseDialog
    :show="show"
    :title="t('welcome.title')"
    width="wide"
    :close-on-click-outside="false"
    @close="emit('close')"
  >
    <div class="space-y-6">
      <!-- Section 1: 平台介绍 -->
      <section class="space-y-3">
        <p class="text-base leading-relaxed text-gray-700 dark:text-dark-200">
          {{ t('welcome.intro') }}
        </p>
        <div class="flex items-start gap-3 rounded-xl border border-primary-200/60 bg-primary-50/60 p-4 dark:border-primary-800/40 dark:bg-primary-900/20">
          <span class="text-lg leading-none">💡</span>
          <p class="text-sm leading-relaxed text-gray-700 dark:text-dark-200">
            {{ t('welcome.enterprise') }}
          </p>
        </div>
      </section>

      <!-- Section 2: 三步开始 -->
      <section class="space-y-3">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
          {{ t('welcome.stepsTitle') }}
        </h4>
        <ol class="space-y-3">
          <li
            v-for="(step, idx) in steps"
            :key="idx"
            class="flex items-start gap-3 rounded-xl border border-gray-200/60 bg-white/40 p-3 dark:border-dark-700/50 dark:bg-dark-800/40"
          >
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-500 text-sm font-semibold text-white"
            >{{ idx + 1 }}</span>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ step.title }}
              </div>
              <p class="mt-0.5 text-sm leading-relaxed text-gray-600 dark:text-dark-300">
                {{ step.desc }}
              </p>
            </div>
          </li>
        </ol>
      </section>
    </div>

    <template #footer>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button class="btn btn-secondary" @click="emit('close')">
          {{ t('welcome.dismiss') }}
        </button>
        <button class="btn btn-secondary" @click="goTutorials">
          {{ t('welcome.tutorials') }}
        </button>
        <button class="btn btn-primary" @click="goCreateKey">
          {{ t('welcome.createKey') }}
        </button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import BaseDialog from '@/components/common/BaseDialog.vue'

defineProps<{ show: boolean }>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const router = useRouter()

const steps = computed(() => [
  { title: t('welcome.steps.topup.title'), desc: t('welcome.steps.topup.desc') },
  { title: t('welcome.steps.key.title'), desc: t('welcome.steps.key.desc') },
  { title: t('welcome.steps.code.title'), desc: t('welcome.steps.code.desc') },
])

function goCreateKey() {
  emit('close')
  router.push('/keys')
}

function goTutorials() {
  emit('close')
  router.push('/tutorials')
}
</script>
