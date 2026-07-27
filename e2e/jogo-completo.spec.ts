import { expect, test, type Browser, type Page } from '@playwright/test';

async function criarSala(page: Page, nome: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(page.locator('.room-code')).toBeVisible();
  return (await page.locator('.room-code').textContent()) ?? '';
}

async function entrarNaSala(page: Page, nome: string, salaId: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByLabel(/Codigo da sala/i).fill(salaId);
  await page.getByRole('button', { name: 'Entrar em sala' }).click();
  await expect(page.locator('.room-code')).toHaveText(salaId);
}

async function abrirPartida(browser: Browser): Promise<{ host: Page; convidado: Page }> {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const convidado = await guestContext.newPage();
  const salaId = await criarSala(host, 'Host E2E');
  await entrarNaSala(convidado, 'Convidado E2E', salaId);
  await expect(host.getByRole('button', { name: 'Iniciar partida' })).toBeEnabled();
  await host.getByRole('button', { name: 'Iniciar partida' }).click();
  await expect(host.getByText('SUA MÃO')).toBeVisible();
  await expect(convidado.getByText('SUA MÃO')).toBeVisible();
  return { host, convidado };
}

test('dois clientes entram na mesma sala e iniciam uma partida', async ({ browser }) => {
  const { host, convidado } = await abrirPartida(browser);

  await expect(host.getByText('Host E2E')).toBeVisible();
  await expect(convidado.getByText('Convidado E2E')).toBeVisible();

  await host.context().close();
  await convidado.context().close();
});

test('cliente recarrega e recupera a sessao da partida', async ({ browser }) => {
  const { host, convidado } = await abrirPartida(browser);

  await convidado.reload();
  await expect(convidado.locator('.connection')).toContainText('Online');
  await expect(convidado.getByText('SUA MÃO')).toBeVisible();
  await expect(host.getByText('Convidado E2E')).toBeVisible();

  await host.context().close();
  await convidado.context().close();
});
