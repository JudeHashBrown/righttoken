<template>
  <ModelQuickstart
    :title="t('tutorials.models.claude.title')"
    :tagline="t('tutorials.models.claude.tagline')"
    :prep-group-name="t('tutorials.models.claude.groupName')"
    cli-command="claude"
    :macos-code="macosCode"
    :windows-code="windowsCode"
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
import ModelQuickstart from '@/components/tutorials/ModelQuickstart.vue'

const { t } = useI18n()

const macosCode = `# 安装 Node.js（已装跳过）
brew install node

# 安装 Claude Code 官方 CLI
npm install -g @anthropic-ai/claude-code

# 设置环境变量（写入 ~/.zshrc 永久生效）
cat >> ~/.zshrc << 'EOF'
export ANTHROPIC_BASE_URL="https://righttoken.ai"
export ANTHROPIC_API_KEY="sk-你的key"
EOF
source ~/.zshrc

# 启动
claude`

const windowsCode = `# 1. 从 nodejs.org 下载安装 Node.js

# 2. PowerShell 跑：
npm install -g @anthropic-ai/claude-code

# 3. 设环境变量（用户级永久）
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', 'https://righttoken.ai', 'User')
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', 'sk-你的key', 'User')

# 4. 重开 PowerShell，跑：
claude`

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
