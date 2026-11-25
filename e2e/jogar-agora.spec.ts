/**
 * "Jogar agora": entra numa mesa pública e, se faltar gente, os bots completam.
 *
 * O servidor dos testes espera 6 s antes de chamar os bots (QUICKPLAY_WAIT_MS no
 * playwright.config.ts); em produção a espera é de 10 s.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const DICAS_VISTAS = JSON.stringify([
  'silencio',
  'ataque',
  'arrastar',
  'grupo',
  'zero-mais',
  'monte',
]);

/** Contextos WebGL são limitados no Chromium: cada cenário fecha os seus. */
const contextosAbertos: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contextosAbertos.splice(0).map((contexto) => contexto.close()));
});

async function novaPagina(browser: Browser): Promise<Page> {
  const contexto = await browser.newContext();
  contextosAbertos.push(contexto);
  await contexto.addInitScript((dicas) => {
    window.localStorage.setItem('kabemjunto.dicas-vistas', dicas);
  }, DICAS_VISTAS);
  return contexto.newPage();
}

async function jogarAgora(page: Page, nome: string, mesa: number): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Seu apelido').fill(nome);
  await page.getByLabel(String(mesa), { exact: true }).check();
  await page.getByRole('button', { name: 'Jogar agora' }).click();
}

const jogadores = (page: Page) => page.getByRole('list', { name: 'Jogadores' });

test('sozinho, espera a contagem e a mesa é completada com bots', async ({ browser }) => {
  const page = await novaPagina(browser);
  await jogarAgora(page, 'Ana', 3);

  await expect(page.getByRole('heading', { name: 'Mesa pública' })).toBeVisible();
  // A espera é curta demais para um QR com código: o card fica no menu, sem sala.
  await expect(page.getByRole('button', { name: 'Card de desafio' })).toHaveCount(0);
  await expect(page.getByText(/Começa em \d+ s/)).toBeVisible();
  await expect(page.getByText('1 de 3 jogadores')).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Lugares da mesa' }).getByRole('listitem'),
  ).toHaveCount(3);

  await expect(page.locator('.mesa3d canvas')).toBeVisible({ timeout: 15_000 });
  await expect(jogadores(page).getByRole('listitem')).toHaveCount(3);
  await expect(jogadores(page)).toContainText('Bot 1');
  await expect(jogadores(page)).toContainText('Bot 2');
});

test('duas pessoas que pedem mesa de 2 caem na mesma sala e jogam sem bots', async ({
  browser,
}) => {
  const ana = await novaPagina(browser);
  const bia = await novaPagina(browser);
  await jogarAgora(ana, 'Ana', 2);
  await expect(ana.getByRole('heading', { name: 'Mesa pública' })).toBeVisible();
  await jogarAgora(bia, 'Bia', 2);

  for (const pagina of [ana, bia]) {
    await expect(pagina.locator('.mesa3d canvas')).toBeVisible({ timeout: 15_000 });
    await expect(jogadores(pagina)).toContainText('Ana');
    await expect(jogadores(pagina)).toContainText('Bia');
    await expect(jogadores(pagina)).not.toContainText('Bot');
  }
});

test('"Começar agora com bots" antecipa a partida', async ({ browser }) => {
  const page = await novaPagina(browser);
  await jogarAgora(page, 'Caio', 4);
  await page.getByRole('button', { name: 'Começar agora com bots' }).click();

  await expect(page.locator('.mesa3d canvas')).toBeVisible({ timeout: 10_000 });
  await expect(jogadores(page).getByRole('listitem')).toHaveCount(4);
  await expect(jogadores(page)).toContainText('Bot 3');
});

test('cancelar volta ao menu e não deixa a pessoa presa na espera', async ({ browser }) => {
  const page = await novaPagina(browser);
  await jogarAgora(page, 'Duda', 3);
  await expect(page.getByRole('heading', { name: 'Mesa pública' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Como você quer jogar?' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Jogar agora' })).toBeVisible();
  // Passado o prazo, nenhuma partida começa sozinha.
  await page.waitForTimeout(7000);
  await expect(page.locator('.mesa3d canvas')).toHaveCount(0);
});

test('sem resposta do servidor, "Jogar agora" vira partida contra bots no aparelho', async ({
  browser,
}) => {
  const page = await novaPagina(browser);
  await page.context().route('**/socket.io/**', (rota) => rota.abort());
  await jogarAgora(page, 'Eva', 3);

  await expect(page.getByRole('heading', { name: 'Procurando uma mesa…' })).toBeVisible();
  await expect(page.locator('.mesa3d canvas')).toBeVisible({ timeout: 20_000 });
  await expect(jogadores(page).getByRole('listitem')).toHaveCount(3);
  await expect(jogadores(page)).toContainText('Você (Eva)');
});
