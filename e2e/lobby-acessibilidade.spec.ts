import { expect, test } from '@playwright/test';

test('lobby apresenta foco inicial, ordem de tab e erro anunciado', async ({ page }) => {
  await page.goto('/');

  const nome = page.getByLabel('Seu nome');
  const codigo = page.getByLabel(/Codigo da sala/i);
  await expect(nome).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(codigo).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Entrar em sala' })).toBeFocused();
  await page.getByRole('button', { name: 'Entrar em sala' }).click();
  await expect(page.locator('[aria-live="polite"]')).toContainText('Informe seu nome');
});
