<template>
  <main class="flex min-h-[60vh] items-center justify-center p-6">
    <section class="max-w-md text-center">
      <h1 class="text-xl font-semibold text-gray-900 dark:text-white">正在进入用户运营管理</h1>
      <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
        系统正在验证您的访问权限并建立安全会话。
      </p>
      <p v-if="error" class="mt-4 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRecallAccess } from '@/composables/useRecallAccess'

const error = ref('')
const recall = useRecallAccess()
const route = useRoute()

onMounted(async () => {
  try {
    const requestedNext =
      typeof route.query.next === 'string' ? route.query.next : '/dashboard'
    await recall.open(requestedNext)
  } catch {
    error.value = '无法进入用户运营管理，请联系主管理员检查账号权限。'
  }
})
</script>
