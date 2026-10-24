import { expect, test } from '@playwright/test'
import { setComplementsEnabled } from './complements-fixtures'

test.beforeEach(async ({ page }) => {
  expect(await setComplementsEnabled(page, true)).toBe('saved')
})

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 320, height: 740 },
]) {
  test(`Las cuatro categorías comparten encuadre, jerarquía y proporción · ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const section = page.locator('#descubrir')
    await section.scrollIntoViewIfNeeded()
    await expect(section.getByRole('heading', { level: 3 })).toHaveText([
      'Para él',
      'Para ella',
      'Unisex',
      'Complementos',
    ])
    const images = section.locator('.category-image img')
    await images.evaluateAll(async (images) => {
      await Promise.all(
        images.map(async (image) => {
          ;(image as HTMLImageElement).loading = 'eager'
          await (image as HTMLImageElement).decode()
        }),
      )
    })
    await expect(images.nth(3)).toHaveAttribute(
      'src',
      /discovery-complements-v1/,
    )
    expect(
      await images.evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).naturalWidth > 0 &&
            getComputedStyle(image).objectFit === 'cover',
        ),
      ),
    ).toBe(true)
    const geometry = await section.locator('.category').evaluateAll((cards) =>
      cards.map((card) => {
        const frame = card
          .querySelector('.category-image')!
          .getBoundingClientRect()
        const copy = card
          .querySelector('.category-copy')!
          .getBoundingClientRect()
        const headingElement = card.querySelector('h3')!
        const heading = headingElement.getBoundingClientRect()
        const textRange = document.createRange()
        textRange.selectNodeContents(headingElement)
        const text = textRange.getBoundingClientRect()
        const description = card.querySelector('p')!.getBoundingClientRect()
        const cardBounds = card.getBoundingClientRect()
        const arrow = card
          .querySelector('.category-arrow')!
          .getBoundingClientRect()
        return {
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          textTop: copy.top,
          headingTop: heading.top,
          headingRight: text.right,
          descriptionBottom: description.bottom,
          cardBottom: cardBounds.bottom,
          arrowLeft: arrow.left,
          arrowRight: arrow.right,
          right: copy.right,
        }
      }),
    )
    for (const bounds of geometry) {
      expect(bounds.width).toBeCloseTo(geometry[0].width, 1)
      expect(bounds.height).toBeCloseTo(geometry[0].height, 1)
      expect(bounds.width / bounds.height).toBeCloseTo(0.8, 2)
      expect(bounds.textTop - bounds.y - bounds.height).toBeCloseTo(0, 1)
      expect(bounds.headingRight).toBeLessThanOrEqual(bounds.arrowLeft - 4)
      expect(bounds.arrowRight).toBeLessThanOrEqual(bounds.right + 1)
      expect(bounds.descriptionBottom).toBeLessThanOrEqual(
        bounds.cardBottom + 1,
      )
    }
    if (viewport.width >= 1024) {
      for (const bounds of geometry)
        expect(bounds.y).toBeCloseTo(geometry[0].y, 1)
    } else {
      expect(geometry[0].y).toBeCloseTo(geometry[1].y, 1)
      expect(geometry[2].y).toBeCloseTo(geometry[3].y, 1)
      expect(geometry[2].x).toBeCloseTo(geometry[0].x, 1)
      expect(geometry[2].y).toBeGreaterThan(geometry[0].y + geometry[0].height)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    expect(errors).toEqual([])
    await section.evaluate((element) =>
      scrollTo({
        top: element.getBoundingClientRect().top + scrollY,
        behavior: 'instant',
      }),
    )
    await section.screenshot({
      path: `artifacts/categories-redesign/after-${viewport.width}.png`,
      animations: 'disabled',
      style: '.site-header, .skip-link { visibility: hidden !important; }',
    })
    await page.evaluate(() => {
      const top =
        document.querySelector('#descubrir')!.getBoundingClientRect().top +
        scrollY
      scrollTo(0, top - 110)
    })
    await page.screenshot({
      path: `artifacts/categories-redesign/context-${viewport.width}.png`,
      animations: 'disabled',
    })
  })
}

test('Las cuatro categorías se recorren con teclado y abren su filtro correspondiente', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const destinations = [
    '/tienda?genero=hombre',
    '/tienda?genero=mujer',
    '/tienda?genero=unisex',
    '/tienda?tipo=complemento',
  ]
  for (const [index, destination] of destinations.entries()) {
    const link = page.locator('#descubrir .category').nth(index)
    await link.focus()
    await expect(link).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(destination)
    await expect(page.locator('.catalog-chips')).toBeVisible()
    await page.goBack()
  }
})
