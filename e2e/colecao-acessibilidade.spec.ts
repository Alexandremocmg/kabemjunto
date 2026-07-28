import { expect, test } from '@playwright/test';

async function goToLocalLobby(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.sessionStorage.setItem('kabemjunto.modo', 'local'));
  await page.reload();
}

async function openCollection(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: /personalizar perfil/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Coleção local — mobile 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('abre coleção e foco inicial está no botão fechar', async ({ page }) => {
    await goToLocalLobby(page);
    await openCollection(page);
    await expect(page.getByRole('button', { name: /fechar coleção/i })).toBeFocused();
  });

  test('Escape fecha o modal', async ({ page }) => {
    await goToLocalLobby(page);
    await openCollection(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('radiogroup de avatares: exatamente um checked', async ({ page }) => {
    await goToLocalLobby(page);
    await openCollection(page);
    const avatarGroup = page.getByRole('radiogroup', { name: /escolha seu avatar/i });
    await expect(avatarGroup).toBeVisible();
    const checked = avatarGroup.getByRole('radio', { checked: true });
    await expect(checked).toHaveCount(1);
  });

  test('radiogroup de temas: exatamente um checked, troca funciona', async ({ page }) => {
    await goToLocalLobby(page);
    await openCollection(page);
    const themeGroup = page.getByRole('radiogroup', { name: /escolha o tema da mesa/i });
    await expect(themeGroup).toBeVisible();

    const neonBtn = themeGroup.getByRole('radio', { name: /neon/i });
    await neonBtn.click();
    await expect(neonBtn).toHaveAttribute('aria-checked', 'true');

    const checkedCount = await themeGroup.getByRole('radio', { checked: true }).count();
    expect(checkedCount).toBe(1);
  });

  test('clique no backdrop fecha o painel', async ({ page }) => {
    await goToLocalLobby(page);
    await openCollection(page);
    const dialog = page.getByRole('dialog');

    const backdrop = page.locator('.collection-backdrop');
    const box = await backdrop.boundingBox();
    expect(box).not.toBeNull();
    // Click near the top of the backdrop, safely above the bottom-sheet panel
    await page.mouse.click(box!.x + box!.width / 2, box!.y + 40);
    await expect(dialog).not.toBeVisible();
  });

  test('todas as imagens na prévia do baralho carregam — naturalWidth > 0', async ({ page }) => {
    await goToLocalLobby(page);
    await openCollection(page);

    const images = page.locator('.collection-deck-preview img');
    const count = await images.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      await expect(img).toBeVisible();
      const naturalWidth = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
      expect(naturalWidth, `img ${i} deve ter naturalWidth > 0`).toBeGreaterThan(0);
    }
  });

  test('sem overflow horizontal — scrollWidth <= largura do viewport', async ({ page }) => {
    await goToLocalLobby(page);
    await openCollection(page);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await page.screenshot({ path: 'tmp/colecao-mobile-390x844.png', fullPage: false });
  });

  test('logo oficial carrega na tela local — naturalWidth > 0', async ({ page }) => {
    await goToLocalLobby(page);
    const logo = page.getByRole('img', { name: 'Kabemjunto' });
    await expect(logo).toBeVisible();
    const naturalWidth = await logo.evaluate((el) => (el as HTMLImageElement).naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });
});

test.describe('Coleção local — desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('modal central: sem overflow, imagens carregam, Escape fecha', async ({ page }) => {
    await goToLocalLobby(page);
    await openCollection(page);

    // Escape fecha
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Reabrir para verificar imagens e overflow
    await openCollection(page);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    const images = page.locator('.collection-deck-preview img');
    const count = await images.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const naturalWidth = await images
        .nth(i)
        .evaluate((el) => (el as HTMLImageElement).naturalWidth);
      expect(naturalWidth, `img ${i} deve ter naturalWidth > 0`).toBeGreaterThan(0);
    }

    await page.screenshot({ path: 'tmp/colecao-desktop-1280x800.png', fullPage: false });
  });

  test('logo oficial carrega na tela local desktop — naturalWidth > 0', async ({ page }) => {
    await goToLocalLobby(page);
    const logo = page.getByRole('img', { name: 'Kabemjunto' });
    await expect(logo).toBeVisible();
    const naturalWidth = await logo.evaluate((el) => (el as HTMLImageElement).naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);

    await page.screenshot({ path: 'tmp/local-lobby-logo-desktop-1280x800.png', fullPage: false });
  });
});
