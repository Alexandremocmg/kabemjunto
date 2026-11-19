import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { buildServer } from '../apps/server/src/server';

let app: Awaited<ReturnType<typeof buildServer>>['app'];
let url: string;

test.beforeAll(async () => {
  ({ app } = await buildServer(
    {
      nodeEnv: 'test',
      port: 3001,
      host: '127.0.0.1',
      corsOrigins: undefined,
      e2eFixturesEnabled: false,
    },
    resolve('apps/web/dist'),
  ));
  url = await app.listen({ host: '127.0.0.1', port: 0 });
});

test.afterAll(async () => {
  await app?.close();
});

test('manifest e ícones são válidos e o service worker não guarda rotas do servidor', async ({
  request,
}) => {
  const manifest = await request.get(url + '/manifest.json');
  expect(manifest.ok()).toBe(true);
  expect(manifest.headers()['content-type']).toContain('json');
  const { icons, scope, start_url: startUrl, display } = await manifest.json();
  expect({ scope, startUrl, display }).toEqual({
    scope: '/',
    startUrl: '/',
    display: 'standalone',
  });
  for (const icon of icons) {
    const response = await request.get(url + icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
    const body = await response.body();
    const [width, height] = icon.sizes.split('x').map(Number);
    expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([width, height]);
  }

  // O worker é servido sempre novo (senão a atualização do PWA nunca chegaria)
  // e só pré-carrega arquivos públicos do build, nunca rotas do servidor.
  const worker = await request.get(url + '/sw.js');
  expect(worker.ok()).toBe(true);
  expect(worker.headers()['content-type']).toContain('javascript');
  const codigo = await worker.text();
  const lista = JSON.parse(/const PRECACHE = (\[.*\]);/.exec(codigo)![1]!) as string[];
  expect(lista).toContain('./index.html');
  expect(lista.some((arquivo) => arquivo.includes('socket.io') || arquivo === './health')).toBe(
    false,
  );
});

test('instalado, o menu abre offline e a partida contra bots na mesa 3D sobrevive a um recarregamento', async ({
  page,
  context,
}) => {
  await page.goto(url);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  expect(await page.evaluate(async () => (await fetch('/health')).ok)).toBe(true);
  // Perder a rede com o menu aberto: aviso na hora e só o caminho contra bots segue livre.
  await context.setOffline(true);
  await expect(page.getByText('Sem internet: só dá para jogar contra bots')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar sala' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Entrar em sala' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Jogar agora' })).toBeEnabled();

  // Reabrir sem rede: o menu, a logo e as cartas vêm do cache do service worker.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Como você quer jogar?' })).toBeAttached();
  const logo = page.getByRole('img', { name: 'Kabemjunto' });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((imagem: HTMLImageElement) => imagem.naturalWidth)).toBeGreaterThan(0);
  const cartasCarregadas = await page
    .locator('.menu-leque-carta')
    .evaluateAll((imagens) =>
      imagens.every((imagem) => (imagem as HTMLImageElement).naturalWidth > 0),
    );
  expect(cartasCarregadas).toBe(true);

  // As rotas do servidor continuam de fora do cache.
  expect(
    await page.evaluate(() =>
      fetch('/health').then(
        () => true,
        () => false,
      ),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() =>
      fetch('/socket.io/?EIO=4&transport=polling').then(
        () => true,
        () => false,
      ),
    ),
  ).toBe(false);

  // A mesa 3D (inclui o pedaço do Three.js) abre do cache, e a partida é retomada.
  await page.getByRole('button', { name: 'Jogar agora' }).click();
  await expect(page.locator('.mesa3d canvas')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('kabemjunto.estado')))
    .not.toBeNull();
  const salva = await page.evaluate(() => sessionStorage.getItem('kabemjunto.estado'));
  await page.reload();
  await expect(page.locator('.mesa3d canvas')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('kabemjunto.estado'))).toBe(salva);

  // Voltando a rede, o menu libera as salas de novo.
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Sair da partida' }).click();
  await page
    .getByRole('dialog', { name: 'Sair da partida?' })
    .getByRole('button', { name: 'Sair' })
    .click();
  await expect(page.getByRole('button', { name: 'Criar sala' })).toBeEnabled();
});
