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

test('build instalável abre e restaura o modo Local offline sem cachear rotas do servidor', async ({
  page,
  context,
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

  await page.goto(url);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  expect(await page.evaluate(async () => (await fetch('/health')).ok)).toBe(true);
  await context.setOffline(true);

  await page.reload();
  await page
    .getByRole('button', { name: /local$/i, exact: false })
    .first()
    .click();
  await expect(page.getByRole('button', { name: /jogar agora/i })).toBeVisible();
  expect(
    await page
      .locator('.local-brand-logo')
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
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

  await page.getByRole('button', { name: /criar mesa local/i }).click();
  await expect(page.locator('.game-layout')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('kabemjunto.estado')))
    .not.toBeNull();
  const saved = await page.evaluate(() => sessionStorage.getItem('kabemjunto.estado'));
  await page.reload();
  await expect(page.locator('.game-layout')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('kabemjunto.estado'))).toBe(saved);
});
