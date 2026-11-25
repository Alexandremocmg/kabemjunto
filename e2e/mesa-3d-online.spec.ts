/**
 * Mesa 3D no modo online: dois navegadores reais contra o servidor de teste.
 *
 * O servidor continua sendo a autoridade; aqui verificamos que a mesa 3D só
 * envia intenções e que os dois clientes convergem para o mesmo estado. As
 * fixtures `/__e2e/...` do servidor montam situações determinísticas
 * (vitória e Corta-Frente) com cartas reais do baralho.
 */
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
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
const SERVIDOR = 'http://127.0.0.1:3101';

/**
 * Cada jogador abre um contexto WebGL. O Chromium limita quantos ficam vivos ao
 * mesmo tempo; sem fechar, a partir do terceiro cenário a mesa caía (de
 * propósito) no aviso de "mesa 3D indisponível".
 */
const contextosAbertos: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contextosAbertos.splice(0).map((contexto) => contexto.close()));
});

async function novoJogador(browser: Browser): Promise<Page> {
  const contexto = await browser.newContext({ viewport: { width: 900, height: 760 } });
  contextosAbertos.push(contexto);
  await contexto.addInitScript((dicas) => {
    window.localStorage.removeItem('kabemjunto.mesa');
    window.localStorage.setItem('kabemjunto.dicas-vistas', dicas);
  }, DICAS_VISTAS);
  return contexto.newPage();
}

async function abrirPartida(
  browser: Browser,
): Promise<{ host: Page; convidado: Page; salaId: string }> {
  const host = await novoJogador(browser);
  const convidado = await novoJogador(browser);

  await host.goto('/');
  await host.getByLabel('Seu apelido').fill('Host 3D');
  await host.getByRole('button', { name: 'Criar sala' }).click();
  await host
    .getByRole('dialog', { name: 'Criar sala' })
    .getByRole('button', { name: 'Criar sala privada' })
    .click();
  await expect(host.locator('.room-code')).toBeVisible();
  const salaId = (await host.locator('.room-code').textContent()) ?? '';

  await convidado.goto('/');
  await convidado.getByLabel('Seu apelido').fill('Convidado 3D');
  await convidado.getByLabel('Código da sala').fill(salaId);
  await convidado.getByRole('button', { name: 'Entrar em sala' }).click();
  await expect(convidado.locator('.room-code')).toHaveText(salaId);

  await host.getByRole('button', { name: 'Iniciar partida' }).click();
  for (const pagina of [host, convidado]) {
    await expect(pagina.locator('.mesa3d canvas')).toBeVisible();
  }
  return { host, convidado, salaId };
}

async function jogadorIdDa(pagina: Page): Promise<string> {
  return pagina.evaluate(() => {
    const sessao = JSON.parse(
      window.sessionStorage.getItem('kabemjunto-online-session') ?? '{}',
    ) as {
      jogadorId?: string;
    };
    return sessao.jogadorId ?? '';
  });
}

async function aplicarFixture<T>(
  request: APIRequestContext,
  nome: string,
  salaId: string,
): Promise<T> {
  const resposta = await request.post(`${SERVIDOR}/__e2e/fixture/${nome}`, { data: { salaId } });
  expect(resposta.ok()).toBeTruthy();
  return (await resposta.json()) as T;
}

async function esperarCartasParadas(pagina: Page): Promise<void> {
  await expect
    .poll(
      () =>
        pagina.evaluate(() => {
          const mesa = (window as unknown as Record<string, unknown>)['__kabemjuntoMesa'] as
            { estatisticas: () => { movimentos: string[] } } | undefined;
          return mesa ? mesa.estatisticas().movimentos : ['cena ainda não montada'];
        }),
      { message: 'cartas que continuam se movendo', timeout: 15_000 },
    )
    .toEqual([]);
  await expect
    .poll(
      () =>
        pagina.evaluate(() => {
          const mesa = (window as unknown as Record<string, unknown>)['__kabemjuntoMesa'] as
            { estatisticas: () => { cartasAnimando: boolean } } | undefined;
          return mesa ? mesa.estatisticas().cartasAnimando : true;
        }),
      { timeout: 15_000 },
    )
    .toBe(false);
}

async function arrastarAoCentro(pagina: Page, cartaId: string): Promise<void> {
  await expect(pagina.locator(`.mesa3d-mao [data-card-id="${cartaId}"]`)).toBeAttached();
  await esperarCartasParadas(pagina);
  const de = await pagina.evaluate((id) => {
    const botoes = [...document.querySelectorAll<HTMLElement>('.mesa3d-mao button')];
    const indice = botoes.findIndex((botao) => botao.dataset.cardId === id);
    const caixa = botoes[indice]!.getBoundingClientRect();
    const proxima = botoes[indice + 1]?.getBoundingClientRect();
    const direita = proxima && proxima.x > caixa.x ? Math.min(caixa.right, proxima.x) : caixa.right;
    return { x: (caixa.x + direita) / 2, y: caixa.y + caixa.height * 0.3 };
  }, cartaId);
  const alvo = await pagina.locator('.mesa3d-marcador-descarte').boundingBox();
  if (!alvo) throw new Error('descarte sem posição');
  const para = { x: alvo.x + alvo.width / 2, y: alvo.y + alvo.height / 2 };
  await pagina.mouse.move(de.x, de.y);
  await pagina.mouse.down();
  await pagina.mouse.move(para.x, para.y, { steps: 14 });
  await pagina.mouse.up();
}

