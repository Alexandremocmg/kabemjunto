/**
 * Fluxo completo do app: menu, salas online, partida e chat.
 *
 * A mesa de jogo (3D, com a 2D simples como alternativa sem WebGL) tem cenários
 * de jogada próprios em e2e/mesa-3d.spec.ts e e2e/mesa-3d-online.spec.ts; aqui
 * ficam o caminho até a mesa e o que gira em volta dela (sala, chat, falas,
 * saída, layout).
 */
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript((dicas) => {
    window.localStorage.setItem('kabemjunto.dicas-vistas', dicas);
  }, DICAS_VISTAS);
});

async function novaPagina(browser: Browser, opcoes: BrowserContextOptions = {}): Promise<Page> {
  const contexto = await browser.newContext(opcoes);
  contextosAbertos.push(contexto);
  await contexto.addInitScript((dicas) => {
    window.localStorage.setItem('kabemjunto.dicas-vistas', dicas);
  }, DICAS_VISTAS);
  return contexto.newPage();
}

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
  opcoes: BrowserContextOptions = {},
): Promise<{ host: Page; convidado: Page; salaId: string }> {
  const host = await novaPagina(browser, opcoes);
  const convidado = await novaPagina(browser, opcoes);
  const salaId = await criarSala(host, 'Host E2E');
  await entrarNaSala(convidado, 'Convidado E2E', salaId);
  await expect(host.getByRole('button', { name: 'Iniciar partida' })).toBeEnabled();
  await host.getByRole('button', { name: 'Iniciar partida' }).click();
  await expect(host.locator('.mesa3d canvas')).toBeVisible();
  await expect(convidado.locator('.mesa3d canvas')).toBeVisible();
  return { host, convidado, salaId };
}

const jogadores = (page: Page) => page.getByRole('list', { name: 'Jogadores' });

test('dois clientes entram na mesma sala e iniciam uma partida', async ({ browser }) => {
  const { host, convidado } = await abrirPartida(browser);

  for (const pagina of [host, convidado]) {
    await expect(jogadores(pagina)).toContainText('Host E2E');
    await expect(jogadores(pagina)).toContainText('Convidado E2E');
    await expect(pagina.locator('.mesa3d')).toHaveAttribute('data-mao', '7');
  }
});

test('sair da partida ativa pede confirmação antes de abandonar', async ({ browser }) => {
  const { host } = await abrirPartida(browser);

  await host.getByRole('button', { name: 'Sair da partida' }).click();
  const confirmacao = host.getByRole('dialog', { name: 'Sair da partida?' });
  await expect(confirmacao).toBeVisible();
  await confirmacao.getByRole('button', { name: 'Continuar jogando' }).click();
  await expect(confirmacao).toHaveCount(0);
  await expect(host.locator('.mesa3d')).toBeVisible();

  await host.getByRole('button', { name: 'Sair da partida' }).click();
  await confirmacao.getByRole('button', { name: 'Sair' }).click();
  await expect(host.getByRole('heading', { name: 'Entre na mesa' })).toBeVisible();
});

test('chat online entrega mensagem com o nome humano do remetente e preserva o histórico no Menu', async ({
  browser,
}) => {
  const { host, convidado } = await abrirPartida(browser);

  const hostMenu = host.getByRole('button', { name: /Menu da partida/ });
  const convidadoMenu = convidado.getByRole('button', { name: /Menu da partida/ });
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

  const bubble = convidado.locator('.mesa3d-balao');
  await expect(bubble).toHaveText('Host E2E disse: Boa jogada!');

  await trigger.click();
  await tray.getByRole('button', { name: 'GG!' }).click();
  await expect(bubble).toHaveText('Host E2E disse: GG!');
  await expect(bubble).toHaveCount(0, { timeout: 6500 });

  await convidado.getByRole('button', { name: /Menu da partida/ }).click();
  await expect(convidado.locator('.chat-messages')).toContainText('Host E2E: Boa jogada!');
});

test('mesa local distribui dez jogadores em ordem de turno sem overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Ana');
  await page.getByLabel('Jogadores na mesa').selectOption('10');
  await page.getByRole('button', { name: 'Começar contra bots' }).click();

  await expect(page.locator('.mesa3d canvas')).toBeVisible();
  const itens = jogadores(page).getByRole('listitem');
  await expect(itens).toHaveCount(10);
  await expect(itens.first()).toContainText('Você (Ana)');
  for (let i = 1; i < 10; i += 1) await expect(itens.nth(i)).toContainText(`Bot ${i}`);
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
});

test('mobile 390x844 online — carta única via toque duplo e geometria sem overflow', async ({
  browser,
  request,
}) => {
  const opcoes = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  const { host, salaId } = await abrirPartida(browser, opcoes);
  const fixture = await aplicarFixtureVitoriaDeterministica(request, salaId);

  await expect.poll(() => host.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const carta = host.locator(`.mesa3d-mao [data-card-id="${fixture.vencedorCardId}"]`);
  await expect(carta).toBeAttached();
  await expect
    .poll(() =>
      host.evaluate(() => {
        const mesa = (window as unknown as Record<string, unknown>)['__kabemjuntoMesa'] as
          { estatisticas: () => { cartasAnimando: boolean } } | undefined;
        return mesa ? mesa.estatisticas().cartasAnimando : true;
      }),
    )
    .toBe(false);
  const caixa = await carta.boundingBox();
  expect(caixa, 'carta da mão sem posição projetada').not.toBeNull();
  expect(caixa!.x).toBeGreaterThanOrEqual(0);
  expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(390);

  // Primeiro toque seleciona; o segundo, na mesma carta, joga.
  const ponto = { x: caixa!.x + caixa!.width / 2, y: caixa!.y + caixa!.height * 0.3 };
  await host.touchscreen.tap(ponto.x, ponto.y);
  await expect(carta).toHaveAttribute('aria-pressed', 'true');
  await host.touchscreen.tap(ponto.x, ponto.y);

  await expect(host.getByRole('heading', { name: 'Você Venceu!' })).toBeVisible();
});

test('layout online: menu da partida prende o foco e a mesa não tem overflow nem colisões', async ({
  browser,
}) => {
  const { host } = await abrirPartida(browser);

  const menuTrigger = host.getByRole('button', { name: /Menu da partida/ });
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
    await expect.poll(() => host.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect
      .poll(() => host.evaluate(() => document.documentElement.scrollHeight))
      .toBeLessThanOrEqual(height + 1);

    const hud = await host.locator('.mesa3d-hud').boundingBox();
    const descarte = await host.locator('.mesa3d-marcador-descarte').boundingBox();
    expect(hud, `${width}x${height}: HUD`).not.toBeNull();
    expect(descarte, `${width}x${height}: descarte`).not.toBeNull();
    const cartas = await host.locator('.mesa3d-mao button').evaluateAll((botoes) =>
      botoes.map((botao) => {
        const r = botao.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    expect(cartas.length).toBe(7);
    for (const [indice, carta] of cartas.entries()) {
      expect(
        carta.x,
        `${width}x${height}: carta ${indice} sai pela esquerda`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        carta.x + carta.width,
        `${width}x${height}: carta ${indice} sai pela direita`,
      ).toBeLessThanOrEqual(width);
      expect(rectsIntersect(carta, hud!), `${width}x${height}: carta ${indice} sob o HUD`).toBe(
        false,
      );
      expect(
        rectsIntersect(carta, descarte!),
        `${width}x${height}: carta ${indice} sobre o descarte`,
      ).toBe(false);
    }
  }
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
  const host = await novaPagina(browser);
  const guest = await novaPagina(browser);

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
