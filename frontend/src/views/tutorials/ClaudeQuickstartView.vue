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
      <p>• {{ t('tutorials.models.claude.faq.timeout') }}</p>
      <p>• {{ t('tutorials.models.claude.faq.models') }}</p>
    </template>
  </ModelQuickstart>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ModelQuickstart, { type InstallStep } from '@/components/tutorials/ModelQuickstart.vue'

const { t } = useI18n()

const tt = (key: string) => t(`tutorials.models.claude.steps.${key}`)

const macosSteps: InstallStep[] = [
  { title: tt('macos.s1.title'), desc: tt('macos.s1.desc'), hint: tt('macos.s1.hint') },
  {
    title: tt('macos.s2.title'),
    desc: tt('macos.s2.desc'),
    code: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    hint: tt('macos.s2.hint'),
  },
  { title: tt('macos.s3.title'), desc: tt('macos.s3.desc'), code: 'brew install node', hint: tt('macos.s3.hint') },
  { title: tt('macos.s4.title'), desc: tt('macos.s4.desc'), code: 'npm install -g @anthropic-ai/claude-code', hint: tt('macos.s4.hint') },
  {
    title: tt('macos.s5.title'),
    desc: tt('macos.s5.desc'),
    code: `cat >> ~/.zshrc << 'EOF'
export ANTHROPIC_BASE_URL="https://righttoken.ai"
export ANTHROPIC_API_KEY="sk-你的key"
EOF
source ~/.zshrc`,
    hint: tt('macos.s5.hint'),
  },
  { title: tt('macos.s6.title'), desc: tt('macos.s6.desc'), code: 'claude', hint: tt('macos.s6.hint') },
]

const windowsSteps: InstallStep[] = [
  { title: tt('windows.s1.title'), desc: tt('windows.s1.desc'), hint: tt('windows.s1.hint') },
  { title: tt('windows.s2.title'), desc: tt('windows.s2.desc'), code: 'node --version', hint: tt('windows.s2.hint') },
  { title: tt('windows.s3.title'), desc: tt('windows.s3.desc'), code: 'npm install -g @anthropic-ai/claude-code', hint: tt('windows.s3.hint') },
  {
    title: tt('windows.s4.title'),
    desc: tt('windows.s4.desc'),
    code: `[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', 'https://righttoken.ai', 'User')
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', 'sk-你的key', 'User')`,
    hint: tt('windows.s4.hint'),
  },
  { title: tt('windows.s5.title'), desc: tt('windows.s5.desc'), code: 'claude', hint: tt('windows.s5.hint') },
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
