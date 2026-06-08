<template>
  <ModelQuickstart
    :title="t('tutorials.models.codex.title')"
    :tagline="t('tutorials.models.codex.tagline')"
    :prep-group-name="t('tutorials.models.codex.groupName')"
    cli-command="codex"
    :macos-steps="macosSteps"
    :windows-steps="windowsSteps"
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
import ModelQuickstart, { type InstallStep } from '@/components/tutorials/ModelQuickstart.vue'

const { t } = useI18n()

const tt = (key: string) => t(`tutorials.models.codex.steps.${key}`)

const macosMergeConfig = `setopt interactivecomments 2>/dev/null
mkdir -p ~/.codex && touch ~/.codex/config.toml
cp ~/.codex/config.toml ~/.codex/config.toml.bak
{
  echo 'model_provider = "RightToken"'
  echo 'model = "gpt-5.5"'
  echo ''
  awk '
    /^\\[model_providers\\.(RightToken|righttoken|OpenAI)\\]$/ { skip=1; next }
    skip && /^\\[/ { skip=0 }
    skip { next }
    /^model_provider[[:space:]]*=/ { next }
    /^model[[:space:]]*=[[:space:]]*"gpt-5\\.5"$/ { next }
    { print }
  ' ~/.codex/config.toml.bak
  echo ''
  echo '[model_providers.RightToken]'
  echo 'name = "RightToken"'
  echo 'base_url = "https://righttoken.ai/v1"'
  echo 'wire_api = "responses"'
  echo 'requires_openai_auth = true'
} > ~/.codex/config.toml`

const macosSteps: InstallStep[] = [
  { title: tt('macos.s1.title'), desc: tt('macos.s1.desc'), hint: tt('macos.s1.hint') },
  {
    title: tt('macos.s2.title'),
    desc: tt('macos.s2.desc'),
    code: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    hint: tt('macos.s2.hint'),
  },
  { title: tt('macos.s3.title'), desc: tt('macos.s3.desc'), code: 'brew install node', hint: tt('macos.s3.hint') },
  { title: tt('macos.s4.title'), desc: tt('macos.s4.desc'), code: 'npm install -g @openai/codex', hint: tt('macos.s4.hint') },
  { title: tt('macos.s5.title'), desc: tt('macos.s5.desc'), code: macosMergeConfig, hint: tt('macos.s5.hint') },
  {
    title: tt('macos.s6.title'),
    desc: tt('macos.s6.desc'),
    code: `cat > ~/.codex/auth.json << 'EOF'
{
  "OPENAI_API_KEY": "sk-你的key"
}
EOF
chmod 600 ~/.codex/auth.json`,
    hint: tt('macos.s6.hint'),
  },
  { title: tt('macos.s7.title'), desc: tt('macos.s7.desc'), code: 'codex', hint: tt('macos.s7.hint') },
]

const windowsMergeConfig = `$ConfigDir = "$HOME\\.codex"
New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
$ConfigPath = "$ConfigDir\\config.toml"
if (-not (Test-Path $ConfigPath)) { Set-Content -Path $ConfigPath -Value '' }
Copy-Item -Path $ConfigPath -Destination "$ConfigPath.bak" -Force

$Lines = Get-Content $ConfigPath
$Filtered = @()
$Skip = $false
foreach ($Line in $Lines) {
  if ($Line -match '^\\[model_providers\\.(RightToken|righttoken|OpenAI)\\]$') { $Skip = $true; continue }
  if ($Skip -and $Line -match '^\\[') { $Skip = $false }
  if ($Skip) { continue }
  if ($Line -match '^model_provider\\s*=') { continue }
  if ($Line -match '^model\\s*=\\s*"gpt-5\\.5"$') { continue }
  $Filtered += $Line
}

$Top = @"
model_provider = "RightToken"
model = "gpt-5.5"

"@
$Bottom = @"

[model_providers.RightToken]
name = "RightToken"
base_url = "https://righttoken.ai/v1"
wire_api = "responses"
requires_openai_auth = true
"@
($Top + ($Filtered -join "\`n") + $Bottom) | Set-Content -Path $ConfigPath -Encoding utf8`

const windowsSteps: InstallStep[] = [
  { title: tt('windows.s1.title'), desc: tt('windows.s1.desc'), hint: tt('windows.s1.hint') },
  { title: tt('windows.s2.title'), desc: tt('windows.s2.desc'), code: 'node --version', hint: tt('windows.s2.hint') },
  { title: tt('windows.s3.title'), desc: tt('windows.s3.desc'), code: 'npm install -g @openai/codex', hint: tt('windows.s3.hint') },
  { title: tt('windows.s4.title'), desc: tt('windows.s4.desc'), code: windowsMergeConfig, hint: tt('windows.s4.hint') },
  {
    title: tt('windows.s5.title'),
    desc: tt('windows.s5.desc'),
    code: `$AuthPath = "$HOME\\.codex\\auth.json"
@"
{
  "OPENAI_API_KEY": "sk-你的key"
}
"@ | Set-Content -Path $AuthPath -Encoding utf8`,
    hint: tt('windows.s5.hint'),
  },
  { title: tt('windows.s6.title'), desc: tt('windows.s6.desc'), code: 'codex', hint: tt('windows.s6.hint') },
]
</script>
