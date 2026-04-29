<template>
  <!-- Custom Home Content: Full Page Mode -->
  <div v-if="homeContent" class="min-h-screen">
    <!-- iframe mode -->
    <iframe
      v-if="isHomeContentUrl"
      :src="homeContent.trim()"
      class="h-screen w-full border-0"
      allowfullscreen
    ></iframe>
    <!-- HTML mode - SECURITY: homeContent is admin-only setting, XSS risk is acceptable -->
    <div v-else v-html="homeContent"></div>
  </div>

  <!-- Default Home Page -->
  <div
    v-else
    class="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-gray-50 via-primary-50/30 to-gray-100 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950"
  >
    <!-- Background Decorations -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        class="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-primary-400/20 blur-3xl"
      ></div>
      <div
        class="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary-500/15 blur-3xl"
      ></div>
      <div
        class="absolute left-1/3 top-1/4 h-72 w-72 rounded-full bg-primary-300/10 blur-3xl"
      ></div>
      <div
        class="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-primary-400/10 blur-3xl"
      ></div>
      <div
        class="absolute inset-0 bg-[linear-gradient(rgba(20,184,166,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(20,184,166,0.03)_1px,transparent_1px)] bg-[size:64px_64px]"
      ></div>
    </div>

    <!-- Header -->
    <header class="relative z-20 px-6 py-4">
      <nav class="mx-auto flex max-w-6xl items-center justify-between">
        <!-- Logo -->
        <div class="flex items-center">
          <div class="h-10 w-10 overflow-hidden rounded-xl shadow-md">
            <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
          </div>
        </div>

        <!-- Nav Actions -->
        <div class="flex items-center gap-3">
          <!-- Language Switcher -->
          <LocaleSwitcher />

          <!-- Doc Link -->
          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
            :title="t('home.viewDocs')"
          >
            <Icon name="book" size="md" />
          </a>

          <!-- Theme Toggle -->
          <button
            @click="toggleTheme"
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
            :title="isDark ? t('home.switchToLight') : t('home.switchToDark')"
          >
            <Icon v-if="isDark" name="sun" size="md" />
            <Icon v-else name="moon" size="md" />
          </button>

          <!-- Login / Dashboard Button -->
          <router-link
            v-if="isAuthenticated"
            :to="dashboardPath"
            class="inline-flex items-center gap-1.5 rounded-full bg-gray-900 py-1 pl-1 pr-2.5 transition-colors hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <span
              class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-[10px] font-semibold text-white"
            >
              {{ userInitial }}
            </span>
            <span class="text-xs font-medium text-white">{{ t('home.dashboard') }}</span>
            <svg
              class="h-3 w-3 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
              />
            </svg>
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

    <!-- Main Content -->
    <main class="relative z-10 flex-1 px-6 py-16">
      <div class="mx-auto max-w-6xl">
        <!-- Hero Section - Left/Right Layout -->
        <div class="mb-12 flex flex-col items-center justify-between gap-12 lg:flex-row lg:gap-16">
          <!-- Left: Text Content -->
          <div class="flex-1 text-center lg:text-left">
            <h1
              class="mb-4 text-4xl font-bold text-gray-900 dark:text-white md:text-5xl lg:text-6xl"
            >
              {{ siteName }}
            </h1>
            <p class="mb-8 text-lg text-gray-600 dark:text-dark-300 md:text-xl">
              {{ siteSubtitle }}
            </p>

            <!-- CTA Button -->
            <div>
              <router-link
                :to="isAuthenticated ? dashboardPath : '/login'"
                class="btn btn-primary px-8 py-3 text-base shadow-lg shadow-primary-500/30"
              >
                {{ isAuthenticated ? t('home.goToDashboard') : t('home.getStarted') }}
                <Icon name="arrowRight" size="md" class="ml-2" :stroke-width="2" />
              </router-link>
            </div>
          </div>

          <!-- Right: Hero Image -->
          <div class="flex flex-1 justify-center lg:justify-end">
            <img
              :src="heroImage"
              :alt="siteName"
              loading="eager"
              fetchpriority="high"
              class="w-full max-w-[560px] rounded-2xl shadow-2xl shadow-primary-500/10 ring-1 ring-gray-200/50 dark:ring-dark-700/50"
            />
          </div>
        </div>

        <!-- Feature Tags - Centered -->
        <div class="mb-12 flex flex-wrap items-center justify-center gap-4 md:gap-6">
          <div
            class="inline-flex items-center gap-2.5 rounded-full border border-gray-200/50 bg-white/80 px-5 py-2.5 shadow-sm backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/80"
          >
            <Icon name="swap" size="sm" class="text-primary-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-dark-200">{{
              t('home.tags.subscriptionToApi')
            }}</span>
          </div>
          <div
            class="inline-flex items-center gap-2.5 rounded-full border border-gray-200/50 bg-white/80 px-5 py-2.5 shadow-sm backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/80"
          >
            <Icon name="shield" size="sm" class="text-primary-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-dark-200">{{
              t('home.tags.stickySession')
            }}</span>
          </div>
          <div
            class="inline-flex items-center gap-2.5 rounded-full border border-gray-200/50 bg-white/80 px-5 py-2.5 shadow-sm backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/80"
          >
            <Icon name="chart" size="sm" class="text-primary-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-dark-200">{{
              t('home.tags.realtimeBilling')
            }}</span>
          </div>
        </div>

        <!-- Features Grid -->
        <div class="mb-12 grid gap-6 md:grid-cols-3">
          <!-- Feature 1: Unified Gateway -->
          <div
            class="group rounded-2xl border border-gray-200/50 bg-white/60 p-6 backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30 transition-transform group-hover:scale-110"
            >
              <Icon name="server" size="lg" class="text-white" />
            </div>
            <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('home.features.unifiedGateway') }}
            </h3>
            <p class="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
              {{ t('home.features.unifiedGatewayDesc') }}
            </p>
          </div>

          <!-- Feature 2: Account Pool -->
          <div
            class="group rounded-2xl border border-gray-200/50 bg-white/60 p-6 backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-500/30 transition-transform group-hover:scale-110"
            >
              <svg
                class="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                />
              </svg>
            </div>
            <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('home.features.multiAccount') }}
            </h3>
            <p class="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
              {{ t('home.features.multiAccountDesc') }}
            </p>
          </div>

          <!-- Feature 3: Billing & Quota -->
          <div
            class="group rounded-2xl border border-gray-200/50 bg-white/60 p-6 backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/30 transition-transform group-hover:scale-110"
            >
              <svg
                class="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
                />
              </svg>
            </div>
            <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('home.features.balanceQuota') }}
            </h3>
            <p class="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
              {{ t('home.features.balanceQuotaDesc') }}
            </p>
          </div>
        </div>

        <!-- Comparison Table -->
        <div class="mb-8 text-center">
          <h2 class="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
            {{ t('home.comparison.title') }}
          </h2>
          <p class="text-sm text-gray-600 dark:text-dark-400">
            {{ t('home.comparison.subtitle') }}
          </p>
        </div>

        <div class="mb-16">
          <div
            class="overflow-hidden rounded-2xl border border-gray-200/50 bg-white/60 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b border-gray-200/50 dark:border-dark-700/50">
                    <th
                      class="px-4 py-4 font-semibold text-gray-700 dark:text-dark-200 md:px-6"
                    >
                      {{ t('home.comparison.headers.feature') }}
                    </th>
                    <th
                      class="px-4 py-4 font-semibold text-gray-500 dark:text-dark-400 md:px-6"
                    >
                      {{ t('home.comparison.headers.official') }}
                    </th>
                    <th
                      class="px-4 py-4 font-semibold text-primary-600 dark:text-primary-400 md:px-6"
                    >
                      <span class="inline-flex items-center gap-1.5">
                        {{ t('home.comparison.headers.us') }}
                        <span
                          class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-[10px] text-white"
                          >★</span
                        >
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="key in ['source', 'concurrency', 'availability', 'latency', 'banRisk']"
                    :key="key"
                    class="border-b border-gray-200/30 last:border-0 dark:border-dark-700/30"
                  >
                    <td
                      class="px-4 py-4 font-medium text-gray-900 dark:text-white md:px-6"
                    >
                      {{ t(`home.comparison.items.${key}.feature`) }}
                    </td>
                    <td class="px-4 py-4 text-gray-500 dark:text-dark-400 md:px-6">
                      <span class="inline-flex items-start gap-1.5">
                        <svg
                          class="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          stroke-width="2.5"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        {{ t(`home.comparison.items.${key}.official`) }}
                      </span>
                    </td>
                    <td
                      class="bg-primary-50/40 px-4 py-4 text-gray-800 dark:bg-primary-900/10 dark:text-dark-100 md:px-6"
                    >
                      <span class="inline-flex items-start gap-1.5">
                        <svg
                          class="mt-0.5 h-4 w-4 shrink-0 text-primary-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          stroke-width="2.5"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        {{ t(`home.comparison.items.${key}.us`) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Audience -->
        <div class="mb-8 text-center">
          <h2 class="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
            {{ t('home.audience.title') }}
          </h2>
        </div>

        <div class="mx-auto mb-16 grid max-w-4xl gap-4 md:grid-cols-2">
          <div
            class="flex items-start gap-3 rounded-xl border border-gray-200/50 bg-white/60 p-5 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div
              class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-xs font-bold text-white"
            >
              1
            </div>
            <p class="text-sm leading-relaxed text-gray-700 dark:text-dark-200">
              {{ t('home.audience.items.developers') }}
            </p>
          </div>
          <div
            class="flex items-start gap-3 rounded-xl border border-gray-200/50 bg-white/60 p-5 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div
              class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-xs font-bold text-white"
            >
              2
            </div>
            <p class="text-sm leading-relaxed text-gray-700 dark:text-dark-200">
              {{ t('home.audience.items.agents') }}
            </p>
          </div>
          <div
            class="flex items-start gap-3 rounded-xl border border-gray-200/50 bg-white/60 p-5 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div
              class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-xs font-bold text-white"
            >
              3
            </div>
            <p class="text-sm leading-relaxed text-gray-700 dark:text-dark-200">
              {{ t('home.audience.items.creators') }}
            </p>
          </div>
          <div
            class="flex items-start gap-3 rounded-xl border border-gray-200/50 bg-white/60 p-5 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div
              class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-xs font-bold text-white"
            >
              4
            </div>
            <p class="text-sm leading-relaxed text-gray-700 dark:text-dark-200">
              {{ t('home.audience.items.teams') }}
            </p>
          </div>
        </div>

        <!-- Trust Signals -->
        <div class="mb-16 grid gap-4 md:grid-cols-3">
          <!-- 企业采购 -->
          <div class="flex items-start gap-3 rounded-2xl border border-gray-200/50 bg-white/60 p-5 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/60">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            </div>
            <div class="min-w-0">
              <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ t('home.trust.enterprise') }}
              </h4>
              <p class="mt-1 text-xs leading-relaxed text-gray-500 dark:text-dark-400">
                {{ t('home.trust.enterpriseDesc') }}
              </p>
            </div>
          </div>

          <!-- 开发票 -->
          <div class="flex items-start gap-3 rounded-2xl border border-gray-200/50 bg-white/60 p-5 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/60">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600">
              <svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div class="min-w-0">
              <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ t('home.trust.invoice') }}
              </h4>
              <p class="mt-1 text-xs leading-relaxed text-gray-500 dark:text-dark-400">
                {{ t('home.trust.invoiceDesc') }}
              </p>
            </div>
          </div>

          <!-- 终身售后 -->
          <div class="flex items-start gap-3 rounded-2xl border border-gray-200/50 bg-white/60 p-5 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/60">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-600">
              <svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
            </div>
            <div class="min-w-0">
              <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ t('home.trust.lifetime') }}
              </h4>
              <p class="mt-1 text-xs leading-relaxed text-gray-500 dark:text-dark-400">
                {{ t('home.trust.lifetimeDesc') }}
              </p>
            </div>
          </div>
        </div>

        <!-- Pricing -->
        <div class="mb-8 text-center">
          <h2 class="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
            {{ t('home.pricing.title') }}
          </h2>
          <p class="text-sm text-gray-600 dark:text-dark-400">
            {{ t('home.pricing.subtitle') }}
          </p>
        </div>

        <!-- Tab buttons -->
        <div class="mb-6 flex justify-center">
          <div class="inline-flex rounded-xl border border-gray-200/50 bg-white/60 p-1 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/60">
            <button
              type="button"
              :class="[
                'rounded-lg px-5 py-2 text-sm font-medium transition-all',
                pricingTab === 'standard'
                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/30'
                  : 'text-gray-600 hover:text-gray-900 dark:text-dark-300 dark:hover:text-white'
              ]"
              @click="pricingTab = 'standard'"
            >
              {{ t('home.pricing.tabs.standard') }}
            </button>
            <button
              type="button"
              :class="[
                'rounded-lg px-5 py-2 text-sm font-medium transition-all',
                pricingTab === 'shared'
                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/30'
                  : 'text-gray-600 hover:text-gray-900 dark:text-dark-300 dark:hover:text-white'
              ]"
              @click="pricingTab = 'shared'"
            >
              {{ t('home.pricing.tabs.shared') }}
            </button>
          </div>
        </div>

        <!-- Standard pricing table -->
        <div v-if="pricingTab === 'standard'" class="mb-16">
          <div class="mb-4 text-center">
            <p class="text-base font-medium text-gray-800 dark:text-dark-100">
              {{ t('home.pricing.standard.headline') }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-dark-400">
              {{ t('home.pricing.standard.subheadline') }}
            </p>
          </div>
          <div
            class="overflow-hidden rounded-2xl border border-gray-200/50 bg-white/60 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b border-gray-200/50 dark:border-dark-700/50">
                    <th class="px-4 py-4 font-semibold text-gray-700 dark:text-dark-200 md:px-6">
                      {{ t('home.pricing.standard.headers.model') }}
                    </th>
                    <th class="px-4 py-4 font-semibold text-primary-600 dark:text-primary-400 md:px-6">
                      {{ t('home.pricing.standard.headers.input') }}
                    </th>
                    <th class="px-4 py-4 font-semibold text-primary-600 dark:text-primary-400 md:px-6">
                      {{ t('home.pricing.standard.headers.output') }}
                    </th>
                    <th class="px-4 py-4 font-semibold text-gray-500 dark:text-dark-400 md:px-6">
                      {{ t('home.pricing.standard.headers.official') }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in pricingRows"
                    :key="row.model"
                    class="border-b border-gray-200/30 last:border-0 dark:border-dark-700/30"
                  >
                    <td class="px-4 py-4 font-mono text-sm font-medium text-gray-900 dark:text-white md:px-6">
                      {{ row.model }}
                    </td>
                    <td class="bg-primary-50/40 px-4 py-4 text-gray-800 dark:bg-primary-900/10 dark:text-dark-100 md:px-6">
                      <span class="font-semibold">¥{{ row.inputCny }}</span>
                      <span class="ml-1 text-xs text-gray-500 dark:text-dark-400">/ M</span>
                    </td>
                    <td class="bg-primary-50/40 px-4 py-4 text-gray-800 dark:bg-primary-900/10 dark:text-dark-100 md:px-6">
                      <span class="font-semibold">¥{{ row.outputCny }}</span>
                      <span class="ml-1 text-xs text-gray-500 dark:text-dark-400">/ M</span>
                    </td>
                    <td class="px-4 py-4 text-xs text-gray-500 dark:text-dark-400 md:px-6">
                      <span>¥{{ row.inputOfficialCny }} / ¥{{ row.outputOfficialCny }}</span>
                      <span class="ml-1 text-[10px] text-gray-400 dark:text-dark-500">(≈ ${{ row.inputUsd }} / ${{ row.outputUsd }})</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p class="mt-3 text-center text-xs text-gray-500 dark:text-dark-400">
            {{ t('home.pricing.standard.unit') }}
          </p>

          <!-- ¥100 example block -->
          <div class="mt-8 rounded-2xl border border-gray-200/50 bg-gradient-to-br from-primary-50/40 to-white/40 p-6 backdrop-blur-sm dark:border-dark-700/50 dark:from-primary-900/10 dark:to-dark-800/40">
            <div class="mb-5 text-center">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ t('home.pricing.example.title') }}
              </h3>
              <p class="mt-1 text-xs text-gray-500 dark:text-dark-400">
                {{ t('home.pricing.example.subtitle') }}
              </p>
            </div>

            <!-- 3 model cards -->
            <div class="grid gap-4 md:grid-cols-3">
              <!-- gpt-5 -->
              <div class="rounded-xl bg-white/70 p-4 dark:bg-dark-800/70">
                <div class="mb-2 flex items-center gap-2">
                  <span class="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400">GPT-5</span>
                  <span class="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                    {{ t('home.pricing.example.models.gpt5.tag') }}
                  </span>
                </div>
                <ul class="space-y-1 text-xs leading-relaxed text-gray-600 dark:text-dark-300">
                  <li>{{ t('home.pricing.example.models.gpt5.tokens') }}</li>
                  <li>{{ t('home.pricing.example.models.gpt5.chars') }}</li>
                  <li>{{ t('home.pricing.example.models.gpt5.articles') }}</li>
                  <li>{{ t('home.pricing.example.models.gpt5.code') }}</li>
                </ul>
                <div class="mt-3 border-t border-gray-200/50 pt-2 text-xs text-gray-700 dark:border-dark-700/50 dark:text-dark-200">
                  {{ t('home.pricing.example.models.gpt5.bestFor') }}
                </div>
              </div>

              <!-- gpt-4o mini -->
              <div class="rounded-xl bg-white/70 p-4 dark:bg-dark-800/70">
                <div class="mb-2 flex items-center gap-2">
                  <span class="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400">GPT-4o mini</span>
                  <span class="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                    {{ t('home.pricing.example.models.gpt4oMini.tag') }}
                  </span>
                </div>
                <ul class="space-y-1 text-xs leading-relaxed text-gray-600 dark:text-dark-300">
                  <li>{{ t('home.pricing.example.models.gpt4oMini.tokens') }}</li>
                  <li>{{ t('home.pricing.example.models.gpt4oMini.chars') }}</li>
                  <li>{{ t('home.pricing.example.models.gpt4oMini.articles') }}</li>
                </ul>
                <div class="mt-3 border-t border-gray-200/50 pt-2 text-xs text-gray-700 dark:border-dark-700/50 dark:text-dark-200">
                  {{ t('home.pricing.example.models.gpt4oMini.bestFor') }}
                </div>
              </div>

              <!-- gemini flash -->
              <div class="rounded-xl bg-white/70 p-4 dark:bg-dark-800/70">
                <div class="mb-2 flex items-center gap-2">
                  <span class="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400">Gemini 2.5 Flash</span>
                  <span class="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                    {{ t('home.pricing.example.models.geminiFlash.tag') }}
                  </span>
                </div>
                <ul class="space-y-1 text-xs leading-relaxed text-gray-600 dark:text-dark-300">
                  <li>{{ t('home.pricing.example.models.geminiFlash.tokens') }}</li>
                  <li>{{ t('home.pricing.example.models.geminiFlash.chars') }}</li>
                  <li>{{ t('home.pricing.example.models.geminiFlash.articles') }}</li>
                </ul>
                <div class="mt-3 border-t border-gray-200/50 pt-2 text-xs text-gray-700 dark:border-dark-700/50 dark:text-dark-200">
                  {{ t('home.pricing.example.models.geminiFlash.bestFor') }}
                </div>
              </div>
            </div>

            <!-- Usage notes -->
            <div class="mt-5 rounded-xl bg-gray-50/80 p-4 dark:bg-dark-800/40">
              <div class="mb-2 text-sm font-semibold text-gray-800 dark:text-dark-100">
                {{ t('home.pricing.example.notes.title') }}
              </div>
              <ul class="ml-1 list-inside space-y-1 text-xs leading-relaxed text-gray-600 dark:text-dark-300">
                <li
                  v-for="(item, idx) in (tm('home.pricing.example.notes.items') as string[])"
                  :key="idx"
                >
                  • {{ item }}
                </li>
              </ul>
            </div>

          </div>
        </div>

        <!-- Shared monthly cards -->
        <div v-else class="mb-16">
          <div class="grid gap-6 md:grid-cols-2">
            <!-- OpenAI Flagship Monthly -->
            <div
              class="relative flex flex-col rounded-2xl border-2 border-primary-500/60 bg-gradient-to-br from-white/80 to-primary-50/40 p-6 shadow-lg shadow-primary-500/10 backdrop-blur-sm dark:border-primary-500/50 dark:from-dark-800/80 dark:to-primary-900/20"
            >
              <div
                class="absolute -top-3 left-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 px-3 py-1 text-xs font-semibold text-white shadow-md shadow-primary-500/30"
              >
                {{ t('home.pricing.shared.openai.badge') }}
              </div>
              <h3 class="mb-1 mt-2 text-xl font-bold text-gray-900 dark:text-white">
                {{ t('home.pricing.shared.openai.title') }}
              </h3>
              <p class="mb-4 text-sm font-medium text-primary-600 dark:text-primary-400">
                {{ t('home.pricing.shared.openai.tagline') }}
              </p>
              <div class="mb-4 flex items-baseline gap-1">
                <span class="text-4xl font-bold text-primary-600 dark:text-primary-400">
                  {{ t('home.pricing.shared.openai.price') }}
                </span>
                <span class="text-sm text-gray-500 dark:text-dark-400">
                  {{ t('home.pricing.shared.openai.priceUnit') }}
                </span>
              </div>
              <ul class="mb-6 flex-1 space-y-2">
                <li
                  v-for="(feature, idx) in (tm('home.pricing.shared.openai.features') as string[])"
                  :key="idx"
                  class="flex items-start gap-2 text-sm text-gray-700 dark:text-dark-200"
                >
                  <svg class="mt-0.5 h-4 w-4 shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{{ feature }}</span>
                </li>
              </ul>
              <RouterLink
                to="/login"
                class="rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 px-5 py-3 text-center text-sm font-semibold text-white shadow-md shadow-primary-500/30 transition-all hover:shadow-lg hover:shadow-primary-500/40"
              >
                {{ t('home.pricing.shared.openai.cta') }}
              </RouterLink>
            </div>

            <!-- More Providers Coming Soon -->
            <div
              class="relative flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300/70 bg-white/40 p-6 backdrop-blur-sm dark:border-dark-600/70 dark:bg-dark-800/40"
            >
              <div
                class="absolute -top-3 left-6 rounded-full bg-gray-400 px-3 py-1 text-xs font-semibold text-white dark:bg-dark-600"
              >
                {{ t('home.pricing.shared.more.comingSoon') }}
              </div>
              <h3 class="mb-2 mt-2 text-xl font-bold text-gray-700 dark:text-dark-200">
                {{ t('home.pricing.shared.more.title') }}
              </h3>
              <p class="mb-6 text-center text-sm text-gray-500 dark:text-dark-400">
                {{ t('home.pricing.shared.more.tagline') }}
              </p>
              <ul class="space-y-2 text-center">
                <li
                  v-for="(provider, idx) in (tm('home.pricing.shared.more.providers') as string[])"
                  :key="idx"
                  class="rounded-lg border border-gray-200/50 bg-white/60 px-4 py-2 text-sm font-medium text-gray-600 dark:border-dark-700/50 dark:bg-dark-800/60 dark:text-dark-300"
                >
                  {{ provider }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- 3-Step Flow -->
        <div class="mb-8 text-center">
          <h2 class="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
            {{ t('home.flow.title') }}
          </h2>
          <p class="text-sm text-gray-600 dark:text-dark-400">
            {{ t('home.flow.subtitle') }}
          </p>
        </div>

        <div class="relative mb-16 grid gap-6 md:grid-cols-3">
          <!-- Connector line (desktop only) -->
          <div
            class="pointer-events-none absolute left-[16.67%] right-[16.67%] top-7 hidden h-px bg-gradient-to-r from-primary-300/0 via-primary-400/60 to-primary-300/0 md:block dark:via-primary-500/40"
          ></div>

          <!-- Step 1 -->
          <div
            class="relative rounded-2xl border border-gray-200/50 bg-white/60 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div
              class="relative z-10 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-xl font-bold text-white shadow-lg shadow-primary-500/30"
            >
              1
            </div>
            <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('home.flow.step1.title') }}
            </h3>
            <p class="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
              {{ t('home.flow.step1.desc') }}
            </p>
          </div>

          <!-- Step 2 -->
          <div
            class="relative rounded-2xl border border-gray-200/50 bg-white/60 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div
              class="relative z-10 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-xl font-bold text-white shadow-lg shadow-primary-500/30"
            >
              2
            </div>
            <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('home.flow.step2.title') }}
            </h3>
            <p class="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
              {{ t('home.flow.step2.desc') }}
            </p>
          </div>

          <!-- Step 3 -->
          <div
            class="relative rounded-2xl border border-gray-200/50 bg-white/60 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60"
          >
            <div
              class="relative z-10 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-xl font-bold text-white shadow-lg shadow-primary-500/30"
            >
              3
            </div>
            <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('home.flow.step3.title') }}
            </h3>
            <p class="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
              {{ t('home.flow.step3.desc') }}
            </p>
          </div>
        </div>

        <!-- Supported Providers -->
        <div class="mb-8 text-center">
          <h2 class="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
            {{ t('home.providers.title') }}
          </h2>
          <p class="text-sm text-gray-600 dark:text-dark-400">
            {{ t('home.providers.description') }}
          </p>
        </div>

        <div class="mb-8 flex flex-wrap items-center justify-center gap-4">
          <!-- GPT - Supported -->
          <div
            class="flex items-center gap-2 rounded-xl border border-primary-200 bg-white/60 px-5 py-3 ring-1 ring-primary-500/20 backdrop-blur-sm dark:border-primary-800 dark:bg-dark-800/60"
          >
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-green-600"
            >
              <span class="text-xs font-bold text-white">G</span>
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-dark-200">GPT</span>
            <span
              class="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"
              >{{ t('home.providers.supported') }}</span
            >
          </div>
          <!-- Gemini - Supported -->
          <div
            class="flex items-center gap-2 rounded-xl border border-primary-200 bg-white/60 px-5 py-3 ring-1 ring-primary-500/20 backdrop-blur-sm dark:border-primary-800 dark:bg-dark-800/60"
          >
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"
            >
              <span class="text-xs font-bold text-white">G</span>
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-dark-200">{{ t('home.providers.gemini') }}</span>
            <span
              class="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"
              >{{ t('home.providers.supported') }}</span
            >
          </div>
          <!-- More - Coming Soon -->
          <div
            class="flex items-center gap-2 rounded-xl border border-gray-200/50 bg-white/40 px-5 py-3 opacity-60 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/40"
          >
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gray-500 to-gray-600"
            >
              <span class="text-xs font-bold text-white">+</span>
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-dark-200">{{ t('home.providers.more') }}</span>
            <span
              class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-dark-700 dark:text-dark-400"
              >{{ t('home.providers.soon') }}</span
            >
          </div>
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="relative z-10 border-t border-gray-200/50 px-6 py-8 dark:border-dark-800/50">
      <div
        class="mx-auto flex max-w-6xl flex-col items-center justify-center gap-4 text-center sm:flex-row sm:text-left"
      >
        <p class="text-sm text-gray-500 dark:text-dark-400">
          &copy; {{ currentYear }} RightToken. {{ t('home.footer.allRightsReserved') }}
        </p>
        <div class="flex items-center gap-4">
          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-dark-400 dark:hover:text-white"
          >
            {{ t('home.docs') }}
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useAuthStore, useAppStore } from '@/stores'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import Icon from '@/components/icons/Icon.vue'
import heroImage from '@/assets/hero.png'

