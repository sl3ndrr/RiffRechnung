import { expect, type Page } from '@playwright/test'

export type ThemeMotionWindow = Window & {
  themeEvents: Array<{ kind: string; x: number; y: number; radius: number }>
  squashes: Keyframe[][]
}

export async function observeThemeMotion(page: Page) {
  return page.evaluate(() => {
    const motion = window as unknown as ThemeMotionWindow
    motion.themeEvents = []
    motion.squashes = []
    const root = document.documentElement
    const record = (kind: string) => motion.themeEvents.push({
      kind,
      x: parseFloat(root.style.getPropertyValue('--reveal-x')),
      y: parseFloat(root.style.getPropertyValue('--reveal-y')),
      radius: parseFloat(root.style.getPropertyValue('--reveal-radius')),
    })
    new MutationObserver((records) => {
      if (records.some((r) => r.attributeName === 'data-transition') && root.dataset.transition === 'theme') record('reveal')
      if (records.some((r) => r.attributeName === 'class') && root.classList.contains('theme-changing')) record('fade')
    }).observe(root, { attributes: true, attributeFilter: ['class', 'data-transition'] })
    const thumb = document.querySelector<HTMLElement>('.theme-switch__thumb')!
    const animate = thumb.animate.bind(thumb)
    thumb.animate = (frames, options) => {
      const animation = animate(frames, options)
      motion.squashes.push((animation.effect as KeyframeEffect).getKeyframes())
      return animation
    }
    return typeof Reflect.get(document, 'startViewTransition') === 'function'
  })
}

export async function waitForThemeMotion(page: Page) {
  await expect(page.locator('html')).not.toHaveAttribute('data-transition', 'theme')
  await expect(page.locator('html')).not.toHaveClass(/theme-changing/)
}
