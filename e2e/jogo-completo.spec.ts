import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

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
  await page.getByLabel('Código da sala').fill(salaId);
  await page.getByRole('button', { name: 'Entrar em sala' }).click();
  await expect(page.locator('.room-code')).toHaveText(salaId);
}

interface OnlineVictoryFixture {
  salaId: string;
  vencedorId: string;
  vencedorCardId: string;
  vencedorCardLabel: string;
  oponenteCardLabels: [string, string];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function aplicarFixtureVitoriaDeterministica(
  request: APIRequestContext,
  salaId: string,
): Promise<OnlineVictoryFixture> {
  const response = await request.post(
    'http://127.0.0.1:3101/__e2e/fixture/online-vitoria-deterministica',
    {
      data: { salaId },
    },
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as OnlineVictoryFixture;
}

async function abrirPartida(
  browser: Browser,
): Promise<{ host: Page; convidado: Page; salaId: string }> {
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
  return { host, convidado, salaId };
}

test('dois clientes entram na mesma sala e iniciam uma partida', async ({ browser }) => {
  const { host, convidado } = await abrirPartida(browser);

  await expect(host.locator('.online-table-area').getByText('Host E2E')).toBeVisible();
  await expect(convidado.locator('.online-table-area').getByText('Convidado E2E')).toBeVisible();

  await host.context().close();
  await convidado.context().close();
});

test('partida online termina deterministicamente com mesmo vencedor e sem vazamento de mão privada', async ({
  browser,
  request,
}) => {
  const { host, convidado, salaId } = await abrirPartida(browser);

  const fixture = await aplicarFixtureVitoriaDeterministica(request, salaId);
  await expect(host.locator('.online-hand-container .hand-status span')).toContainText('1 cartas');
  await expect(convidado.locator('.online-hand-container .hand-status span')).toContainText(
    '2 cartas',
  );

  for (const oponenteCardLabel of fixture.oponenteCardLabels) {
    await expect(host.getByRole('button', { name: oponenteCardLabel, exact: true })).toHaveCount(0);
  }

  const cartaVencedora = host.getByRole('button', {
    name: fixture.vencedorCardLabel,
    exact: true,
  });
  await expect(cartaVencedora).toBeVisible();
  await cartaVencedora.click();
  await cartaVencedora.click();

  await expect(host.getByRole('heading', { name: 'Você Venceu!' })).toBeVisible();
  await expect(
    convidado.getByRole('heading', { name: new RegExp(`^${escapeRegExp('Host E2E')} Venceu!$`) }),
  ).toBeVisible();

  await expect(
    convidado.getByRole('button', { name: fixture.vencedorCardLabel, exact: true }),
  ).toHaveCount(0);

  await host.context().close();
  await convidado.context().close();
});

test('mesa local distribui dez jogadores em ordem circular sem overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '🏠 Local' }).click();
  await page.getByRole('slider', { name: 'Quantidade de jogadores' }).fill('10');
  await page.getByRole('button', { name: 'INICIAR PARTIDA CONFIGURADA' }).click();

  const assentos = page.locator('.player-table-ring .player-seat');
  await expect(assentos).toHaveCount(10);
  await expect(page.locator('.player-seat-you')).toBeVisible();
  await expect(page.locator('.hand-container')).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);

  const indices = await assentos.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-seat-index')),
  );
  expect(indices).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
});

test('cliente recarrega e recupera a sessao da partida', async ({ browser }) => {
  const { host, convidado } = await abrirPartida(browser);

  await convidado.reload();
  await expect(convidado.locator('.connection')).toContainText('Online');
  await expect(convidado.getByText('SUA MÃO')).toBeVisible();
  await expect(host.locator('.online-table-area').getByText('Convidado E2E')).toBeVisible();

  await host.context().close();
  await convidado.context().close();
});

test('entrada em sala inexistente mostra estado de sala não encontrada', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Jogador inválido');
  await page.getByLabel('Código da sala').fill('NAOEXI');
  await page.getByRole('button', { name: 'Entrar em sala' }).click();

  await expect(page.getByText('Sala não encontrada.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar ao Lobby' })).toBeVisible();
});