const { t, tm } = useI18n()

// Pricing section state
const pricingTab = ref<'standard' | 'shared'>('standard')

// Pricing data: input/output USD per MTok from upstream
// inputCny / outputCny  = USD × 8.0 (final user price, ~10% service fee on top of fx)
// inputOfficialCny / outputOfficialCny = USD × 7.2 (official equivalent at FX, for comparison)
const pricingRows = [
  { model: 'gpt-5',            inputUsd: '1.25', outputUsd: '10',   inputCny: '10',   outputCny: '80',    inputOfficialCny: '9',     outputOfficialCny: '72' },
  { model: 'gpt-5.4',          inputUsd: '1.25', outputUsd: '10',   inputCny: '10',   outputCny: '80',    inputOfficialCny: '9',     outputOfficialCny: '72' },
  { model: 'gpt-4o',           inputUsd: '2.50', outputUsd: '10',   inputCny: '20',   outputCny: '80',    inputOfficialCny: '18',    outputOfficialCny: '72' },
  { model: 'gpt-4o-mini',      inputUsd: '0.15', outputUsd: '0.60', inputCny: '1.20', outputCny: '4.80',  inputOfficialCny: '1.08',  outputOfficialCny: '4.32' },
  { model: 'o3',               inputUsd: '2.00', outputUsd: '8.00', inputCny: '16',   outputCny: '64',    inputOfficialCny: '14.4',  outputOfficialCny: '57.6' },
  { model: 'o4-mini',          inputUsd: '1.10', outputUsd: '4.40', inputCny: '8.80', outputCny: '35.20', inputOfficialCny: '7.92',  outputOfficialCny: '31.68' },
  { model: 'gemini-2.5-pro',   inputUsd: '1.25', outputUsd: '10',   inputCny: '10',   outputCny: '80',    inputOfficialCny: '9',     outputOfficialCny: '72' },
  { model: 'gemini-2.5-flash', inputUsd: '0.30', outputUsd: '2.50', inputCny: '2.40', outputCny: '20',    inputOfficialCny: '2.16',  outputOfficialCny: '18' }
]

