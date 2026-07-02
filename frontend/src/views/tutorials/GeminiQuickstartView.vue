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
import { getScreenshotUrl } from '@/utils/tutorial-screenshots'

const { t } = useI18n()

const tt = (key: string) => t(`tutorials.models.gemini.steps.${key}`)
const ttOpt = (key: string): string | undefined => {
  const value = t(`tutorials.models.gemini.steps.${key}`)
  return value === `tutorials.models.gemini.steps.${key}` ? undefined : value
}

const macosSteps: InstallStep[] = [
  {
    title: tt('macos.s1.title'),
    desc: tt('macos.s1.desc'),
    hint: tt('macos.s1.hint'),
    screenshot: ttOpt('macos.s1.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'macos', 1),
  },
  {
    title: tt('macos.s2.title'),
    desc: tt('macos.s2.desc'),
    code: 'brew --version',
    installCode: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    installCodeLabel: ttOpt('macos.s2.installCodeLabel'),
    hint: tt('macos.s2.hint'),
    screenshot: ttOpt('macos.s2.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'macos', 2),
  },
  {
    title: tt('macos.s3.title'),
    desc: tt('macos.s3.desc'),
    code: 'node --version',
    installCode: 'brew install node',
    installCodeLabel: ttOpt('macos.s3.installCodeLabel'),
    hint: tt('macos.s3.hint'),
    screenshot: ttOpt('macos.s3.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'macos', 3),
  },
  {
    title: tt('macos.s4.title'),
    desc: tt('macos.s4.desc'),
    code: 'npm install -g @google/gemini-cli',
    hint: tt('macos.s4.hint'),
    screenshot: ttOpt('macos.s4.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'macos', 4),
  },
  {
    title: tt('macos.s5.title'),
    desc: tt('macos.s5.desc'),
    code: `cat >> ~/.zshrc << 'EOF'
export GEMINI_API_KEY="sk-你的Key"
export GOOGLE_GEMINI_BASE_URL="https://righttoken.ai"
export GEMINI_MODEL="gemini-2.5-flash"
EOF
source ~/.zshrc`,
    hint: tt('macos.s5.hint'),
    screenshot: ttOpt('macos.s5.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'macos', 5),
  },
  {
    title: tt('macos.s6.title'),
    desc: tt('macos.s6.desc'),
    code: 'gemini',
    hint: tt('macos.s6.hint'),
    screenshot: ttOpt('macos.s6.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'macos', 6),
  },
]

const windowsSteps: InstallStep[] = [
  {
    title: tt('windows.s1.title'),
    desc: tt('windows.s1.desc'),
    hint: tt('windows.s1.hint'),
    screenshot: ttOpt('windows.s1.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'windows', 1),
  },
  {
    title: tt('windows.s2.title'),
    desc: tt('windows.s2.desc'),
    code: 'node --version',
    hint: tt('windows.s2.hint'),
    screenshot: ttOpt('windows.s2.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'windows', 2),
  },
  {
    title: tt('windows.s3.title'),
    desc: tt('windows.s3.desc'),
    code: 'npm install -g @google/gemini-cli',
    hint: tt('windows.s3.hint'),
    screenshot: ttOpt('windows.s3.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'windows', 3),
  },
  {
    title: tt('windows.s4.title'),
    desc: tt('windows.s4.desc'),
    code: `[System.Environment]::SetEnvironmentVariable('GEMINI_API_KEY', 'sk-你的Key', 'User')
[System.Environment]::SetEnvironmentVariable('GOOGLE_GEMINI_BASE_URL', 'https://righttoken.ai', 'User')
[System.Environment]::SetEnvironmentVariable('GEMINI_MODEL', 'gemini-2.5-flash', 'User')`,
    hint: tt('windows.s4.hint'),
    screenshot: ttOpt('windows.s4.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'windows', 4),
  },
  {
    title: tt('windows.s5.title'),
    desc: tt('windows.s5.desc'),
    code: 'gemini',
    hint: tt('windows.s5.hint'),
    screenshot: ttOpt('windows.s5.screenshot'),
    screenshotUrl: getScreenshotUrl('gemini', 'windows', 5),
  },
]
</script>