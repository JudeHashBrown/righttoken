<template>
  <article>
    <!-- Header -->
    <header class="mb-8 border-b border-gray-200/60 pb-6 dark:border-dark-700/60">
      <h1 class="mb-2 text-3xl font-bold text-gray-900 dark:text-white">{{ title }}</h1>
      <p class="whitespace-pre-line text-base text-gray-600 dark:text-dark-400">{{ tagline }}</p>
    </header>

    <!-- Prep step -->
    <section class="mb-8">
      <h2 class="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
        <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">1</span>
        {{ t('tutorials.quickstart.prep.title') }}
      </h2>
      <p class="pl-9 text-sm leading-relaxed text-gray-600 dark:text-dark-300">
        {{ t('tutorials.quickstart.prep.desc', { group: prepGroupName }) }}
      </p>
    </section>

    <!-- OS Tabs -->
    <section class="mb-8">
      <h2 class="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
        <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">2</span>
        {{ t('tutorials.quickstart.install.title') }}
      </h2>

      <div class="ml-9">
        <div class="mb-3 flex gap-2">
          <button
            type="button"
            class="rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors"
            :class="activeOs === 'macos'
              ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-dark-600 dark:bg-dark-800 dark:text-dark-300'"
            @click="activeOs = 'macos'"
          >macOS / Linux</button>
          <button
            type="button"
            class="rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors"
            :class="activeOs === 'windows'
              ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-dark-600 dark:bg-dark-800 dark:text-dark-300'"
            @click="activeOs = 'windows'"
          >Windows</button>
        </div>

        <!-- Stepped install (preferred) -->
        <div v-if="activeSteps && activeSteps.length > 0" class="space-y-5">
          <div
            v-for="(step, i) in activeSteps"
            :key="i"
            class="rounded-lg border border-gray-200/70 bg-white/60 p-4 dark:border-dark-700/70 dark:bg-dark-800/40"
          >
            <h3 class="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <span class="flex h-5 w-5 items-center justify-center rounded-full bg-primary-500/15 text-[11px] font-bold text-primary-700 dark:text-primary-300">{{ i + 1 }}</span>
              {{ step.title }}
            </h3>
            <p v-if="step.desc" class="mb-2 whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-dark-300">{{ step.desc }}</p>
            <CodeBlock v-if="step.code" :code="step.code" />
            <p v-if="step.hint" class="mt-2 text-xs italic leading-relaxed text-gray-500 dark:text-dark-400">✓ {{ step.hint }}</p>
          </div>
        </div>

        <!-- Single-block install (fallback for older tutorials) -->
        <CodeBlock v-else-if="activeCode" :code="activeCode" />

        <p class="mt-3 text-sm leading-relaxed text-gray-600 dark:text-dark-300">
          {{ t('tutorials.quickstart.install.note', { cli: cliCommand }) }}
        </p>
      </div>
    </section>

    <!-- VS Code slot -->
    <section v-if="$slots.vscode" class="mb-8">
      <h2 class="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
        <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">{{ pythonCode ? 4 : 3 }}</span>
        {{ t('tutorials.quickstart.vscode.title') }}
      </h2>
      <div class="ml-9 space-y-3 text-sm leading-relaxed text-gray-600 dark:text-dark-300">
        <slot name="vscode" />
      </div>
    </section>

    <!-- Python snippet (only if pythonCode passed) -->
    <section v-if="pythonCode" class="mb-8">
      <h2 class="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
        <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">{{ $slots.vscode ? 5 : 3 }}</span>
        {{ t('tutorials.quickstart.python.title') }}
      </h2>
      <div class="ml-9">
        <CodeBlock :code="pythonCode" />
      </div>
    </section>

    <!-- FAQ slot -->
    <section v-if="$slots.faq" class="mb-8">
      <h2 class="mb-3 text-xl font-semibold text-gray-900 dark:text-white">
        {{ t('tutorials.quickstart.faq.title') }}
      </h2>
      <div class="space-y-2 text-sm leading-relaxed text-gray-600 dark:text-dark-300">
        <slot name="faq" />
      </div>
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CodeBlock from './CodeBlock.vue'

export interface InstallStep {
  title: string
  desc?: string
  code?: string
  hint?: string
}

const props = defineProps<{
  title: string
  tagline: string
  prepGroupName: string
  cliCommand: string
  macosCode?: string
  windowsCode?: string
  macosSteps?: InstallStep[]
  windowsSteps?: InstallStep[]
  pythonCode?: string
}>()

const { t } = useI18n()
const activeOs = ref<'macos' | 'windows'>('macos')

const activeSteps = computed(() => (activeOs.value === 'macos' ? props.macosSteps : props.windowsSteps))
const activeCode = computed(() => (activeOs.value === 'macos' ? props.macosCode : props.windowsCode))
</script>
