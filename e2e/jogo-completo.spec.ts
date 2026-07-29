import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

async function criarSala(page: Page, nome: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByRole('button', { name: 'Criar sala' }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar sala' });
  await dialog.getByRole('button', { name: 'Criar sala privada' }).click();
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

test('sair da partida ativa pede confirmação antes de abandonar', async ({ browser }) => {
  const { host, convidado } = await abrirPartida(browser);

  await host.getByRole('button', { name: 'Sair' }).click();
  const confirmation = host.getByRole('dialog', { name: 'Abandonar partida?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Continuar' }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(host.getByText('SUA MÃO')).toBeVisible();

  await host.getByRole('button', { name: 'Sair' }).click();
  await confirmation.getByRole('button', { name: 'Abandonar' }).click();
  await expect(host.getByRole('heading', { name: 'Entre na mesa' })).toBeVisible();

  await host.context().close();
  await convidado.context().close();
});

test('chat online entrega mensagem com o nome humano do remetente e preserva o histórico no Menu', async ({
  browser,
}) => {
  const { host, convidado } = await abrirPartida(browser);

  const hostMenu = host.getByRole('button', { name: /Menu/ });
  const convidadoMenu = convidado.getByRole('button', { name: /Menu/ });
  await Promise.all([hostMenu.click(), convidadoMenu.click()]);

  const hostDrawer = host.getByRole('dialog', { name: 'Partida' });
  const convidadoDrawer = convidado.getByRole('dialog', { name: 'Partida' });
  const mensagem = 'Mensagem de chat E2E';
  await hostDrawer.getByPlaceholder('Mensagem').fill(mensagem);
  await hostDrawer.getByRole('button', { name: 'Enviar' }).click();

  for (const drawer of [hostDrawer, convidadoDrawer]) {
    await expect(drawer.locator('.chat-messages p')).toHaveText(`Host E2E: ${mensagem}`);
  }

  await hostDrawer.getByRole('button', { name: 'Fechar utilidades' }).click();
  await hostMenu.click();
  await expect(hostDrawer.locator('.chat-messages')).toContainText(`Host E2E: ${mensagem}`);

  await host.context().close();
  await convidado.context().close();
});

test('falas rápidas enviam pelo chat, fecham a bandeja e aparecem como balão no assento do remetente', async ({
  browser,
}) => {
  const { host, convidado } = await abrirPartida(browser);

  const trigger = host.getByRole('button', { name: 'Falas rápidas' });
  await trigger.click();

  const tray = host.getByRole('group', { name: 'Falas rápidas' });
  await expect(tray).toBeVisible();
  await expect(tray.getByRole('button')).toHaveText([
    'Boa jogada!',
    'Sua vez!',
    'Vou comprar.',
    'Calma aí!',
    'Vamos lá!',
    'GG!',
  ]);

  await tray.getByRole('button', { name: 'Boa jogada!' }).click();
  await expect(tray).toHaveCount(0);

  const bubble = convidado.locator('.player-seat', { hasText: 'Host E2E' }).getByRole('status');
  await expect(bubble).toHaveText('Host E2E disse: Boa jogada!');

  await trigger.click();
  await tray.getByRole('button', { name: 'GG!' }).click();
  await expect(bubble).toHaveText('Host E2E disse: GG!');
  await expect(bubble).toHaveCount(0, { timeout: 6500 });

  await convidado.getByRole('button', { name: /Menu/ }).click();
  await expect(convidado.locator('.chat-messages')).toContainText('Host E2E: Boa jogada!');

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

test('lobby lista a projeção pública compartilhada e permite entrar pela sala descoberta', async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/');
  await host.getByLabel('Seu nome').fill('Host público');
  await host.getByRole('button', { name: 'Criar sala' }).click();
  const dialog = host.getByRole('dialog', { name: 'Criar sala' });
  await dialog.getByLabel('Nome da sala').fill('Mesa pública E2E');
  await dialog.getByLabel('Visibilidade').selectOption('publica');
  await dialog.getByRole('button', { name: 'Criar sala pública' }).click();
  await expect(host.getByText('Aguardando o grupo')).toBeVisible();

  await guest.goto('/');
  await guest.getByLabel('Seu nome').fill('Convidado público');
  const room = guest.locator('.public-room-card', { hasText: 'Mesa pública E2E' });
  await expect(room).toContainText('Criada por Host público');
  await expect(room).toContainText('1/10 jogadores');
  await room.getByRole('button', { name: 'Entrar' }).click();
  await expect(guest.getByText('Aguardando o grupo')).toBeVisible();
  await expect(host.getByText('Convidado público')).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test('lobby pede nome antes de exibir salas públicas e cria uma sala privada nomeada por padrão', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Salas públicas' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(page.getByText('Informe seu nome antes de continuar.')).toBeVisible();

  await page.getByLabel('Seu nome').fill('Criador E2E');
  await expect(page.getByRole('heading', { name: 'Salas públicas' })).toBeVisible();
  await page.getByRole('button', { name: 'Criar sala' }).click();

  const dialog = page.getByRole('dialog', { name: 'Criar sala' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Visibilidade')).toHaveValue('privada');
  await dialog.getByLabel('Nome da sala').fill('Mesa da galera');
  await dialog.getByRole('button', { name: 'Criar sala privada' }).click();

  await expect(page.locator('.room-code')).toBeVisible();
});

test('cliente usa o mesmo host da aplicação para o transporte Socket.IO', async ({ page }) => {
  const socketRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/socket.io/')) socketRequests.push(request.url());
  });

  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Proxy E2E');
  await page.getByRole('button', { name: 'Criar sala' }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar sala' });
  await dialog.getByRole('button', { name: 'Criar sala privada' }).click();
  await expect(page.getByText('Aguardando o grupo')).toBeVisible();

  expect(socketRequests.length).toBeGreaterThan(0);
  const socketOrigin = new URL(socketRequests[0]).origin;
  expect([new URL(page.url()).origin, 'http://127.0.0.1:3101']).toContain(socketOrigin);
});

test('mão online mobile rola como leque tocável e balões adversários ficam acima da mesa', async ({
  browser,
}) => {
  const { host, convidado } = await abrirPartida(browser);

  await host.setViewportSize({ width: 390, height: 844 });
  const hand = host.locator('.online-hand-container .hand-cards');
  const cards = hand.locator('.hand-card-slot .card-wrapper');
  await expect(cards).toHaveCount(7);

  const mobileHandGeometry = await hand.evaluate((handElement) => {
    const cards = Array.from(
      handElement.querySelectorAll<HTMLElement>('.hand-card-slot .card-wrapper'),
    );
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const visibleClickablePoint = (card: HTMLElement): { x: number; y: number } | null => {
      const rect = card.getBoundingClientRect();
      for (let y = Math.ceil(rect.top + 8); y < Math.floor(rect.bottom - 8); y += 8) {
        for (let x = Math.ceil(rect.left + 8); x < Math.floor(rect.right - 8); x += 8) {
          if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) continue;
          if (
            document.elementFromPoint(x, y) === card ||
            card.contains(document.elementFromPoint(x, y))
          ) {
            return { x, y };
          }
        }
      }
      return null;
    };

    const sampledCards = [cards[0], cards[Math.floor(cards.length / 2)], cards[cards.length - 1]];
    const slots = cards.map((card) => card.parentElement as HTMLElement);
    const sampled = sampledCards.map((card) => {
      const slot = card.parentElement as HTMLElement;
      handElement.scrollLeft = slot.offsetLeft - (handElement.clientWidth - card.offsetWidth) / 2;
      return { point: visibleClickablePoint(card), scrollLeft: handElement.scrollLeft };
    });
    const firstTransform = getComputedStyle(slots[0]).transform;
    const lastTransform = getComputedStyle(slots[slots.length - 1]).transform;
    const firstRect = slots[0].getBoundingClientRect();
    const secondRect = slots[1].getBoundingClientRect();
    return {
      clientWidth: handElement.clientWidth,
      scrollWidth: handElement.scrollWidth,
      sampled,
      firstTransform,
      lastTransform,
      adjacentOverlap: firstRect.right - secondRect.left,
    };
  });
  expect(
    mobileHandGeometry.scrollWidth,
    'mobile hand must be horizontally scrollable',
  ).toBeGreaterThan(mobileHandGeometry.clientWidth);
  expect(
    [mobileHandGeometry.firstTransform, mobileHandGeometry.lastTransform],
    'mobile fan keeps its cards rotated rather than flattening into a straight strip',
  ).not.toEqual(['none', 'none']);
  expect(
    mobileHandGeometry.adjacentOverlap,
    'mobile fan has controlled negative overlap between adjacent cards',
  ).toBeGreaterThan(0);
  expect(
    mobileHandGeometry.sampled.map(({ point }) => point),
    'first, middle, and last card need their own touch target after horizontal scrolling',
  ).toEqual([expect.anything(), expect.anything(), expect.anything()]);
  expect(
    mobileHandGeometry.sampled.at(-1)?.scrollLeft,
    'last card must be reachable by scrolling',
  ).toBeGreaterThan(0);

  await host.getByRole('button', { name: 'Falas rápidas' }).click();
  await host.getByRole('button', { name: 'Boa jogada!' }).click();
  const localBubble = host.locator('.local-speech-lane .chat-speech-bubble');
  const remoteBubble = convidado.locator('.player-seat .chat-speech-bubble');
  await expect(localBubble).toBeVisible();
  await expect(remoteBubble).toBeVisible();

  for (const page of [host, convidado]) {
    for (const { width, height } of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize({ width, height });
      const bubble = page === host ? localBubble : remoteBubble;
      const bubbleBox = await bubble.boundingBox();
      const turnBox = await page.locator('.turn-summary').boundingBox();
      const handStatusBox = await page.locator('.online-hand-container .hand-status').boundingBox();
      const centerBox = await page.locator('.table-center').boundingBox();
      expect(bubbleBox, `${width}x${height}: speech bubble not found`).not.toBeNull();
      expect(turnBox, `${width}x${height}: turn summary not found`).not.toBeNull();
      expect(handStatusBox, `${width}x${height}: hand status not found`).not.toBeNull();
      expect(centerBox, `${width}x${height}: table center not found`).not.toBeNull();
      expect(
        rectsIntersect(bubbleBox!, turnBox!),
        `${width}x${height}: speech bubble intersects turn summary`,
      ).toBe(false);
      expect(
        rectsIntersect(bubbleBox!, handStatusBox!),
        `${width}x${height}: speech bubble intersects hand status`,
      ).toBe(false);
      if (page === convidado) {
        const remoteBubbleIsTopmost = await bubble.evaluate((bubbleElement) => {
          const bubble = bubbleElement as HTMLElement;
          const rect = bubble.getBoundingClientRect();
          for (let y = Math.ceil(rect.top + 4); y < Math.floor(rect.bottom - 4); y += 6) {
            for (let x = Math.ceil(rect.left + 4); x < Math.floor(rect.right - 4); x += 6) {
              const target = document.elementFromPoint(x, y);
              if (target !== null && bubble.contains(target)) return true;
            }
          }
          return false;
        });
        expect(
          remoteBubbleIsTopmost,
          `${width}x${height}: adversary speech bubble is painted beneath the table or dock`,
        ).toBe(true);
        expect(
          rectsIntersect(bubbleBox!, centerBox!),
          `${width}x${height}: remote speech bubble intersects table center`,
        ).toBe(false);
      }
    }
  }

  await host.context().close();
  await convidado.context().close();
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