test('vitória online: a jogada é do servidor, os dois veem o mesmo vencedor e a mão alheia não vaza', async ({
  browser,
  request,
}) => {
  const { host, convidado, salaId } = await abrirPartida(browser);
  const fixture = await aplicarFixture<{
    vencedorId: string;
    vencedorCardId: string;
  }>(request, 'online-vitoria-deterministica', salaId);
  const vencedor = (await jogadorIdDa(host)) === fixture.vencedorId ? host : convidado;
  const outro = vencedor === host ? convidado : host;
  const nomeVencedor = vencedor === host ? 'Host 3D' : 'Convidado 3D';

  await expect(vencedor.locator('.mesa3d')).toHaveAttribute('data-mao', '1');
  // A mão de um jogador nunca chega ao navegador do outro.
  await expect(outro.locator(`[data-card-id="${fixture.vencedorCardId}"]`)).toHaveCount(0);

  await arrastarAoCentro(vencedor, fixture.vencedorCardId);

  await expect(vencedor.getByRole('heading', { name: 'Você Venceu!' })).toBeVisible();
  await expect(outro.getByRole('heading', { name: `${nomeVencedor} Venceu!` })).toBeVisible();
  for (const pagina of [host, convidado]) {
    await expect(pagina.locator('.mesa3d')).toHaveAttribute('data-topo-id', fixture.vencedorCardId);
  }
});

test('Corta-Frente online: quem tem a carta idêntica corta a frente e os dois convergem', async ({
  browser,
  request,
}) => {
  const { host, convidado, salaId } = await abrirPartida(browser);
  const fixture = await aplicarFixture<{
    origemId: string;
    cartaOrigemId: string;
    cartaInterceptadoraId: string;
  }>(request, 'online-corta-frente-deterministica', salaId);
  const origem = (await jogadorIdDa(host)) === fixture.origemId ? host : convidado;
  const interceptador = origem === host ? convidado : host;

  await arrastarAoCentro(origem, fixture.cartaOrigemId);

  const banner = interceptador.getByRole('alert').filter({ hasText: 'Corta-Frente!' });
  await expect(banner).toBeVisible();
  await expect(origem.getByRole('alert').filter({ hasText: 'Corta-Frente!' })).toHaveCount(0);
  await banner.getByRole('button', { name: /^Cortar com/ }).click();

  for (const pagina of [host, convidado]) {
    await expect(pagina.locator('.mesa3d')).toHaveAttribute(
      'data-topo-id',
      fixture.cartaInterceptadoraId,
    );
  }
  await expect(
    interceptador.locator(`[data-card-id="${fixture.cartaInterceptadoraId}"]`),
  ).toHaveCount(0);
});

test('recarregar a página volta para a mesma partida, com a mesma mão', async ({ browser }) => {
  const { host, convidado } = await abrirPartida(browser);
  const maoAntes = await convidado.locator('.mesa3d').getAttribute('data-mao');
  const topoAntes = await convidado.locator('.mesa3d').getAttribute('data-topo-id');

  await convidado.reload();

  await expect(convidado.locator('.mesa3d canvas')).toBeVisible();
  await expect(convidado.locator('.mesa3d')).toHaveAttribute('data-mao', maoAntes ?? '');
  await expect(convidado.locator('.mesa3d')).toHaveAttribute('data-topo-id', topoAntes ?? '');
  await expect(host.locator('.mesa3d')).toHaveAttribute('data-topo-id', topoAntes ?? '');
});

test('falas rápidas viram balão no assento de quem falou e ficam no chat do menu', async ({
  browser,
}) => {
  const { host, convidado } = await abrirPartida(browser);

  await host.getByRole('button', { name: 'Falas rápidas' }).click();
  await host
    .getByRole('group', { name: 'Falas rápidas' })
    .getByRole('button', { name: 'GG!' })
    .click();
  await expect(host.getByRole('group', { name: 'Falas rápidas' })).toHaveCount(0);

  const balao = convidado.locator('.mesa3d-balao');
  await expect(balao).toContainText('GG!');
  await expect(balao).toContainText('Host 3D disse');
  await convidado.screenshot({ path: 'tmp/mesa3d-online-balao.png' });

  await convidado.getByRole('button', { name: /Menu da partida/ }).click();
  const menu = convidado.getByRole('dialog', { name: 'Partida' });
  await expect(menu.locator('.chat-messages')).toContainText('Host 3D: GG!');
  await expect(menu.getByRole('heading', { name: /^Sala / })).toBeVisible();
  // Contagem real de cartas durante a partida (não a da sala de espera).
  await expect(menu.locator('.player-list')).not.toContainText('0 cartas');
});

test('sair no meio da partida volta ao menu, e um bot joga no lugar para quem ficou', async ({
  browser,
}) => {
  const { host, convidado } = await abrirPartida(browser);

  await convidado.getByRole('button', { name: 'Sair da partida' }).click();
  const confirmacao = convidado.getByRole('dialog', { name: 'Sair da partida?' });
  await expect(confirmacao).toContainText('Um bot assume o seu lugar');
  await expect(confirmacao).toContainText('não poderá voltar');
  await confirmacao.getByRole('button', { name: 'Sair' }).click();
  await expect(convidado.getByRole('heading', { name: 'Como você quer jogar?' })).toBeVisible();

  // A partida continua para quem ficou.
  await expect(host.getByRole('list', { name: 'Jogadores' })).toContainText('saiu · bot joga');
  await expect(host.getByRole('dialog')).toHaveCount(0);
  await expect(host.locator('.mesa3d canvas')).toBeVisible();
  await host.getByRole('button', { name: /Menu da partida/ }).click();
  await expect(host.getByRole('dialog', { name: 'Partida' })).toContainText('saiu · bot joga');
});