const authStore = useAuthStore()
const appStore = useAppStore()

// Site settings - directly from appStore (already initialized from injected config)
const siteName = computed(() => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'Sub2API')
const siteLogo = computed(() => appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '')
const siteSubtitle = computed(() => appStore.cachedPublicSettings?.site_subtitle || 'AI API Gateway Platform')
const docUrl = computed(() => appStore.cachedPublicSettings?.doc_url || appStore.docUrl || '')
const homeContent = computed(() => appStore.cachedPublicSettings?.home_content || '')

// Check if homeContent is a URL (for iframe display)
const isHomeContentUrl = computed(() => {
  const content = homeContent.value.trim()
  return content.startsWith('http://') || content.startsWith('https://')
})

// Theme
const isDark = ref(document.documentElement.classList.contains('dark'))

// Auth state
const isAuthenticated = computed(() => authStore.isAuthenticated)
const isAdmin = computed(() => authStore.isAdmin)
const dashboardPath = computed(() => isAdmin.value ? '/admin/dashboard' : '/dashboard')
const userInitial = computed(() => {
  const user = authStore.user
  if (!user || !user.email) return ''
  return user.email.charAt(0).toUpperCase()
})

// Current year for footer
const currentYear = computed(() => new Date().getFullYear())

// Toggle theme
function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

