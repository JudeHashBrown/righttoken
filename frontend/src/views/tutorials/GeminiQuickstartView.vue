<template>
  <ModelQuickstart
    :title="t('tutorials.models.gemini.title')"
    :tagline="t('tutorials.models.gemini.tagline')"
    :prep-group-name="t('tutorials.models.gemini.groupName')"
    cli-command="gemini"
    :macos-steps="macosSteps"
    :windows-steps="windowsSteps"
  >
    <template #faq>
      <p>• {{ t('tutorials.models.gemini.faq.model') }}</p>
      <p>• {{ t('tutorials.models.gemini.faq.endpoint') }}</p>
    </template>
  </ModelQuickstart>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ModelQuickstart, { type InstallStep } from '@/components/tutorials/ModelQuickstart.vue'

const { t } = useI18n()

const tt = (key: string) => t(`tutorials.models.gemini.steps.${key}`)

const macosSteps: InstallStep[] = [
  { title: tt('macos.s1.title'), desc: tt('macos.s1.desc'), hint: tt('macos.s1.hint') },
  {
    title: tt('macos.s2.title'),
    desc: tt('macos.s2.desc'),
    code: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    hint: tt('macos.s2.hint'),
  },
  { title: tt('macos.s3.title'), desc: tt('macos.s3.desc'), code: 'brew install node', hint: tt('macos.s3.hint') },
  { title: tt('macos.s4.title'), desc: tt('macos.s4.desc'), code: 'npm install -g @google/gemini-cli', hint: tt('macos.s4.hint') },
  {
    title: tt('macos.s5.title'),
    desc: tt('macos.s5.desc'),
    code: `cat >> ~/.zshrc << 'EOF'
export GEMINI_API_KEY="sk-你的key"
export GOOGLE_GEMINI_BASE_URL="https://righttoken.ai"
export GEMINI_MODEL="gemini-2.5-flash"
EOF
source ~/.zshrc`,
    hint: tt('macos.s5.hint'),
  },
  { title: tt('macos.s6.title'), desc: tt('macos.s6.desc'), code: 'gemini', hint: tt('macos.s6.hint') },
]

const windowsSteps: InstallStep[] = [
  { title: tt('windows.s1.title'), desc: tt('windows.s1.desc'), hint: tt('windows.s1.hint') },
  { title: tt('windows.s2.title'), desc: tt('windows.s2.desc'), code: 'node --version', hint: tt('windows.s2.hint') },
  { title: tt('windows.s3.title'), desc: tt('windows.s3.desc'), code: 'npm install -g @google/gemini-cli', hint: tt('windows.s3.hint') },
  {
    title: tt('windows.s4.title'),
    desc: tt('windows.s4.desc'),
    code: `[System.Environment]::SetEnvironmentVariable('GEMINI_API_KEY', 'sk-你的key', 'User')
[System.Environment]::SetEnvironmentVariable('GOOGLE_GEMINI_BASE_URL', 'https://righttoken.ai', 'User')
[System.Environment]::SetEnvironmentVariable('GEMINI_MODEL', 'gemini-2.5-flash', 'User')`,
    hint: tt('windows.s4.hint'),
  },
  { title: tt('windows.s5.title'), desc: tt('windows.s5.desc'), code: 'gemini', hint: tt('windows.s5.hint') },
]
</script>