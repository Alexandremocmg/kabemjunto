/**
 * Mesa 3D (modo local contra bots).
 *
 * Os gestos são reais: o ponteiro aperta na parte VISÍVEL da carta no canvas
 * (a camada acessível dá a posição projetada) e arrasta até o descarte. Cada
 * cenário parte de uma partida montada (fixture) salva na sessionStorage, o
 * mesmo caminho que a mesa usa para retomar uma partida após recarregar.
 */
import { expect, test, type Page } from '@playwright/test';
import type { Carta, EstadoPartida, Jogador } from '@kabemjunto/shared';

const EU = 'p_eu';
const BOT = 'p_bot';

function numerada(id: string, cor: Exclude<Carta['cor'], 'NEUTRO'>, valor: number): Carta {
  return {
    id,
    tipo: 'NUMERADA',
    cor,
    valor,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: `${valor}`,
    efeito_texto_longo: `Carta ${valor}`,
  };
}

const CORINGA: Carta = {
  id: 'coringa-eu',
  tipo: 'NEUTRA',
  cor: 'NEUTRO',
  acao: 'CORINGA_SIMPLES',
  raridade: 'INCOMUM',
  colecao: 'base-v1',
  efeito_texto_curto: 'Coringa Simples',
  efeito_texto_longo: 'Altera a cor ativa do jogo.',
};

function jogador(id: string, nome: string, mao: Carta[], isBot: boolean): Jogador {
  return {
    id,
    nome,
    mao,
    isBot,
    conectado: true,
    disseUno: false,
    avatar: isBot ? '🤖' : '🦊',
    pontos: 0,
  };
}

/** Partida de 2: eu contra um bot que não tem jogada contra azul (e o monte também não). */
function partida(maoEu: Carta[], extra: Partial<EstadoPartida> = {}): EstadoPartida {
  return {
    partidaId: 'partida-mesa-3d',
    salaId: 'local',
    jogadores: [
      jogador(EU, 'Você', maoEu, false),
      jogador(
        BOT,
        'Bot 1',
        [numerada('oito-verde-bot', 'VERDE', 8), numerada('seis-verde-bot', 'VERDE', 6)],
        true,
      ),
    ],
    monteCompra: [
      numerada('compra-laranja', 'LARANJA', 3),
      numerada('compra-laranja-2', 'LARANJA', 2),
    ],
    monteDescarte: [numerada('topo-azul', 'AZUL', 4)],
    vezDe: EU,
    sentido: 1,
    corAtiva: 'AZUL',
    ataqueAcumulado: 0,
    ataqueStack: [],
    silencio: { ativo: false, jogadoresQuebraram: [] },
    historico: [],
    finalizada: false,
    ...extra,
  };
}

const TODAS_AS_DICAS = JSON.stringify([
  'silencio',
  'ataque',
  'arrastar',
  'grupo',
  'zero-mais',
  'monte',
]);

async function abrirMesa(
  page: Page,
  estado: EstadoPartida,
  { comDicas = false }: { comDicas?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    ([dicas]) => {
      // As dicas contextuais têm cenário próprio; nos demais, já foram vistas.
      // Só na primeira carga: recarregar deve manter o que a pessoa já viu.
      if (window.sessionStorage.getItem('e2e.dicas')) return;
      window.sessionStorage.setItem('e2e.dicas', '1');
      if (dicas) window.localStorage.setItem('kabemjunto.dicas-vistas', dicas);
      else window.localStorage.removeItem('kabemjunto.dicas-vistas');
    },
    [comDicas ? '' : TODAS_AS_DICAS],
  );
  await page.addInitScript((salvo) => {
    // Só na primeira carga: recarregar deve retomar a partida, não reiniciá-la.
    if (window.sessionStorage.getItem('e2e.semeado')) return;
    window.sessionStorage.setItem('e2e.semeado', '1');
    window.sessionStorage.setItem('kabemjunto.modo', 'local');
    window.sessionStorage.setItem('kabemjunto.estado', salvo);
    window.localStorage.removeItem('kabemjunto.mesa');
  }, JSON.stringify(estado));
  await page.goto('/');
  await expect(page.locator('.mesa3d canvas')).toBeVisible();
  await esperarCartasParadas(page);
}

