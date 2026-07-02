<template>
  <ModelQuickstart
    :title="t('tutorials.models.claude.title')"
    :tagline="t('tutorials.models.claude.tagline')"
    :prep-group-name="t('tutorials.models.claude.groupName')"
    cli-command="claude"
    :macos-steps="macosSteps"
    :windows-steps="windowsSteps"
    :python-code="pythonCode"
  >
    <template #vscode>
      <p class="text-sm font-semibold text-gray-800 dark:text-dark-100">{{ t('tutorials.models.claude.vscode.option1Title') }}</p>
      <ol class="ml-1 list-decimal space-y-1 pl-4">
        <li>{{ t('tutorials.models.claude.vscode.option1Step1') }}</li>
        <li>{{ t('tutorials.models.claude.vscode.option1Step2') }}</li>
        <li>{{ t('tutorials.models.claude.vscode.option1Step3') }}</li>
        <li>{{ t('tutorials.models.claude.vscode.option1Step4') }}</li>
      </ol>
      <p class="pt-2 text-sm font-semibold text-gray-800 dark:text-dark-100">{{ t('tutorials.models.claude.vscode.option2Title') }}</p>
      <p>{{ t('tutorials.models.claude.vscode.option2Desc') }}</p>
    </template>
    <template #faq>
      <p>• {{ t('tutorials.models.claude.faq.oauthResidual') }}</p>
      <p>• {{ t('tutorials.models.claude.faq.bothEnvVars') }}</p>
      <p>• {{ t('tutorials.models.claude.faq.changeKey') }}</p>
      <p>• {{ t('tutorials.models.claude.faq.timeout') }}</p>
      <p>• {{ t('tutorials.models.claude.faq.models') }}</p>
    </template>
  </ModelQuickstart>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ModelQuickstart, { type InstallStep } from '@/components/tutorials/ModelQuickstart.vue'
import { getScreenshotUrl } from '@/utils/tutorial-screenshots'

const { t } = useI18n()

const tt = (key: string) => t(`tutorials.models.claude.steps.${key}`)

const ttOpt = (key: string): string | undefined => {
  const value = t(`tutorials.models.claude.steps.${key}`)
  return value === `tutorials.models.claude.steps.${key}` ? undefined : value
}

const macosSteps: InstallStep[] = [
  {
    title: tt('macos.s1.title'),
    desc: tt('macos.s1.desc'),
    hint: tt('macos.s1.hint'),
    screenshot: ttOpt('macos.s1.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'macos', 1),
  },
  {
    title: tt('macos.s2.title'),
    desc: tt('macos.s2.desc'),
    code: 'brew --version',
    installCode: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    installCodeLabel: ttOpt('macos.s2.installCodeLabel'),
    hint: tt('macos.s2.hint'),
    screenshot: ttOpt('macos.s2.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'macos', 2),
  },
  {
    title: tt('macos.s3.title'),
    desc: tt('macos.s3.desc'),
    code: 'node --version',
    installCode: 'brew install node',
    installCodeLabel: ttOpt('macos.s3.installCodeLabel'),
    hint: tt('macos.s3.hint'),
    screenshot: ttOpt('macos.s3.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'macos', 3),
  },
  {
    title: tt('macos.s4.title'),
    desc: tt('macos.s4.desc'),
    code: 'npm install -g @anthropic-ai/claude-code',
    hint: tt('macos.s4.hint'),
    screenshot: ttOpt('macos.s4.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'macos', 4),
  },
  {
    title: tt('macos.s5.title'),
    desc: tt('macos.s5.desc'),
    code: `cat >> ~/.zshrc << 'EOF'
export ANTHROPIC_BASE_URL="https://righttoken.ai"
export ANTHROPIC_AUTH_TOKEN="sk-你的Key"
EOF
source ~/.zshrc`,
    hint: tt('macos.s5.hint'),
    screenshot: ttOpt('macos.s5.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'macos', 5),
  },
  {
    title: tt('macos.s6.title'),
    desc: tt('macos.s6.desc'),
    code: 'claude',
    hint: tt('macos.s6.hint'),
    screenshot: ttOpt('macos.s6.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'macos', 6),
  },
]

const windowsSteps: InstallStep[] = [
  {
    title: tt('windows.s1.title'),
    desc: tt('windows.s1.desc'),
    hint: tt('windows.s1.hint'),
    screenshot: ttOpt('windows.s1.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'windows', 1),
  },
  {
    title: tt('windows.s2.title'),
    desc: tt('windows.s2.desc'),
    code: 'node --version',
    hint: tt('windows.s2.hint'),
    screenshot: ttOpt('windows.s2.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'windows', 2),
  },
  {
    title: tt('windows.s3.title'),
    desc: tt('windows.s3.desc'),
    code: 'npm install -g @anthropic-ai/claude-code',
    hint: tt('windows.s3.hint'),
    screenshot: ttOpt('windows.s3.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'windows', 3),
  },
  {
    title: tt('windows.s4.title'),
    desc: tt('windows.s4.desc'),
    code: `[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', 'https://righttoken.ai', 'User')
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_AUTH_TOKEN', 'sk-你的Key', 'User')`,
    hint: tt('windows.s4.hint'),
    screenshot: ttOpt('windows.s4.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'windows', 4),
  },
  {
    title: tt('windows.s5.title'),
    desc: tt('windows.s5.desc'),
    code: 'claude',
    hint: tt('windows.s5.hint'),
    screenshot: ttOpt('windows.s5.screenshot'),
    screenshotUrl: getScreenshotUrl('claude', 'windows', 5),
  },
]

const pythonCode = `from anthropic import Anthropic

client = Anthropic(
    api_key="sk-你的key",
    base_url="https://righttoken.ai",
)

r = client.messages.create(
    model="你需要的Claude模型",  # 例如 claude-opus-4-7 / claude-sonnet-4-5
    max_tokens=1024,
    messages=[{"role": "user", "content": "你好"}],
)
print(r.content[0].text)`
</script>
