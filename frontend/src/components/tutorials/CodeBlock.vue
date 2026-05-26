<template>
  <div class="group/code relative">
    <pre
      class="overflow-x-auto rounded-xl border border-gray-200/70 bg-gray-50/80 p-4 text-xs leading-relaxed text-gray-800 dark:border-dark-700 dark:bg-dark-900/60 dark:text-dark-100"
    ><code>{{ code }}</code></pre>
    <button
      type="button"
      class="absolute right-2 top-2 rounded-lg border border-gray-200/60 bg-white/90 px-2 py-1 text-xs text-gray-600 opacity-0 transition-opacity hover:bg-white group-hover/code:opacity-100 dark:border-dark-600 dark:bg-dark-800/90 dark:text-dark-200 dark:hover:bg-dark-800"
      :aria-label="copied ? t('common.copied') : t('common.copy')"
      @click="onCopy"
    >
      {{ copied ? t('common.copied') : t('common.copy') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@/composables/useClipboard'

const props = defineProps<{ code: string }>()
const { t } = useI18n()
const { copyToClipboard } = useClipboard()
const copied = ref(false)

async function onCopy() {
  const ok = await copyToClipboard(props.code, t('common.copied'))
  if (!ok) return
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>
