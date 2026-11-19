import { expect, test } from '@playwright/test';

test('lobby apresenta foco inicial, ordem de tab e erro anunciado', async ({ page }) => {
  await page.goto('/');

  const nome = page.getByLabel('Seu apelido');
  await expect(nome).toBeFocused();

  // Ordem: apelido → fichas de jogadores → Jogar agora → Criar sala → código → Entrar.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: '4', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Mais jogadores, de 7 a 10' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Jogar agora' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Criar sala' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Código da sala')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Entrar em sala' })).toBeFocused();

  // Sem apelido, entrar numa sala avisa e leva o foco de volta ao campo.
  await page.getByRole('button', { name: 'Entrar em sala' }).click();
  await expect(page.locator('[aria-live="polite"]')).toContainText('Informe seu nome');
  await expect(nome).toBeFocused();
});

test.describe('celular', () => {
  // Toque de verdade: o ponteiro é "grosso" e o campo de apelido não recebe foco sozinho.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('lobby mobile 390x844: sem overflow, logo e cartas carregam, as duas escolhas aparecem sem rolar', async ({
    page,
  }) => {
    await page.goto('/');

    // Logo carrega com naturalWidth > 0
    const logo = page.getByRole('img', { name: 'Kabemjunto' });
    await expect(logo).toBeVisible();
    const naturalWidth = await logo.evaluate((img) => (img as HTMLImageElement).naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);

    // Todas as cartas do leque carregam
    const cartas = page.locator('.menu-leque-carta');
    await expect(cartas).toHaveCount(5);
    const todasCarregaram = await cartas.evaluateAll((imgs) =>
      imgs.every(
        (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
      ),
    );
    expect(todasCarregaram).toBe(true);

    // Sem overflow horizontal
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // No celular o campo não rouba o foco (abriria o teclado e esconderia o menu);
    // "Jogar agora" aparece inteiro e o título "Jogar com amigos" já está na tela, sem rolar.
    await expect(page.getByLabel('Seu apelido')).not.toBeFocused();
    const altura = await page.evaluate(() => window.innerHeight);
    const jogarAgora = await page.getByRole('button', { name: 'Jogar agora' }).boundingBox();
    const amigos = await page.getByRole('heading', { name: 'Jogar com amigos' }).boundingBox();
    expect(jogarAgora).not.toBeNull();
    expect(amigos).not.toBeNull();
    expect(jogarAgora!.y + jogarAgora!.height).toBeLessThanOrEqual(altura);
    expect(amigos!.y).toBeLessThan(altura);
    // "Jogar contra bots" vem antes de "Jogar com amigos".
    expect(jogarAgora!.y).toBeLessThan(amigos!.y);

    await page.screenshot({ path: 'tmp/lobby-mobile-390x844.png', fullPage: false });
  });
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