async function abrirMesaSemEsperarCena(page: Page, estado: EstadoPartida): Promise<void> {
  await page.addInitScript(
    ([salvo, dicas]) => {
      window.sessionStorage.setItem('kabemjunto.modo', 'local');
      window.sessionStorage.setItem('kabemjunto.estado', salvo);
      window.localStorage.setItem('kabemjunto.dicas-vistas', dicas);
      window.localStorage.removeItem('kabemjunto.mesa');
    },
    [JSON.stringify(estado), TODAS_AS_DICAS],
  );
  await page.goto('/');
}

async function esperarCartasParadas(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const mesa = (window as unknown as Record<string, unknown>)['__kabemjuntoMesa'] as
            { estatisticas: () => { cartasAnimando: boolean } } | undefined;
          return mesa ? mesa.estatisticas().cartasAnimando : true;
        }),
      { timeout: 15_000 },
    )
    .toBe(false);
}

/** Ponto da parte visível da carta: as cartas seguintes do leque cobrem a direita dela. */
async function pontoVisivel(page: Page, cartaId: string): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    const botoes = [...document.querySelectorAll<HTMLElement>('.mesa3d-mao button')];
    const indice = botoes.findIndex((botao) => botao.dataset.cardId === id);
    const caixa = botoes[indice]?.getBoundingClientRect();
    if (!caixa) throw new Error(`carta ${id} fora da mão`);
    const proxima = botoes[indice + 1]?.getBoundingClientRect();
    const direita = proxima && proxima.x > caixa.x ? Math.min(caixa.right, proxima.x) : caixa.right;
    return { x: (caixa.x + direita) / 2, y: caixa.y + caixa.height * 0.3 };
  }, cartaId);
}

async function centroDoDescarte(page: Page): Promise<{ x: number; y: number }> {
  const caixa = await page.locator('.mesa3d-marcador-descarte').boundingBox();
  if (!caixa) throw new Error('descarte sem posição projetada');
  return { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
}

async function arrastarAoCentro(page: Page, cartaId: string): Promise<void> {
  const de = await pontoVisivel(page, cartaId);
  const para = await centroDoDescarte(page);
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  await page.mouse.move(de.x + (para.x - de.x) * 0.2, de.y + (para.y - de.y) * 0.2, { steps: 4 });
  await page.mouse.move(para.x, para.y, { steps: 12 });
  await page.mouse.up();
}

/** Arrasto com o dedo (eventos touch reais do Chromium, via CDP). */
async function arrastarComToque(page: Page, cartaId: string): Promise<void> {
  const de = await pontoVisivel(page, cartaId);
  const para = await centroDoDescarte(page);
  const cdp = await page.context().newCDPSession(page);
  const tocar = (type: string, x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y) }],
    });
  await tocar('touchStart', de.x, de.y);
  const passos = 14;
  for (let i = 1; i <= passos; i += 1) {
    await tocar(
      'touchMove',
      de.x + ((para.x - de.x) * i) / passos,
      de.y + ((para.y - de.y) * i) / passos,
    );
  }
  await tocar('touchEnd', para.x, para.y);
  await cdp.detach();
}

const mesa = (page: Page) => page.locator('.mesa3d');

