import { expect, type Page } from '@playwright/test'

/** Act on the same accessible message dialog that an administrator uses. */
export async function answerAdminNotice(
  page: Page,
  answer: 'accept' | 'dismiss',
  label?: string,
) {
  const dialog = page.locator('.admin-notice-dialog')
  await expect(dialog).toBeVisible()
  if (label)
    await dialog.getByRole('button', { name: label, exact: true }).click()
  else if (answer === 'dismiss')
    await dialog.locator('.admin-notice-actions button').first().click()
  else await dialog.locator('.admin-notice-actions button').last().click()
}

export async function expectImportSuccess(page: Page, text: string) {
  await expect(page.locator('.admin-notice-dialog')).toContainText(text)
  await answerAdminNotice(page, 'dismiss', 'Cerrar')
}
