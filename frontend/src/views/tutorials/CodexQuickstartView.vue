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
import { getScreenshotUrl } from '@/utils/tutorial-screenshots'

const { t } = useI18n()

const tt = (key: string) => t(`tutorials.models.codex.steps.${key}`)
const ttOpt = (key: string): string | undefined => {
  const value = t(`tutorials.models.codex.steps.${key}`)
  return value === `tutorials.models.codex.steps.${key}` ? undefined : value
}

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
  {
    title: tt('macos.s1.title'),
    desc: tt('macos.s1.desc'),
    hint: tt('macos.s1.hint'),
    screenshot: ttOpt('macos.s1.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'macos', 1),
  },
  {
    title: tt('macos.s2.title'),
    desc: tt('macos.s2.desc'),
    code: 'brew --version',
    installCode: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    installCodeLabel: ttOpt('macos.s2.installCodeLabel'),
    hint: tt('macos.s2.hint'),
    screenshot: ttOpt('macos.s2.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'macos', 2),
  },
  {
    title: tt('macos.s3.title'),
    desc: tt('macos.s3.desc'),
    code: 'node --version',
    installCode: 'brew install node',
    installCodeLabel: ttOpt('macos.s3.installCodeLabel'),
    hint: tt('macos.s3.hint'),
    screenshot: ttOpt('macos.s3.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'macos', 3),
  },
  {
    title: tt('macos.s4.title'),
    desc: tt('macos.s4.desc'),
    code: 'npm install -g @openai/codex',
    hint: tt('macos.s4.hint'),
    screenshot: ttOpt('macos.s4.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'macos', 4),
  },
  {
    title: tt('macos.s5.title'),
    desc: tt('macos.s5.desc'),
    code: macosMergeConfig,
    hint: tt('macos.s5.hint'),
    screenshot: ttOpt('macos.s5.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'macos', 5),
  },
  {
    title: tt('macos.s6.title'),
    desc: tt('macos.s6.desc'),
    code: `cat > ~/.codex/auth.json << 'EOF'
{
  "OPENAI_API_KEY": "sk-你的Key"
}
EOF
chmod 600 ~/.codex/auth.json`,
    hint: tt('macos.s6.hint'),
    screenshot: ttOpt('macos.s6.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'macos', 6),
  },
  {
    title: tt('macos.s7.title'),
    desc: tt('macos.s7.desc'),
    code: 'codex',
    hint: tt('macos.s7.hint'),
    screenshot: ttOpt('macos.s7.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'macos', 7),
  },
]

const windowsMergeConfig = `$d="$HOME\\.codex"; New-Item -ItemType Directory -Force -Path $d | Out-Null; if (Test-Path "$d\\config.toml") { Copy-Item "$d\\config.toml" "$d\\config.toml.bak" -Force }; [System.IO.File]::WriteAllText("$d\\config.toml", "model_provider = \`"RightToken\`"\`r\`nmodel = \`"gpt-5.5\`"\`r\`n\`r\`n[model_providers.RightToken]\`r\`nname = \`"RightToken\`"\`r\`nbase_url = \`"https://righttoken.ai/v1\`"\`r\`nwire_api = \`"responses\`"\`r\`nrequires_openai_auth = true\`r\`n", (New-Object System.Text.UTF8Encoding $false)); Get-Content "$d\\config.toml"`

const windowsSteps: InstallStep[] = [
  {
    title: tt('windows.s1.title'),
    desc: tt('windows.s1.desc'),
    hint: tt('windows.s1.hint'),
    screenshot: ttOpt('windows.s1.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'windows', 1),
  },
  {
    title: tt('windows.s2.title'),
    desc: tt('windows.s2.desc'),
    code: 'node --version',
    hint: tt('windows.s2.hint'),
    screenshot: ttOpt('windows.s2.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'windows', 2),
  },
  {
    title: tt('windows.s3.title'),
    desc: tt('windows.s3.desc'),
    code: 'npm install -g @openai/codex',
    hint: tt('windows.s3.hint'),
    screenshot: ttOpt('windows.s3.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'windows', 3),
  },
  {
    title: tt('windows.s4.title'),
    desc: tt('windows.s4.desc'),
    code: windowsMergeConfig,
    hint: tt('windows.s4.hint'),
    screenshot: ttOpt('windows.s4.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'windows', 4),
  },
  {
    title: tt('windows.s5.title'),
    desc: tt('windows.s5.desc'),
    code: `$Key = "sk-你的Key"; $d = "$HOME\\.codex"; New-Item -ItemType Directory -Force -Path $d | Out-Null; [System.IO.File]::WriteAllText("$d\\auth.json", (@{OPENAI_API_KEY=$Key} | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false)); Get-Content "$d\\auth.json"`,
    hint: tt('windows.s5.hint'),
    screenshot: ttOpt('windows.s5.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'windows', 5),
  },
  {
    title: tt('windows.s6.title'),
    desc: tt('windows.s6.desc'),
    code: 'codex',
    hint: tt('windows.s6.hint'),
    screenshot: ttOpt('windows.s6.screenshot'),
    screenshotUrl: getScreenshotUrl('codex', 'windows', 6),
  },
]
</script>