test('cliente usa o mesmo host da aplicação para o transporte Socket.IO', async ({ page }) => {
  const socketRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/socket.io/')) socketRequests.push(request.url());
  });

  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Proxy E2E');
  await page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(page.getByText('Aguardando o grupo')).toBeVisible();

  expect(socketRequests.length).toBeGreaterThan(0);
  const socketOrigin = new URL(socketRequests[0]).origin;
  expect([new URL(page.url()).origin, 'http://127.0.0.1:3101']).toContain(socketOrigin);
});

test('layout online fullscreen nao tem overflow nem colisoes entre assentos, barra de status, resumo de turno e mao online', async ({
  browser,
}) => {
  const { host, convidado } = await abrirPartida(browser);

  const menuTrigger = host.getByRole('button', { name: /Menu/ });
  await menuTrigger.click();
  const drawer = host.getByRole('dialog', { name: 'Partida' });
  const closeButton = drawer.getByRole('button', { name: 'Fechar utilidades' });
  await expect(drawer).toBeVisible();
  await expect(closeButton).toBeFocused();
  await host.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('button', { name: 'Enviar' })).toBeFocused();
  await host.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await host.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(menuTrigger).toBeFocused();

  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await host.setViewportSize({ width, height });

    // No horizontal scroll
    await expect.poll(() => host.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect
      .poll(() => host.evaluate(() => document.documentElement.scrollHeight))
      .toBeLessThanOrEqual(height + 1);

    // Game area visible and fills the viewport (no persistent sidebar stealing width)
    const gameArea = host.locator('.online-table-area');
    await expect(gameArea).toBeVisible();
    const gameBox = await gameArea.boundingBox();
    expect(gameBox, `${width}x${height}: .online-table-area not in DOM`).not.toBeNull();
    expect(
      gameBox!.width,
      `${width}x${height}: sidebar visible — game area too narrow`,
    ).toBeGreaterThan(width * 0.85);

    const statusBox = await host.locator('.table-status-bar').boundingBox();
    const handBox = await host.locator('.online-hand-container').boundingBox();
    const turnBox = await host.locator('.turn-summary').boundingBox();
    const centerBox = await host.locator('.table-center').boundingBox();

    expect(statusBox, `${width}x${height}: .table-status-bar not found`).not.toBeNull();
    expect(handBox, `${width}x${height}: .online-hand-container not found`).not.toBeNull();
    expect(centerBox, `${width}x${height}: .table-center not found`).not.toBeNull();

    expect(
      rectsIntersect(statusBox!, handBox!),
      `${width}x${height}: .table-status-bar intersects .online-hand-container`,
    ).toBe(false);

    if (turnBox !== null) {
      expect(
        rectsIntersect(turnBox, handBox!),
        `${width}x${height}: .turn-summary intersects .online-hand-container`,
      ).toBe(false);
      expect(
        rectsIntersect(turnBox, statusBox!),
        `${width}x${height}: .turn-summary intersects .table-status-bar`,
      ).toBe(false);
      const pileLabels = host.locator('.online-table-area .pile-label');
      for (let i = 0; i < (await pileLabels.count()); i++) {
        const labelBox = await pileLabels.nth(i).boundingBox();
        if (labelBox === null) continue;
        expect(
          rectsIntersect(labelBox, turnBox),
          `${width}x${height}: .pile-label[${i}] intersects .turn-summary`,
        ).toBe(false);
      }
    }

    const seats = host.locator('.online-table-area .player-seat');
    const seatCount = await seats.count();
    for (let i = 0; i < seatCount; i++) {
      const seatBox = await seats.nth(i).boundingBox();
      if (seatBox === null) continue;
      expect(
        rectsIntersect(seatBox, handBox!),
        `${width}x${height}: .player-seat[${i}] intersects .online-hand-container`,
      ).toBe(false);
      expect(
        rectsIntersect(seatBox, statusBox!),
        `${width}x${height}: .player-seat[${i}] intersects .table-status-bar`,
      ).toBe(false);
      expect(
        rectsIntersect(seatBox, centerBox!),
        `${width}x${height}: .player-seat[${i}] intersects .table-center`,
      ).toBe(false);
    }
  }

  await host.context().close();
  await convidado.context().close();
});
