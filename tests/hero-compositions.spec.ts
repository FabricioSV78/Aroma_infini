import { expect, test } from '@playwright/test'

const sides = ['left', 'right', 'left', 'left', 'right']

test('Las cinco campañas conservan la fotografía continua, el mensaje unido y los controles visibles', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    for (const [index, side] of sides.entries()) {
      await page.locator('.hero-position-tracks button').nth(index).click()
      const slide = page.locator('.hero-slide.is-active')
      await expect(slide).toHaveAttribute('data-layout', side)
      await expect(slide.locator('img')).toBeVisible()

      const geometry = await slide.evaluate((element) => {
        const hero = element.closest('.hero')!.getBoundingClientRect()
        const image = element
          .querySelector('.hero-image')!
          .getBoundingClientRect()
        const heading = element
          .querySelector('.hero-title')!
          .getBoundingClientRect()
        const details = element
          .querySelector('.hero-copy-details')!
          .getBoundingClientRect()
        const cta = element.querySelector('.hero-cta')!.getBoundingClientRect()
        return {
          headingX: heading.x,
          headingBottom: heading.bottom,
          detailsTop: details.top,
          ctaBottom: cta.bottom,
          fullBleed:
            Math.abs(image.left - hero.left) <= 1 &&
            Math.abs(image.right - hero.right) <= 1,
          inside:
            heading.left >= hero.left - 1 &&
            heading.right <= hero.right + 1 &&
            cta.left >= hero.left - 1 &&
            cta.right <= hero.right + 1 &&
            cta.bottom <= hero.bottom + 1,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      })

      expect(
        geometry.fullBleed,
        `${viewport.width}px, slide ${index + 1}`,
      ).toBe(true)
      expect(geometry.inside, `${viewport.width}px, slide ${index + 1}`).toBe(
        true,
      )
      expect(geometry.overflow, `${viewport.width}px, slide ${index + 1}`).toBe(
        false,
      )
      expect(geometry.detailsTop - geometry.headingBottom).toBeLessThan(45)
      if (viewport.width === 360)
        expect(geometry.ctaBottom).toBeLessThanOrEqual(viewport.height)
      if (viewport.width >= 1024) {
        if (side === 'right')
          expect(geometry.headingX).toBeGreaterThan(viewport.width / 2)
        else expect(geometry.headingX).toBeLessThan(viewport.width / 3)
      }
    }

    await expect(
      page.getByRole('button', { name: 'Diapositiva anterior' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Diapositiva siguiente' }),
    ).toBeVisible()
  }
})
