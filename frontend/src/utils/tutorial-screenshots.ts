const screenshotUrls = import.meta.glob<string>(
  '/src/assets/tutorial-screenshots/*.png',
  { eager: true, query: '?url', import: 'default' },
)

export type TutorialModel = 'claude' | 'codex' | 'gemini'
export type TutorialPlatform = 'macos' | 'windows'

export function getScreenshotUrl(
  model: TutorialModel,
  platform: TutorialPlatform,
  step: number,
): string | undefined {
  const key = `/src/assets/tutorial-screenshots/${model}-${platform}-s${step}.png`
  return screenshotUrls[key]
}
