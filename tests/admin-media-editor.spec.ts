import { expect, test } from '@playwright/test'
import { answerAdminNotice } from './admin-notice-fixtures'

test('El panel publica cinco campañas editables y el video editorial tras guardar y recargar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/home')
  await page.getByRole('button', { name: 'Carrusel principal' }).click()
  await expect(page.locator('.admin-home-slide-picker button')).toHaveCount(5)
  await expect(page.locator('.admin-home-slide-picker button')).toHaveText([
    /01Una fragancia/,
    /02Lo sutil también/,
    /03Ámbar y madera/,
    /04La frescura/,
    /05Tu esencia/,
  ])
  await page
    .getByRole('textbox', { name: 'Etiqueta superior' })
    .fill('Firma personal')
  await page
    .getByRole('textbox', { name: /^Título/ })
    .fill('Una\nesencia\npara\nti')
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'una a tres líneas',
  )
  await page
    .getByRole('textbox', { name: /^Título/ })
    .fill('Una esencia.\nTu momento.')
  await page
    .getByRole('textbox', { name: 'Descripción', exact: true })
    .fill('Un perfume para expresar tu momento.')
  await page
    .getByRole('textbox', { name: 'Texto del botón' })
    .fill('Ver la colección')
  await page
    .getByLabel('Subir imagen de escritorio de campaña 1')
    .setInputFiles('public/images/hero-v4-citrus-desktop-2048.webp')
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await expect(page.locator('.admin-home-hero-preview img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await page
    .getByLabel('Subir imagen móvil de campaña 1')
    .setInputFiles('public/images/hero-v4-citrus-mobile-1024.webp')
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await page.getByRole('button', { name: 'Móvil', exact: true }).click()
  await expect(page.locator('.admin-home-hero-preview')).toHaveClass(/--mobile/)
  await expect(page.locator('.admin-home-hero-preview img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await page.locator('.admin-home-slide-picker button').nth(4).click()
  await page
    .getByRole('textbox', { name: /^Título/ })
    .fill('Quinta campaña.\nTu aroma.')

  await page.getByRole('button', { name: 'Video editorial' }).click()
  await page
    .getByRole('textbox', { name: /^Título/ })
    .fill('Un ritual.\nMuy tuyo.')
  await page
    .getByRole('textbox', { name: 'Descripción', exact: true })
    .fill('Un momento para elegir tu fragancia.')
  await page
    .getByLabel('Subir video editorial')
    .setInputFiles('public/videos/README.md')
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    'Elige un video MP4',
  )
  await answerAdminNotice(page, 'dismiss')
  await page
    .getByLabel('Subir video editorial')
    .setInputFiles('public/videos/perfume-editorial-wide.mp4')
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await expect(page.locator('.admin-home-film-preview video')).toHaveAttribute(
    'src',
    /^data:video\/mp4;base64,/,
  )
  await expect(page.locator('.admin-home-film-preview video')).toHaveAttribute(
    'poster',
    /^data:image\/webp;base64,/,
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByText(/Cambios guardados/)).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una esencia',
  )
  await expect(
    page.locator('.hero-slide').first().locator('img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(page.locator('#editorial-film-title')).toContainText('Un ritual')
  await expect(page.locator('.editorial-film-copy')).toContainText(
    'Un momento para elegir tu fragancia.',
  )
  await expect(page.locator('.editorial-film-media img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.locator('.editorial-film-media').scrollIntoViewIfNeeded()
  await expect(page.locator('.editorial-film-media video')).toHaveAttribute(
    'src',
    /^data:video\/mp4;base64,/,
  )
  await expect(page.locator('.editorial-film-fallback')).toHaveCount(0)
  await page.getByRole('button', { name: 'Ver campaña 5' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Quinta campaña',
  )

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una esencia',
  )
  await expect(page.locator('#editorial-film-title')).toContainText('Un ritual')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
})

test('El Home muestra la edición visual de categorías y del buscador de perfumes tras recargar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/home')
  await page
    .getByRole('button', { name: 'Para él, para ella y unisex' })
    .click()

  const categoryPreview = page.locator('.admin-home-category--portrait img')
  await page
    .getByLabel('Subir imagen de Para él')
    .setInputFiles('public/images/cedre-480.webp')
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    '800 × 1000 px',
  )
  await answerAdminNotice(page, 'dismiss')
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await expect(categoryPreview).toHaveAttribute('src', /discovery-bois/)
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await page
    .getByLabel('Subir imagen de Para él')
    .setInputFiles('public/images/discovery-petale-1536.webp')
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await expect(categoryPreview).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await expect(
    page.getByText('4:5 · mínimo 800 × 1000 px').first(),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Encuentra tu perfume ideal' }).click()
  await page
    .getByRole('textbox', { name: 'Etiqueta superior' })
    .fill('Tu próximo aroma')
  await page
    .getByRole('textbox', { name: /^Título Una línea/ })
    .fill('Encuentra un perfume\npara ti')
  await page
    .getByRole('textbox', { name: 'Pregunta inicial' })
    .fill('¿Qué familia prefieres?')

  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByText(/Cambios guardados/)).toBeVisible()
  await page.goto('/')
  await expect(page.locator('.category--portrait img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await expect(page.locator('#encuentra-tu-perfume')).toContainText(
    'Tu próximo aroma',
  )
  await expect(page.locator('#encuentra-tu-perfume')).toContainText(
    'Encuentra un perfume',
  )
  await expect(page.locator('#encuentra-tu-perfume')).toContainText(
    '¿Qué familia prefieres?',
  )
  await page.reload()
  await expect(page.locator('#encuentra-tu-perfume')).toContainText(
    'Tu próximo aroma',
  )
  await expect(page.locator('.featured-section')).toHaveCount(0)
})

test('El administrador edita portada, pregunta, opción y resultado sin alterar la recomendación', async ({
  page,
}) => {
  await page.goto('/admin/home')
  await page.getByRole('button', { name: 'Encuentra tu perfume ideal' }).click()
  await page
    .getByRole('textbox', { name: 'Texto del botón' })
    .fill('Descubrir mi aroma')
  await page
    .getByRole('textbox', { name: 'Título del modal' })
    .fill('Tu recorrido olfativo')

  const coverUpload = page.getByLabel(
    'Subir imagen de escritorio del recomendador',
  )
  await coverUpload.setInputFiles('public/images/cedre-480.webp')
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    '1536 × 864 px',
  )
  await answerAdminNotice(page, 'dismiss')
  await coverUpload.setInputFiles(
    'public/images/hero-v4-citrus-desktop-2048.webp',
  )
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await expect(page.locator('.admin-home-finder-scene img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await page
    .getByLabel('Subir imagen móvil del recomendador')
    .setInputFiles('public/images/hero-v4-citrus-mobile-1024.webp')
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await page.getByRole('button', { name: 'Móvil', exact: true }).click()
  await expect(page.locator('.admin-home-finder-scene img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('button', { name: 'Preguntas y opciones' }).click()
  await page
    .getByRole('combobox', { name: 'Paso del cuestionario' })
    .selectOption('family')
  await page
    .getByRole('textbox', { name: 'Pregunta', exact: true })
    .fill('¿Qué perfil te inspira?')
  await page
    .locator('.admin-home-finder-option-editor')
    .filter({ hasText: 'Amaderado' })
    .getByRole('textbox', { name: 'Nombre que verá el cliente' })
    .fill('Maderas')
  await page
    .getByLabel('Subir imagen de opción Amaderado')
    .setInputFiles('public/images/cedre-480.webp')
  await expect(
    page
      .locator('.admin-home-finder-option-editor')
      .filter({ hasText: 'Amaderado' })
      .getByRole('img', { name: 'Imagen actual de Amaderado' }),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await expect(
    page.locator('.admin-home-finder-dialog-options img').first(),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(page.locator('.admin-home-finder-dialog-preview')).toContainText(
    'Maderas',
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('button', { name: 'Resultados' }).click()
  await page
    .getByRole('textbox', { name: 'Título si hay un solo perfume' })
    .fill('Tu elección de perfume')
  await page
    .getByRole('textbox', { name: 'Título del resultado', exact: true })
    .fill('Tus perfumes elegidos')
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await expect(page.locator('.admin-home-finder-result-preview h3')).toHaveText(
    'Tu elección de perfume',
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Todo guardado',
  )

  await page.goto('/')
  const finder = page.locator('#encuentra-tu-perfume')
  await expect(finder.locator('.finder-scene-image')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(finder.locator('picture source')).toHaveAttribute(
    'srcset',
    /^data:image\/webp;base64,/,
  )
  await expect
    .poll(() =>
      finder.locator('picture').evaluate((element) => {
        const image = element.querySelector('img')
        const source = element.querySelector('source')
        return image?.currentSrc === source?.srcset
      }),
    )
    .toBe(true)
  await page.reload()
  await finder.getByRole('button', { name: 'Descubrir mi aroma' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tu recorrido olfativo' })
  await expect(
    dialog.getByRole('heading', { name: '¿Qué perfil te inspira?' }),
  ).toBeVisible()
  await expect(
    dialog
      .getByRole('checkbox', { name: /Maderas/ })
      .locator('..')
      .locator('img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64/)
  await dialog.getByRole('checkbox', { name: /Maderas/ }).check()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  for (const answer of ['Diario', 'Moderada']) {
    await dialog.getByRole('checkbox', { name: answer, exact: true }).check()
    await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  }
  await dialog.getByRole('radio', { name: 'Hasta S/ 400' }).check()
  await dialog.getByRole('button', { name: 'Ver mis perfumes' }).click()
  await expect(
    dialog.getByRole('heading', { name: 'Tus perfumes elegidos' }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: 'Bois Clair' }),
  ).toBeVisible()
})

test('Un producto nuevo admite archivos, previsualiza la galería y se publica con su foto', async ({
  page,
}) => {
  await page.goto('/admin/productos/nuevo')
  await page
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Aura Uno')
  await page.getByRole('textbox', { name: 'URL del producto' }).fill('aura-uno')
  await page
    .getByRole('textbox', { name: 'Perfil aromático breve' })
    .fill('Floral · fresco')
  await page
    .getByLabel('Subir foto principal del producto')
    .setInputFiles('public/images/cedre-480.webp')
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    '800 × 1000 px',
  )
  await answerAdminNotice(page, 'dismiss')
  await page
    .getByLabel('Subir foto principal del producto')
    .setInputFiles('public/images/petale-960.webp')
  await expect(
    page.getByRole('textbox', { name: 'Descripción de la imagen' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click()
  const preview = page.getByRole('dialog', {
    name: 'Vista previa del producto',
  })
  await expect(
    preview.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(
    preview.getByRole('heading', { name: 'Aura Uno', level: 1 }),
  ).toBeVisible()
  await preview.getByRole('button', { name: 'Cerrar' }).click()
  await expect(page.locator('.admin-product-upload-item')).toHaveCount(4)
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Añadir otra foto' }),
  ).toHaveCount(0)
  await page
    .getByLabel('Subir vista 2 del producto')
    .setInputFiles('public/images/cedre-960.webp')
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click()
  await preview
    .locator('.product-thumbnails')
    .getByRole('button', { name: 'Ver imagen 2 de 2' })
    .click()
  await expect(
    preview.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(preview).toContainText('Aura Uno')
  await preview.getByRole('button', { name: 'Cerrar' }).click()

  await page.getByLabel('Precio (S/)').fill('420')
  await page.getByLabel('Stock de presentación 50 ml').fill('3')
  await page.getByLabel('Producto activo en tienda').check()
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/\/admin\/productos\?guardado=1$/)
  await page.goto('/producto/aura-uno')
  await expect(
    page.getByRole('heading', { name: 'Aura Uno', level: 1 }),
  ).toBeVisible()
  await expect(
    page.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(
    page.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('alt', /Aura Uno.*imagen principal/)

  await page.reload()
  await expect(
    page.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
})

test('Los editores visuales conservan controles y composición en móvil, tablet y escritorio', async ({
  page,
}) => {
  for (const width of [390, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/home')
    await page.getByRole('button', { name: 'Carrusel principal' }).click()
    await page.getByRole('button', { name: 'Abrir vista previa' }).click()
    await expect(page.locator('.admin-home-hero-preview')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `artifacts/admin-home-hero-${width}.png` })
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cerrar' })
      .click()
    await page.getByRole('button', { name: 'Video editorial' }).click()
    await page.getByRole('button', { name: 'Abrir vista previa' }).click()
    await expect(page.locator('.admin-home-film-preview')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `artifacts/admin-home-film-${width}.png` })
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cerrar' })
      .click()
    await page
      .getByRole('button', {
        name: 'Para él, para ella y unisex',
      })
      .click()
    await page.getByRole('button', { name: 'Abrir vista previa' }).click()
    await expect(page.locator('.admin-home-category-preview')).toBeVisible()
    await page.screenshot({
      path: `artifacts/admin-home-categories-${width}.png`,
    })
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cerrar' })
      .click()
    await page
      .getByRole('button', { name: 'Encuentra tu perfume ideal' })
      .click()
    await expect(
      page.getByRole('button', { name: 'Preguntas y opciones' }),
    ).toBeVisible()
    await page.screenshot({
      path: `artifacts/admin-home-finder-${width}.png`,
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)

    await page.goto('/admin/productos/nuevo')
    await expect(page.locator('.admin-product-upload-area')).toBeVisible()
    await page.locator('.admin-product-upload-area').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `artifacts/admin-product-upload-${width}.png`,
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  }
})
