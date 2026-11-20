import { expect, test } from './test'

for (const target of ['logo', 'shop', 'search', 'main'] as const) {
  test(`el contenido inicial permanece hasta el relevo interactivo y conserva el foco: ${target}`, async ({
    page,
  }) => {
    let release!: () => void
    const scriptsReady = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/src/main.tsx', async (route) => {
      await scriptsReady
      await route.continue()
    })
    await page.route('**/contacto', async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue()
      const response = await route.fetch()
      const html = (await response.text()).replace(
        '<div id="root"></div>',
        '<div id="root" data-public-initial-path="/contacto"><div class="store-layout" data-public-initial-visual><header class="site-header"><a href="/" class="wordmark" aria-label="Aroma Infini, inicio"></a><a class="nav-trigger" href="/tienda">Tienda</a><a href="/buscar" aria-label="Buscar perfumes"></a></header><main id="contenido" tabindex="-1"><h1>Contacto inicial</h1></main></div></div>',
      )
      await route.fulfill({ response, body: html })
    })
    await page.goto('/contacto', { waitUntil: 'commit' })
    await expect(
      page.getByRole('heading', { name: 'Contacto inicial' }),
    ).toBeVisible()
    const initial =
      target === 'main'
        ? page.locator('#contenido')
        : page.getByRole('link', {
            name:
              target === 'logo'
                ? 'Aroma Infini, inicio'
                : target === 'shop'
                  ? 'Tienda'
                  : 'Buscar perfumes',
            exact: true,
          })
    await initial.focus()
    await expect(initial).toBeFocused()
    await page.evaluate(() => {
      const states: boolean[] = []
      Object.assign(window, { initialHandoffStates: states })
      new MutationObserver(() =>
        states.push(Boolean(document.querySelector('#root .store-layout'))),
      ).observe(document.getElementById('root')!, { childList: true })
    })
    release()
    await expect(page.locator('main h1')).toHaveText('Contacto')
    await expect(page.locator('[data-public-initial-visual]')).toHaveCount(0)
    const header = page.getByRole('banner')
    const ready =
      target === 'main'
        ? page.locator('#contenido')
        : target === 'logo'
          ? header.getByRole('link', { name: 'Aroma Infini, inicio' })
          : header.getByRole('button', {
              name: target === 'shop' ? 'Tienda' : 'Buscar perfumes',
              exact: true,
            })
    await expect(ready).toBeFocused()
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { initialHandoffStates: boolean[] }
        ).initialHandoffStates.every(Boolean),
      ),
    ).toBe(true)
  })
}

test('un contenido inicial de otra URL no se conserva como si correspondiera a la ruta', async ({
  page,
}) => {
  await page.route('**/contacto', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        '<div id="root"></div>',
        '<div id="root" data-public-initial-path="/tienda"><div class="store-layout" data-public-initial-visual><h1>Otra ruta</h1></div></div>',
      ),
    })
  })
  await page.goto('/contacto')
  await expect(page.locator('main h1')).toHaveText('Contacto')
  await expect(page.getByRole('heading', { name: 'Otra ruta' })).toHaveCount(0)
  await expect(page.locator('[data-public-initial-visual]')).toHaveCount(0)
})

for (const state of ['finished', 'running', 'different-url'] as const) {
  test(`el relevo conserva las animaciones propias sin repetir la entrada: ${state}`, async ({
    page,
  }) => {
    await page.goto('/contacto')
    await expect(page.locator('main h1')).toHaveText('Contacto')
    const result = await page.evaluate(async (state) => {
      const modulePath = '/src/services/public-initial-motion.ts'
      const { capturePublicInitialMotion, restorePublicInitialMotion } =
        await import(modulePath)
      const host = document.createElement('div')
      host.dataset.publicInitialPath = location.pathname + location.search
      const surface = (initial: boolean) =>
        `<div class="store-layout" data-scroll-ready><div class="product-intro container" data-scroll-reveal="stagger" ${initial ? 'data-public-reveal="productIntro" data-revealed' : ''}><section class="product-gallery" style="--scroll-reveal-order:0"><a href="/producto/test">Foto</a></section><section class="product-purchase" style="--scroll-reveal-order:1"><h1>Perfume</h1></section></div></div>`
      host.innerHTML = surface(true)
      document.body.append(host)
      try {
        const old = host.getAnimations({ subtree: true })
        if (state === 'running')
          old.forEach((animation) => {
            animation.currentTime = 160
          })
        else old.forEach((animation) => animation.finish())
        capturePublicInitialMotion(host)
        host.innerHTML = surface(false)
        if (state === 'different-url')
          history.replaceState(null, '', '/contacto?different=1')
        const container = host.querySelector<HTMLElement>('.store-layout')!
        restorePublicInitialMotion(container)
        const animations = container.getAnimations({ subtree: true })
        const reveal = container
          .querySelector('[data-scroll-reveal]')!
          .hasAttribute('data-revealed')
        const opacity = getComputedStyle(
          container.querySelector('.product-gallery')!,
        ).opacity
        const progress = animations.map(
          (animation) => animation.effect!.getComputedTiming().progress,
        )
        // Consumed state must never reveal a second tree.
        host.innerHTML = surface(false)
        restorePublicInitialMotion(
          host.querySelector<HTMLElement>('.store-layout')!,
        )
        return {
          oldCount: old.length,
          reveal,
          opacity,
          progress,
          consumed: !host.querySelector('[data-revealed]'),
        }
      } finally {
        host.remove()
      }
    }, state)
    expect(result.oldCount).toBeGreaterThanOrEqual(3)
    expect(result.consumed).toBe(true)
    if (state === 'different-url') expect(result.reveal).toBe(false)
    else {
      expect(result.reveal).toBe(true)
      if (state === 'finished') {
        expect(result.opacity).toBe('1')
        expect(
          result.progress.every((progress) => progress === 1),
        ).toBe(true)
      } else
        expect(
          result.progress.some(
            (progress) =>
              typeof progress === 'number' && progress > 0 && progress < 1,
          ),
        ).toBe(true)
    }
  })
}
