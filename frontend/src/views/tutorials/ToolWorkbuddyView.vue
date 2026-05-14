<template>
  <article>
    <header class="mb-8 border-b border-gray-200/60 pb-6 dark:border-dark-700/60">
      <h1 class="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
        {{ t('tutorials.tools.workbuddy.name') }}
      </h1>
      <p class="text-base text-gray-600 dark:text-dark-400">
        {{ t('tutorials.tools.workbuddy.tagline') }}
      </p>
    </header>

    <!-- Step 1: Install -->
    <section class="mb-6">
      <h2 class="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white"
          >1</span
        >
        {{ t('tutorials.tools.workbuddy.sections.install.title') }}
      </h2>
      <p class="mb-3 pl-9 text-sm leading-relaxed text-gray-600 dark:text-dark-300">
        {{ t('tutorials.tools.workbuddy.sections.install.desc') }}
      </p>
      <a
        :href="t('tutorials.tools.workbuddy.sections.install.linkUrl')"
        target="_blank"
        rel="noopener noreferrer"
        class="ml-9 inline-flex items-center gap-2 rounded-lg border border-gray-200/60 bg-white px-4 py-2.5 text-sm font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-dark-600 dark:bg-dark-800 dark:text-primary-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
        {{ t('tutorials.tools.workbuddy.sections.install.linkLabel') }}
      </a>
    </section>

    <!-- Step 2: Model configuration -->
    <section class="mb-6">
      <h2 class="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white"
          >2</span
        >
        {{ t('tutorials.tools.workbuddy.sections.config.title') }}
      </h2>
      <p class="mb-3 pl-9 text-sm leading-relaxed text-gray-600 dark:text-dark-300">
        {{ t('tutorials.tools.workbuddy.sections.config.desc') }}
      </p>
      <a
        :href="t('tutorials.tools.workbuddy.sections.config.linkUrl')"
        target="_blank"
        rel="noopener noreferrer"
        class="ml-9 inline-flex items-center gap-2 rounded-lg border border-gray-200/60 bg-white px-4 py-2.5 text-sm font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-dark-600 dark:bg-dark-800 dark:text-primary-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
        {{ t('tutorials.tools.workbuddy.sections.config.linkLabel') }}
      </a>
    </section>

    <div class="mt-8">
      <router-link
        to="/tutorials"
        class="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {{ t('tutorials.common.backToList') }}
      </router-link>
    </div>
  </article>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
