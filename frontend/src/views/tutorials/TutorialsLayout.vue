<template>
  <div
    class="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-gray-50 via-primary-50/30 to-gray-100 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950"
  >
    <!-- Background Decorations (subtle, matches HomeView) -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-primary-400/10 blur-3xl"></div>
      <div class="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary-500/10 blur-3xl"></div>
    </div>

    <!-- Header -->
    <header class="relative z-20 border-b border-gray-200/50 px-6 py-4 backdrop-blur-sm dark:border-dark-800/50">
      <nav class="mx-auto flex max-w-7xl items-center justify-between">
        <!-- Logo + Title -->
        <router-link to="/home" class="flex items-center gap-3">
          <div class="h-9 w-9 overflow-hidden rounded-xl shadow-md">
            <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-base font-semibold text-gray-900 dark:text-white">{{ siteName }}</span>
            <span class="text-sm text-gray-400 dark:text-dark-500">/</span>
            <span class="text-sm font-medium text-primary-600 dark:text-primary-400">{{
              t('tutorials.nav.title')
            }}</span>
          </div>
        </router-link>

        <!-- Right actions -->
        <div class="flex items-center gap-3">
          <LocaleSwitcher />

          <router-link
            to="/home"
            class="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:inline-flex dark:text-dark-300 dark:hover:bg-dark-800 dark:hover:text-white"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {{ t('tutorials.nav.backToHome') }}
          </router-link>

          <button
            @click="toggleTheme"
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
            :title="isDark ? t('home.switchToLight') : t('home.switchToDark')"
          >
            <Icon v-if="isDark" name="sun" size="md" />
            <Icon v-else name="moon" size="md" />
          </button>

          <router-link
            v-if="isAuthenticated"
            :to="dashboardPath"
            class="inline-flex items-center rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            {{ t('home.dashboard') }}
          </router-link>
          <router-link
            v-else
            to="/login"
            class="inline-flex items-center rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            {{ t('home.login') }}
          </router-link>
        </div>
      </nav>
    </header>

    <!-- Body: Sidebar + Content -->
    <main class="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 lg:flex-row">
      <!-- Sidebar -->
      <aside class="lg:w-60 lg:shrink-0">
        <!-- Mobile dropdown -->
        <div class="mb-4 lg:hidden">
          <select
            v-model="mobileTool"
            @change="goMobile"
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-200"
          >
            <option value="">— {{ t('tutorials.sidebar.title') }} —</option>
            <optgroup :label="t('tutorials.sections.models')">
              <option v-for="m in models" :key="m.id" :value="m.id">
                {{ $t(`tutorials.models.${m.id}.cardName`) }}
              </option>
            </optgroup>
            <optgroup :label="t('tutorials.sections.tools')">
              <option v-for="t in tools" :key="t.id" :value="t.id">
                {{ $t(`tutorials.tools.${t.id}.name`) }}
              </option>
            </optgroup>
          </select>
        </div>

        <!-- Desktop sidebar -->
        <div
          class="sticky top-6 hidden rounded-2xl border border-gray-200/50 bg-white/60 p-4 backdrop-blur-sm lg:block dark:border-dark-700/50 dark:bg-dark-800/60"
        >
          <!-- Models section -->
          <p class="mb-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
            ⭐ {{ t('tutorials.sections.models') }}
          </p>
          <nav class="mb-5 space-y-1">
            <router-link
              v-for="m in models"
              :key="m.id"
              :to="`/tutorials/${m.id}`"
              class="block rounded-lg px-3 py-2 text-sm transition-colors"
              :class="
                $route.path === `/tutorials/${m.id}`
                  ? 'bg-primary-500/10 font-medium text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-dark-300 dark:hover:bg-dark-700'
              "
            >
              {{ $t(`tutorials.models.${m.id}.cardName`) }}
            </router-link>
          </nav>

          <!-- Tools section -->
          <p class="mb-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
            🔧 {{ t('tutorials.sections.tools') }}
          </p>
          <nav class="space-y-1">
            <router-link
              v-for="tool in tools"
              :key="tool.id"
              :to="`/tutorials/${tool.id}`"
              class="block rounded-lg px-3 py-2 text-sm transition-colors"
              :class="
                $route.path === `/tutorials/${tool.id}`
                  ? 'bg-primary-500/10 font-medium text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-dark-300 dark:hover:bg-dark-700'
              "
            >
              {{ $t(`tutorials.tools.${tool.id}.name`) }}
            </router-link>
          </nav>
        </div>
      </aside>

      <!-- Content slot -->
      <section class="min-w-0 flex-1">
        <router-view v-slot="{ Component }">
          <Transition
            mode="out-in"
            enter-active-class="transition ease-out duration-200"
            enter-from-class="opacity-0 translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
          >
            <component :is="Component" />
          </Transition>
        </router-view>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore, useAppStore } from '@/stores'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import Icon from '@/components/icons/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const appStore = useAppStore()

// Model quickstart list (top section)
const models = [
  { id: 'claude' },
  { id: 'codex' },
  { id: 'gemini' }
] as const

// Canonical tool list — order: Hermes, Workbuddy, OpenClaw (per user spec)
const tools = [
  { id: 'hermes' },
  { id: 'workbuddy' },
  { id: 'openclaw' }
] as const

const siteName = computed(
  () => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'RightToken'
)
const siteLogo = computed(() => appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '')

const isAuthenticated = computed(() => authStore.isAuthenticated)
const isAdmin = computed(() => authStore.isAdmin)
const dashboardPath = computed(() => (isAdmin.value ? '/admin/dashboard' : '/dashboard'))

const isDark = ref(document.documentElement.classList.contains('dark'))
function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

// Mobile dropdown sync with current route
const mobileTool = ref('')
watch(
  () => route.path,
  (p) => {
    const m = p.match(/^\/tutorials\/([a-z0-9-]+)$/)
    mobileTool.value = m ? m[1] : ''
  },
  { immediate: true }
)
function goMobile() {
  if (mobileTool.value) router.push(`/tutorials/${mobileTool.value}`)
}

onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
  authStore.checkAuth()
  if (!appStore.publicSettingsLoaded) appStore.fetchPublicSettings()
})
</script>