test.describe('Mesa 3D — desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('arrastar carta válida até o centro joga a carta e passa a vez', async ({ page }) => {
    await abrirMesa(
      page,
      partida([
        numerada('cinco-azul', 'AZUL', 5),
        numerada('nove-verde', 'VERDE', 9),
        numerada('dois-laranja', 'LARANJA', 2),
      ]),
    );
    await expect(page.getByText('SUA VEZ')).toBeVisible();
    await expect(page.locator('[data-card-id="cinco-azul"]')).toHaveAttribute(
      'data-situacao',
      'jogavel',
    );
    await expect(page.locator('[data-card-id="nove-verde"]')).toHaveAttribute(
      'data-situacao',
      'bloqueada',
    );

    await arrastarAoCentro(page, 'cinco-azul');

    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'cinco-azul');
    await expect(mesa(page)).toHaveAttribute('data-mao', '2');
    await expect(page.getByRole('list', { name: 'Sua mão: 2 cartas' })).toBeAttached();
    await page.screenshot({ path: 'tmp/mesa3d-desktop-1280x800.png' });
  });

  test('carta inválida volta para a mão com o motivo', async ({ page }) => {
    await abrirMesa(
      page,
      partida([numerada('cinco-azul', 'AZUL', 5), numerada('dois-laranja', 'LARANJA', 2)]),
    );
    await arrastarAoCentro(page, 'dois-laranja');

    await expect(page.locator('.mesa3d-toast')).toContainText('corresponder à cor ativa');
    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'topo-azul');
    await expect(mesa(page)).toHaveAttribute('data-mao', '2');
  });

  test('coringa abre o anel de cores e a cor escolhida passa a valer', async ({ page }) => {
    await abrirMesa(page, partida([CORINGA, numerada('nove-verde', 'VERDE', 9)]));
    await arrastarAoCentro(page, 'coringa-eu');

    const anel = page.getByRole('group', { name: 'Escolha a cor para Coringa' });
    await expect(anel).toBeVisible();
    await expect(anel.getByRole('button', { name: 'Laranja' })).toBeFocused();
    await page.screenshot({ path: 'tmp/mesa3d-anel-de-cores.png' });
    await anel.getByRole('button', { name: 'Verde' }).click();

    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'coringa-eu');
    await expect(mesa(page)).toHaveAttribute('data-cor', 'VERDE');
  });

  test('Esc cancela o anel de cores e a carta continua na mão', async ({ page }) => {
    await abrirMesa(page, partida([CORINGA, numerada('nove-verde', 'VERDE', 9)]));
    await arrastarAoCentro(page, 'coringa-eu');
    await expect(page.getByRole('group', { name: /Escolha a cor/ })).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('group', { name: /Escolha a cor/ })).toHaveCount(0);
    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'topo-azul');
    await expect(mesa(page)).toHaveAttribute('data-mao', '2');
  });

  test('teclado: Tab chega à mão, setas trocam de carta, Enter joga e o foco segue na mão', async ({
    page,
  }) => {
    await abrirMesa(
      page,
      partida([
        numerada('nove-verde', 'VERDE', 9),
        numerada('cinco-azul', 'AZUL', 5),
        numerada('dois-laranja', 'LARANJA', 2),
      ]),
    );
    await page.getByRole('button', { name: 'Sair da partida' }).focus();
    await page.keyboard.press('Tab'); // monte
    await expect(page.getByRole('button', { name: /^Monte:/ })).toBeFocused();
    await page.keyboard.press('Tab'); // primeira carta
    await expect(page.locator('[data-card-id="nove-verde"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const cinco = page.locator('[data-card-id="cinco-azul"]');
    await expect(cinco).toBeFocused();
    await expect(cinco).toHaveAccessibleName(/5 Azul, jogável/);

    await page.keyboard.press('Enter');

    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'cinco-azul');
    // A carta focada saiu da mão: o foco vai para a vizinha, não para o <body>.
    await expect(page.locator('.mesa3d-mao button:focus')).toHaveCount(1);
  });

  test('sem carta válida, tocar no monte compra', async ({ page }) => {
    await abrirMesa(page, partida([numerada('dois-laranja', 'LARANJA', 2)]));
    await expect(page.getByRole('button', { name: /^Comprar 1 carta do monte$/ })).toBeAttached();
    await page.getByRole('button', { name: /^Comprar 1 carta do monte$/ }).focus();
    await page.keyboard.press('Enter');

    await expect(mesa(page)).toHaveAttribute('data-mao', '2');
  });

  test('Corta-Frente: o bot descarta, a janela abre e eu corto a frente arrastando a idêntica', async ({
    page,
  }) => {
    await abrirMesa(page, {
      ...partida([numerada('cinco-azul-eu', 'AZUL', 5), numerada('dois-laranja', 'LARANJA', 2)]),
      jogadores: [
        jogador(
          EU,
          'Você',
          [numerada('cinco-azul-eu', 'AZUL', 5), numerada('dois-laranja', 'LARANJA', 2)],
          false,
        ),
        jogador(
          BOT,
          'Bot 1',
          [numerada('cinco-azul-bot', 'AZUL', 5), numerada('oito-verde-bot', 'VERDE', 8)],
          true,
        ),
      ],
      vezDe: BOT,
    });

    // O bot joga o 5 Azul e a janela abre para mim (tenho um 5 Azul idêntico).
    const banner = page.getByRole('alert').filter({ hasText: 'Corta-Frente!' });
    await expect(banner).toBeVisible();
    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'cinco-azul-bot');
    await expect(page.locator('[data-card-id="cinco-azul-eu"]')).toHaveAttribute(
      'data-situacao',
      'interceptavel',
    );
    await esperarCartasParadas(page);
    await page.screenshot({ path: 'tmp/mesa3d-corta-frente.png' });

    await arrastarAoCentro(page, 'cinco-azul-eu');

    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'cinco-azul-eu');
    await expect(banner).toHaveCount(0);
  });

  test('a última carta vence a partida', async ({ page }) => {
    await abrirMesa(page, partida([numerada('cinco-azul', 'AZUL', 5)]));
    await arrastarAoCentro(page, 'cinco-azul');

    await expect(page.getByRole('heading', { name: 'Você Venceu!' })).toBeVisible();
  });

  test('descarte múltiplo: tocar em cartas de mesma face junta o grupo e ele sai inteiro', async ({
    page,
  }) => {
    await abrirMesa(
      page,
      partida([
        numerada('seis-azul', 'AZUL', 6),
        numerada('seis-verde', 'VERDE', 6),
        numerada('nove-laranja', 'LARANJA', 9),
      ]),
    );
    // Seleção pelo teclado (Espaço), o caminho acessível do mesmo gesto de
    // tocar nas cartas. Mirar a faixa estreita de uma carta inclinada do leque
    // com o mouse é frágil no teste; o toque em si é coberto no cenário mobile.
    for (const id of ['seis-azul', 'seis-verde']) {
      const carta = page.locator(`[data-card-id="${id}"]`);
      await carta.focus();
      await page.keyboard.press('Space');
      await expect(carta).toHaveAttribute('aria-pressed', 'true');
    }

    await page.getByRole('button', { name: 'Jogar 2 cartas' }).click();

    await expect(mesa(page)).toHaveAttribute('data-mao', '1');
    // A última carta do grupo define a cor ativa.
    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'seis-verde');
    await expect(mesa(page)).toHaveAttribute('data-cor', 'VERDE');
  });

  test('Troca Mão: escolho o adversário, depois a cor, e as mãos trocam de dono', async ({
    page,
  }) => {
    const trocaMao: Carta = {
      id: 'troca-eu',
      tipo: 'NEUTRA',
      cor: 'NEUTRO',
      acao: 'TROCA_MAO',
      raridade: 'RARA',
      colecao: 'base-v1',
      efeito_texto_curto: 'Troca Mão',
      efeito_texto_longo: 'Troque toda a sua mão com a de outro jogador.',
    };
    await abrirMesa(page, partida([trocaMao, numerada('cinco-azul', 'AZUL', 5)]));
    await arrastarAoCentro(page, 'troca-eu');

    const alvo = page.getByRole('group', { name: 'Escolha com quem trocar de mão' });
    await expect(alvo).toBeVisible();
    await alvo.getByRole('button', { name: /^Bot 1 · 2 cartas$/ }).click();
    await page
      .getByRole('group', { name: /Escolha a cor/ })
      .getByRole('button', { name: 'Verde' })
      .click();

    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'troca-eu');
    await expect(mesa(page)).toHaveAttribute('data-cor', 'VERDE');
    // Fico com as duas cartas do bot; ele fica com o meu 5 Azul.
    await expect(page.locator('[data-card-id="oito-verde-bot"]')).toBeAttached();
    await expect(page.locator('[data-card-id="seis-verde-bot"]')).toBeAttached();
    await expect(page.locator('[data-card-id="cinco-azul"]')).toHaveCount(0);
  });

  test('?mesa=2d: a mesa simples joga com toque duplo e a mesma partida salva', async ({
    page,
  }) => {
    await page.addInitScript(
      ([salvo, dicas]) => {
        window.sessionStorage.setItem('kabemjunto.modo', 'local');
        window.sessionStorage.setItem('kabemjunto.estado', salvo);
        window.localStorage.setItem('kabemjunto.dicas-vistas', dicas);
      },
      [
        JSON.stringify(
          partida([numerada('cinco-azul', 'AZUL', 5), numerada('dois-laranja', 'LARANJA', 2)]),
        ),
        TODAS_AS_DICAS,
      ],
    );
    await page.goto('/?mesa=2d');

    await expect(page.locator('.mesa2d')).toBeVisible();
    await expect(page.locator('.mesa3d canvas')).toHaveCount(0);
    // Sem 3D, o Three.js nem é baixado.
    const cena = await page.evaluate(() =>
      performance.getEntriesByType('resource').some((r) => r.name.includes('CenaMesa')),
    );
    expect(cena).toBe(false);

    const cinco = page.locator('[data-card-id="cinco-azul"]');
    await cinco.click();
    await expect(cinco).toHaveAttribute('aria-pressed', 'true');
    await cinco.click();

    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'cinco-azul');
    await expect(mesa(page)).toHaveAttribute('data-mao', '1');
    await page.screenshot({ path: 'tmp/mesa2d-desktop.png' });
  });

  test('sem WebGL, a mesa avisa e segue na 2D', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // Simula um aparelho sem WebGL: os outros contextos continuam funcionando.
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        tipo: string,
        ...resto: unknown[]
      ) {
        if (tipo.startsWith('webgl')) return null;
        return (original as (...args: unknown[]) => unknown).call(this, tipo, ...resto);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await abrirMesaSemEsperarCena(
      page,
      partida([numerada('cinco-azul', 'AZUL', 5), numerada('dois-laranja', 'LARANJA', 2)]),
    );

    await expect(
      page.getByRole('status').filter({ hasText: 'A mesa 3D não está disponível' }),
    ).toBeVisible();
    await expect(page.locator('.mesa2d')).toBeVisible();
    await page.keyboard.press('Tab');
    const cinco = page.locator('[data-card-id="cinco-azul"]');
    await cinco.focus();
    await page.keyboard.press('Enter');
    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'cinco-azul');
  });
});

