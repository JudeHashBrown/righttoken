<template>
  <div class="flex min-h-screen flex-col bg-gray-50 text-gray-800 dark:bg-dark-950 dark:text-dark-100">
    <header class="border-b border-gray-200 bg-white dark:border-dark-800 dark:bg-dark-900">
      <div class="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-5">
        <router-link to="/home" class="flex items-center gap-3">
          <img :src="siteLogo || '/logo.png'" :alt="siteName" class="h-9 w-9 rounded-lg object-contain" />
          <span class="text-lg font-semibold text-gray-900 dark:text-white">{{ siteName }}</span>
        </router-link>
        <router-link
          to="/home"
          class="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
        >
          Back to home
        </router-link>
      </div>
    </header>

    <main class="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <section class="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm sm:p-10 dark:border-dark-800 dark:bg-dark-900">
        <p class="mb-2 text-sm font-medium uppercase tracking-wide text-primary-600 dark:text-primary-400">
          Support
        </p>
        <h1 class="text-3xl font-bold text-gray-900 sm:text-4xl dark:text-white">Contact RightToken</h1>
        <p class="mt-4 max-w-2xl text-sm leading-7 text-gray-600 dark:text-dark-300">
          RightToken is an independently operated AI API gateway and prepaid usage-credit platform.
          Contact us for account, billing, refund, security, abuse, privacy, or technical-support
          questions.
        </p>

        <div class="mt-10 grid gap-5 sm:grid-cols-2">
          <a
            href="mailto:contact@righttoken.ai"
            class="rounded-xl border border-primary-200 bg-primary-50/70 p-6 transition-colors hover:border-primary-400 dark:border-primary-900/50 dark:bg-primary-950/20"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
              Primary contact
            </p>
            <h2 class="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Email support</h2>
            <p class="mt-2 break-all text-sm font-medium text-primary-700 dark:text-primary-300">
              contact@righttoken.ai
            </p>
          </a>

          <div class="rounded-xl border border-gray-200 p-6 dark:border-dark-700">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-400">
              Website
            </p>
            <h2 class="mt-2 text-lg font-semibold text-gray-900 dark:text-white">RightToken</h2>
            <a
              href="https://righttoken.ai"
              class="mt-2 inline-block text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
            >
              https://righttoken.ai
            </a>
          </div>

          <div class="rounded-xl border border-gray-200 p-6 dark:border-dark-700">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-400">
              Availability
            </p>
            <h2 class="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Email intake</h2>
            <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">
              Requests may be submitted at any time. We normally respond within two business days.
            </p>
          </div>

          <div class="rounded-xl border border-gray-200 p-6 dark:border-dark-700">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-400">
              Additional channel
            </p>
            <h2 class="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Customer support</h2>
            <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">
              {{ secondaryContact }}
            </p>
          </div>
        </div>

        <div class="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          For your security, never send passwords, API keys, wallet seed phrases, private keys, or
          full payment-card details by email. For an order inquiry, include only your account email,
          order identifier, payment date, amount, and transaction identifier.
        </div>

        <div class="mt-10 border-t border-gray-200 pt-8 dark:border-dark-800">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Legal and privacy requests</h2>
          <p class="mt-3 text-sm leading-7 text-gray-600 dark:text-dark-300">
            For privacy requests, policy questions, security reports, or legal notices, email
            <a
              href="mailto:contact@righttoken.ai"
              class="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
            >
              contact@righttoken.ai
            </a>
            with a clear subject line. We may request reasonable information to verify your identity
            or the relevant transaction.
          </p>
        </div>
      </section>
    </main>

    <footer class="border-t border-gray-200 bg-white dark:border-dark-800 dark:bg-dark-900">
      <div class="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-8 text-center text-xs text-gray-500 dark:text-dark-400">
        <nav class="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <router-link v-for="link in legalLinks" :key="link.to" :to="link.to" class="hover:text-primary-600">
            {{ link.label }}
          </router-link>
        </nav>
        <p>
          RightToken is an independent service and is not affiliated with, endorsed by, or sponsored
          by OpenAI, Anthropic, Google, or their affiliates.
        </p>
        <p>&copy; {{ currentYear }} {{ siteName }}. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores'
import { sanitizeUrl } from '@/utils/url'

const appStore = useAppStore()
const siteName = computed(() => appStore.siteName || 'RightToken')
const siteLogo = computed(() =>
  sanitizeUrl(appStore.siteLogo || '', { allowRelative: true, allowDataUrl: true })
)
const secondaryContact = computed(() => {
  const value = appStore.contactInfo?.trim()
  return value && value.toLowerCase() !== 'contact@righttoken.ai'
    ? value
    : 'Additional support details are available in the RightToken dashboard.'
})
const currentYear = new Date().getFullYear()

const legalLinks = [
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/refund-policy', label: 'Refund Policy' },
  { to: '/acceptable-use', label: 'Acceptable Use Policy' },
  { to: '/contact', label: 'Contact' }
]
</script>
