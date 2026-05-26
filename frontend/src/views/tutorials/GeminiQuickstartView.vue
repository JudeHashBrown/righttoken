<template>
  <ModelQuickstart
    :title="t('tutorials.models.gemini.title')"
    :tagline="t('tutorials.models.gemini.tagline')"
    :prep-group-name="t('tutorials.models.gemini.groupName')"
    cli-command="gemini"
    :macos-code="macosCode"
    :windows-code="windowsCode"
  >
    <template #faq>
      <p>• {{ t('tutorials.models.gemini.faq.model') }}</p>
      <p>• {{ t('tutorials.models.gemini.faq.endpoint') }}</p>
    </template>
  </ModelQuickstart>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ModelQuickstart from '@/components/tutorials/ModelQuickstart.vue'

const { t } = useI18n()

const macosCode = `# 安装 Node.js（已装跳过）
brew install node

# 安装 Google Gemini 官方 CLI
npm install -g @google/gemini-cli

# 设置环境变量（写入 ~/.zshrc 永久生效）
cat >> ~/.zshrc << 'EOF'
export GEMINI_API_KEY="sk-你的key"
export GOOGLE_GEMINI_BASE_URL="https://righttoken.ai"
EOF
source ~/.zshrc

# 启动
gemini`

const windowsCode = `# 1. 从 nodejs.org 下载安装 Node.js

# 2. PowerShell 跑：
npm install -g @google/gemini-cli

# 3. 设环境变量（用户级永久）
[System.Environment]::SetEnvironmentVariable('GEMINI_API_KEY', 'sk-你的key', 'User')
[System.Environment]::SetEnvironmentVariable('GOOGLE_GEMINI_BASE_URL', 'https://righttoken.ai', 'User')

# 4. 重开 PowerShell，跑：
gemini`
</script>
