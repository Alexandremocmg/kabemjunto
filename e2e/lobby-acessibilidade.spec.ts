import { expect, test } from '@playwright/test';

test('lobby apresenta foco inicial, ordem de tab e erro anunciado', async ({ page }) => {
  await page.goto('/');

  const nome = page.getByLabel('Seu nome');
  const codigo = page.getByLabel('Código da sala');
  await expect(nome).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(codigo).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Entrar em sala' })).toBeFocused();
  await page.getByRole('button', { name: 'Entrar em sala' }).click();
  await expect(page.locator('[aria-live="polite"]')).toContainText('Informe seu nome');
});

test('lobby mobile 390x844: sem overflow, logo carrega, Criar sala visualmente primeiro', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  // Logo carrega com naturalWidth > 0
  const logo = page.getByRole('img', { name: 'Kabemjunto' });
  await expect(logo).toBeVisible();
  const naturalWidth = await logo.evaluate((img) => (img as HTMLImageElement).naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);

  // Sem overflow horizontal
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => window.innerWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Foco inicial no campo nome
  await expect(page.getByLabel('Seu nome')).toBeFocused();

  // "Criar sala" aparece acima de "Entrar em sala" (bounding box y menor)
  const criarBox = await page.getByRole('button', { name: 'Criar sala' }).boundingBox();
  const entrarBox = await page.getByRole('button', { name: 'Entrar em sala' }).boundingBox();
  expect(criarBox).not.toBeNull();
  expect(entrarBox).not.toBeNull();
  expect(criarBox!.y).toBeLessThan(entrarBox!.y);

  await page.screenshot({ path: 'tmp/lobby-mobile-390x844.png', fullPage: false });
});

test('lobby desktop 1280x800: sem overflow, logo carrega', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const logo = page.getByRole('img', { name: 'Kabemjunto' });
  await expect(logo).toBeVisible();
  const naturalWidth = await logo.evaluate((img) => (img as HTMLImageElement).naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => window.innerWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  await page.screenshot({ path: 'tmp/lobby-desktop-1280x800.png', fullPage: false });
});