test.describe('Menu e dicas', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('o menu começa uma partida contra bots com o número de jogadores escolhido', async ({
    page,
  }) => {
    await page.addInitScript((dicas) => {
      window.localStorage.setItem('kabemjunto.dicas-vistas', dicas);
      window.localStorage.removeItem('kabemjunto.mesa');
    }, TODAS_AS_DICAS);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entre na mesa' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Jogar contra bots' })).toBeVisible();

    await page.getByLabel('Seu nome').fill('Duda');
    await page.getByLabel('Jogadores na mesa').selectOption('3');
    await page.getByRole('button', { name: 'Começar contra bots' }).click();

    await expect(page.locator('.mesa3d canvas')).toBeVisible();
    const jogadores = page.getByRole('list', { name: 'Jogadores' }).getByRole('listitem');
    await expect(jogadores).toHaveCount(3);
    await expect(jogadores.first()).toContainText('Você (Duda)');

    // Sair da partida volta ao menu.
    await page.getByRole('button', { name: 'Sair da partida' }).click();
    await page
      .getByRole('dialog', { name: 'Sair da partida?' })
      .getByRole('button', { name: 'Sair' })
      .click();
    await expect(page.getByRole('heading', { name: 'Entre na mesa' })).toBeVisible();
  });

  test('na primeira partida, a dica certa aparece uma vez e não volta depois de "Entendi"', async ({
    page,
  }) => {
    await abrirMesa(
      page,
      partida([numerada('cinco-azul', 'AZUL', 5), numerada('nove-verde', 'VERDE', 9)]),
      { comDicas: true },
    );
    const dica = page.getByRole('region', { name: 'Dica' });
    await expect(dica).toContainText('Arraste uma até o centro');
    await page.screenshot({ path: 'tmp/mesa3d-dica-contextual.png' });

    await dica.getByRole('button', { name: 'Entendi' }).click();
    await expect(dica).toHaveCount(0);

    await page.reload();
    await expect(page.locator('.mesa3d canvas')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dica' })).toHaveCount(0);
  });
});

