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

const macosCode = `setopt interactivecomments 2>/dev/null

# 1. 安装 Node.js（已装跳过）
brew install node

# 2. 安装 OpenAI Codex CLI
npm install -g @openai/codex

# 3. 智能合并 Codex 配置：root key 放顶部、RightToken provider 放尾部、保留已有内容
mkdir -p ~/.codex && touch ~/.codex/config.toml
cp ~/.codex/config.toml ~/.codex/config.toml.bak
{
  echo 'model_provider = "righttoken"'
  echo 'model = "gpt-5.5"'
  echo ''
  awk '
    /^\\[model_providers\\.righttoken\\]$/ { skip=1; next }
    skip && /^\\[/ { skip=0 }
    skip { next }
    /^model_provider[[:space:]]*=/ { next }
    /^model[[:space:]]*=[[:space:]]*"gpt-5\\.5"$/ { next }
    { print }
  ' ~/.codex/config.toml.bak
  echo ''
  echo '[model_providers.righttoken]'
  echo 'name = "RightToken"'
  echo 'base_url = "https://righttoken.ai/v1"'
  echo 'env_key = "OPENAI_API_KEY"'
  echo 'wire_api = "responses"'
} > ~/.codex/config.toml

# 4. 设 API Key 环境变量
echo 'export OPENAI_API_KEY="sk-你的key"' >> ~/.zshrc
source ~/.zshrc

# 5. 启动
codex`

const windowsCode = `# 1. 从 nodejs.org 下载安装 Node.js

# 2. PowerShell 跑：
npm install -g @openai/codex

# 3. 智能合并 Codex 配置：root key 放顶部、RightToken provider 放尾部、保留已有内容
$ConfigDir = "$HOME\\.codex"
New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
$ConfigPath = "$ConfigDir\\config.toml"
if (-not (Test-Path $ConfigPath)) { Set-Content -Path $ConfigPath -Value '' }
Copy-Item -Path $ConfigPath -Destination "$ConfigPath.bak" -Force

# 过滤旧的 model_provider / model / [model_providers.righttoken] 块
$Lines = Get-Content $ConfigPath
$Filtered = @()
$Skip = $false
foreach ($Line in $Lines) {
  if ($Line -match '^\\[model_providers\\.righttoken\\]$') { $Skip = $true; continue }
  if ($Skip -and $Line -match '^\\[') { $Skip = $false }
  if ($Skip) { continue }
  if ($Line -match '^model_provider\\s*=') { continue }
  if ($Line -match '^model\\s*=\\s*"gpt-5\\.5"$') { continue }
  $Filtered += $Line
}

# 拼接：root key 在顶 + 已有内容 + RightToken provider 在尾
$Top = @"
model_provider = "righttoken"
model = "gpt-5.5"

"@
$Bottom = @"

[model_providers.righttoken]
name = "RightToken"
base_url = "https://righttoken.ai/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
"@
($Top + ($Filtered -join "\`n") + $Bottom) | Set-Content -Path $ConfigPath -Encoding utf8

# 4. 设 API Key 环境变量（用户级永久）
[System.Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'sk-你的key', 'User')

# 5. 重开 PowerShell，跑：
codex`
</script>
