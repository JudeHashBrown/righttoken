<template>
  <ModelQuickstart
    :title="t('tutorials.models.codex.title')"
    :tagline="t('tutorials.models.codex.tagline')"
    :prep-group-name="t('tutorials.models.codex.groupName')"
    cli-command="codex"
    :macos-code="macosCode"
    :windows-code="windowsCode"
  >
    <template #vscode>
      <p>{{ t('tutorials.models.codex.vscode.intro') }}</p>
      <ol class="ml-1 list-decimal space-y-1 pl-4">
        <li>{{ t('tutorials.models.codex.vscode.step1') }}</li>
        <li>{{ t('tutorials.models.codex.vscode.step2') }}</li>
        <li>{{ t('tutorials.models.codex.vscode.step3') }}</li>
        <li>{{ t('tutorials.models.codex.vscode.step4') }}</li>
      </ol>
      <p class="pt-1 italic">{{ t('tutorials.models.codex.vscode.benefit') }}</p>
    </template>
    <template #faq>
      <p>• {{ t('tutorials.models.codex.faq.model') }}</p>
      <p>• {{ t('tutorials.models.codex.faq.models') }}</p>
    </template>
  </ModelQuickstart>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ModelQuickstart from '@/components/tutorials/ModelQuickstart.vue'

const { t } = useI18n()

const macosCode = `# 安装 Node.js（已装跳过）
brew install node

# 安装 OpenAI Codex CLI
npm install -g @openai/codex

# 设置环境变量（写入 ~/.zshrc 永久生效）
cat >> ~/.zshrc << 'EOF'
export OPENAI_BASE_URL="https://righttoken.ai/v1"
export OPENAI_API_KEY="sk-你的key"
EOF
source ~/.zshrc

# 启动
codex`

const windowsCode = `# 1. 从 nodejs.org 下载安装 Node.js

# 2. PowerShell 跑：
npm install -g @openai/codex

# 3. 设环境变量（用户级永久）
[System.Environment]::SetEnvironmentVariable('OPENAI_BASE_URL', 'https://righttoken.ai/v1', 'User')
[System.Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'sk-你的key', 'User')

# 4. 重开 PowerShell，跑：
codex`
</script>