test.describe('Mesa 3D — mobile 375×812', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('mão de 7 cartas cabe na largura, sem rolagem horizontal, e o arrasto joga', async ({
    page,
  }) => {
    await abrirMesa(
      page,
      partida([
        numerada('um-verde', 'VERDE', 1),
        numerada('dois-laranja', 'LARANJA', 2),
        numerada('cinco-azul', 'AZUL', 5),
        numerada('seis-preto', 'PRETO', 6),
        numerada('oito-verde', 'VERDE', 8),
        numerada('nove-laranja', 'LARANJA', 9),
        numerada('tres-preto', 'PRETO', 3),
      ]),
    );

    const larguraPagina = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(larguraPagina).toBeLessThanOrEqual(375);
    const caixas = await page
      .locator('.mesa3d-mao button')
      .evaluateAll((botoes) =>
        botoes
          .map((botao) => botao.getBoundingClientRect())
          .map((caixa) => [caixa.left, caixa.right]),
      );
    expect(caixas).toHaveLength(7);
    for (const [esquerda, direita] of caixas) {
      expect(esquerda).toBeGreaterThanOrEqual(0);
      expect(direita).toBeLessThanOrEqual(375);
    }
    await page.screenshot({ path: 'tmp/mesa3d-mobile-375x812.png' });

    await arrastarComToque(page, 'cinco-azul');
    await expect(mesa(page)).toHaveAttribute('data-topo-id', 'cinco-azul');
  });
});