// Initialize theme
function initTheme() {
  const savedTheme = localStorage.getItem('theme')
  if (
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
}

onMounted(() => {
  initTheme()

  // Check auth state
  authStore.checkAuth()

  // Ensure public settings are loaded (will use cache if already loaded from injected config)
  if (!appStore.publicSettingsLoaded) {
    appStore.fetchPublicSettings()
  }
})
</script>

<style scoped>
/* Terminal Container */
.terminal-container {
  position: relative;
  display: inline-block;
}

/* Terminal Window */
.terminal-window {
  width: 420px;
  background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
  border-radius: 14px;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  overflow: hidden;
  transform: perspective(1000px) rotateX(2deg) rotateY(-2deg);
  transition: transform 0.3s ease;
}

.terminal-window:hover {
  transform: perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(-4px);
}

/* Terminal Header */
.terminal-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(30, 41, 59, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.terminal-buttons {
  display: flex;
  gap: 8px;
}

.terminal-buttons span {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.btn-close {
  background: #ef4444;
}
.btn-minimize {
  background: #eab308;
}
.btn-maximize {
  background: #22c55e;
}

.terminal-title {
  flex: 1;
  text-align: center;
  font-size: 12px;
  font-family: ui-monospace, monospace;
  color: #64748b;
  margin-right: 52px;
}

/* Terminal Body */
.terminal-body {
  padding: 20px 24px;
  font-family: ui-monospace, 'Fira Code', monospace;
  font-size: 14px;
  line-height: 2;
}

.code-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  opacity: 0;
  animation: line-appear 0.5s ease forwards;
}

.line-1 {
  animation-delay: 0.3s;
}
.line-2 {
  animation-delay: 1s;
}
.line-3 {
  animation-delay: 1.8s;
}
.line-4 {
  animation-delay: 2.5s;
}

@keyframes line-appear {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.code-prompt {
  color: #22c55e;
  font-weight: bold;
}
.code-cmd {
  color: #38bdf8;
}
.code-flag {
  color: #a78bfa;
}
.code-url {
  color: #14b8a6;
}
.code-comment {
  color: #64748b;
  font-style: italic;
}
.code-success {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.code-response {
  color: #fbbf24;
}

/* Blinking Cursor */
.cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: #22c55e;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0;
  }
}

/* Dark mode adjustments */
:deep(.dark) .terminal-window {
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(20, 184, 166, 0.2),
    0 0 40px rgba(20, 184, 166, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
</style>
