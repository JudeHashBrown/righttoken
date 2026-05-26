<template>
  <div>
    <!-- Welcome header -->
    <div class="mb-8">
      <h1 class="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
        {{ t('tutorials.welcome.title') }}
      </h1>
      <p class="text-base text-gray-600 dark:text-dark-400">
        {{ t('tutorials.welcome.subtitle') }}
      </p>
    </div>

    <!-- ⭐ Model quickstarts (NEW, top section) -->
    <section class="mb-12">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
        ⭐ {{ t('tutorials.sections.models') }}
      </h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <router-link
          v-for="m in models"
          :key="m.id"
          :to="`/tutorials/${m.id}`"
          class="group rounded-2xl border border-gray-200/50 bg-white/60 p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60"
        >
          <div class="mb-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span :class="['flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white', m.color]">{{ m.letter }}</span>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ t(`tutorials.models.${m.id}.cardName`) }}
              </h3>
            </div>
            <svg class="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <p class="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
            {{ t(`tutorials.models.${m.id}.cardTagline`) }}
          </p>
        </router-link>
      </div>
    </section>

    <!-- 🔧 Tool tutorials (moved to bottom) -->
    <section class="mb-8">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
        🔧 {{ t('tutorials.sections.tools') }}
      </h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <router-link
          v-for="tool in tools"
          :key="tool.id"
          :to="`/tutorials/${tool.id}`"
          class="group rounded-2xl border border-gray-200/50 bg-white/60 p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60"
        >
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ t(`tutorials.tools.${tool.id}.name`) }}
            </h3>
            <svg class="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <p class="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
            {{ t(`tutorials.tools.${tool.id}.tagline`) }}
          </p>
        </router-link>
      </div>
    </section>

    <!-- Hint -->
    <p class="mt-8 text-xs text-gray-400 dark:text-dark-500">
      {{ t('tutorials.welcome.hint') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const models = [
  { id: 'claude', letter: 'C', color: 'bg-gradient-to-br from-orange-500 to-orange-600' },
  { id: 'codex',  letter: 'G', color: 'bg-gradient-to-br from-green-500 to-green-600' },
  { id: 'gemini', letter: 'G', color: 'bg-gradient-to-br from-blue-500 to-blue-600' }
] as const

const tools = [
  { id: 'hermes' },
  { id: 'workbuddy' },
  { id: 'openclaw' }
] as const
</script>
