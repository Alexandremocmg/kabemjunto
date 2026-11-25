/**
 * Impactos na mesa: selo sobre o jogador afetado, tremor da plaqueta e anel do
 * Silêncio. Cada cenário parte de uma partida montada na sessionStorage, com
 * bots que só têm uma reação possível.
 */
import { expect, test, type Page } from '@playwright/test';
import type { Carta, EstadoPartida, Jogador } from '@kabemjunto/shared';

const EU = 'p_eu';

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

function especial(
  id: string,
  acao: NonNullable<Carta['acao']>,
  cor: Carta['cor'] = 'NEUTRO',
): Carta {
  return {
    id,
    tipo: cor === 'NEUTRO' ? 'NEUTRA' : 'ACAO',
    cor,
    acao,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: id,
    efeito_texto_longo: id,
  };
}

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

/** Bots só têm laranja: não cobrem ataque nem jogam no azul. */
function partida(
  maoEu: Carta[],
  bots: number,
  extra: Partial<EstadoPartida> = {},
  maoDoBot: Record<number, Carta[]> = {},
): EstadoPartida {
  return {
    partidaId: 'partida-impactos',
    salaId: 'local',
    jogadores: [
      jogador(
        EU,
        'Você',
        [...maoEu, numerada('eu-a', 'VERDE', 9), numerada('eu-b', 'PRETO', 1)],
        false,
      ),
      ...Array.from({ length: bots }, (_, i) =>
        jogador(
          `p_bot${i + 1}`,
          `Bot ${i + 1}`,
          [
            ...(maoDoBot[i + 1] ?? []),
            numerada(`b${i}-a`, 'LARANJA', 8),
            numerada(`b${i}-b`, 'LARANJA', 6),
          ],
          true,
        ),
      ),
    ],
    monteCompra: Array.from({ length: 40 }, (_, i) => numerada(`m${i}`, 'LARANJA', 3)),
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

/**
 * `segurar`: mantém os selos na tela (o timer de 1200 ms vira 8 s e a animação
 * CSS para), para medir posição e fotografar sem corrida com o relógio.
 */
async function abrir(
  page: Page,
  estado: EstadoPartida,
  { caminho = '/', segurar = false }: { caminho?: string; segurar?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    ([salvo, segura]) => {
      window.sessionStorage.setItem('kabemjunto.modo', 'local');
      window.sessionStorage.setItem('kabemjunto.estado', salvo as string);
      window.localStorage.setItem(
        'kabemjunto.dicas-vistas',
        JSON.stringify(['silencio', 'ataque', 'arrastar', 'grupo', 'zero-mais', 'monte']),
      );
      window.localStorage.removeItem('kabemjunto.mesa');
      // Todo selo que aparecer fica registrado, mesmo que suma antes da asserção.
      const vistos: string[] = [];
      (window as unknown as Record<string, unknown>)['__selos'] = vistos;
      new MutationObserver((mudancas) => {
        for (const mudanca of mudancas)
          for (const no of mudanca.addedNodes)
            if (no instanceof HTMLElement) {
              const achados = no.matches('[data-impacto]')
                ? [no]
                : [...no.querySelectorAll<HTMLElement>('[data-impacto]')];
              for (const selo of achados)
                vistos.push(
                  `${selo.dataset.impacto} ${selo.dataset.jogador} ${selo.textContent ?? ''}`,
                );
            }
      }).observe(document, { childList: true, subtree: true });
      if (segura) {
        const original = window.setTimeout.bind(window);
        window.setTimeout = ((fn: TimerHandler, ms?: number, ...resto: unknown[]) =>
          original(fn, ms === 1200 ? 8000 : ms, ...resto)) as typeof window.setTimeout;
      }
    },
    [JSON.stringify(estado), segurar] as const,
  );
  await page.goto(caminho);
  await expect(page.locator('.mesa3d')).toBeVisible();
  if (segurar) await page.addStyleTag({ content: '.selo-impacto-corpo{animation:none!important}' });
  if (!caminho.includes('mesa=2d')) {
    await expect(page.locator('.mesa3d canvas')).toBeVisible();
    await expect
      .poll(async () => (await estatisticas(page))?.cartasAnimando, { timeout: 15_000 })
      .toBe(false);
  }
}

interface Estatisticas {
  cartasAnimando: boolean;
  plaquetasEmImpacto: number;
  desvioDasPlaquetas: number;
  impactosAnimados: number;
  anelDoSilencio: boolean;
  aneisDoSilencio: number;
}

const estatisticas = (page: Page): Promise<Estatisticas | undefined> =>
  page.evaluate(() =>
    (
      (window as unknown as Record<string, unknown>)['__kabemjuntoMesa'] as
        { estatisticas: () => Estatisticas } | undefined
    )?.estatisticas(),
  );

const selosVistos = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as Record<string, string[]>)['__selos'] ?? []);

const selo = (page: Page, tipo: string, id: string) =>
  page.locator(`[data-impacto="${tipo}"][data-jogador="${id}"]`);

async function jogar(page: Page, cartaId: string, cor?: string): Promise<void> {
  await page.locator(`[data-card-id="${cartaId}"]`).focus();
  await page.keyboard.press('Enter');
  if (cor)
    await page
      .getByRole('group', { name: /Escolha a cor/ })
      .getByRole('button', { name: cor })
      .click();
  await expect(page.locator('.mesa3d')).not.toHaveAttribute('data-topo-id', 'topo-azul');
}

/** A cena volta exatamente ao repouso e nenhum selo fica para trás. */
async function esperarRepouso(page: Page): Promise<void> {
  await expect(page.locator('[data-impacto]')).toHaveCount(0, { timeout: 10_000 });
  await expect
    .poll(
      async () => {
        const atual = await estatisticas(page);
        return [atual?.plaquetasEmImpacto, atual?.desvioDasPlaquetas, atual?.anelDoSilencio];
      },
      { timeout: 10_000 },
    )
    .toEqual([0, 0, false]);
}

test.describe('Impactos — desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('+2: o alvo é mirado, compra em seguida e a plaqueta volta ao repouso', async ({ page }) => {
    const erros: string[] = [];
    page.on('pageerror', (erro) => erros.push(erro.message));
    await abrir(page, partida([especial('mais2', 'MAIS_DOIS', 'AZUL')], 3));
    await jogar(page, 'mais2');

    await expect
      .poll(() => selosVistos(page), { timeout: 10_000 })
      .toEqual(expect.arrayContaining(['ATAQUE p_bot1 🎯+2', 'COMPRA_ATAQUE p_bot1 🃏+2']));
    expect((await estatisticas(page))!.impactosAnimados).toBeGreaterThanOrEqual(2);
    await esperarRepouso(page);
    // As compras comuns dos outros bots (1 carta) não viram selo.
    expect(await selosVistos(page)).toHaveLength(2);
    expect(erros).toEqual([]);
  });

  test('bot me ataca: o selo fica perto da minha mão e não treme plaqueta', async ({ page }) => {
    await abrir(
      page,
      partida([], 1, { vezDe: 'p_bot1' }, { 1: [especial('mais2-bot', 'MAIS_DOIS', 'AZUL')] }),
      { segurar: true },
    );
    const meu = selo(page, 'ATAQUE', EU);
    await expect(meu).toBeVisible();
    await expect(meu).toHaveAttribute('aria-hidden', 'true');
    const caixa = (await meu.boundingBox())!;
    expect(caixa.y).toBeGreaterThan(300);
    expect((await estatisticas(page))!.impactosAnimados).toBe(0);
    await page.screenshot({ path: 'tmp/impacto-ataque-local-1280.png' });
  });

  test('0+ reflete no último atacante, que não é o vizinho', async ({ page }) => {
    await abrir(
      page,
      partida([especial('zero', 'ZERO_MAIS')], 3, {
        ataqueAcumulado: 4,
        ataqueStack: ['MAIS_QUATRO'],
        historico: [
          {
            tipo: 'ATAQUE_ACUMULADO',
            timestamp: 1,
            novo: 4,
            stack: ['MAIS_QUATRO'],
            origem: 'p_bot2',
          },
        ],
      }),
      { segurar: true },
    );
    await jogar(page, 'zero', 'Azul');
    const refletido = selo(page, 'REFLETIDO', 'p_bot2');
    await expect(refletido).toContainText('REFLETIDO!');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tmp/impacto-refletido-1280.png' });
    expect((await selosVistos(page))[0]).toBe('REFLETIDO p_bot2 ↩REFLETIDO! +4');
  });

  test('Skip marca quem perdeu a vez', async ({ page }) => {
    await abrir(page, partida([especial('skip', 'SKIP', 'AZUL')], 3, { sentido: -1 }), {
      segurar: true,
    });
    await jogar(page, 'skip');
    await expect(selo(page, 'PULOU', 'p_bot3')).toBeVisible();
    await page.screenshot({ path: 'tmp/impacto-pulou-1280.png' });
  });

  test('o 7 acende o anel uma vez ao pousar e o anel some', async ({ page }) => {
    const sete: Carta = { ...numerada('sete', 'AZUL', 7), acao: 'SILENCIO' };
    await abrir(page, partida([sete], 2));
    await jogar(page, 'sete');
    await expect
      .poll(async () => (await estatisticas(page))!.aneisDoSilencio, { timeout: 10_000 })
      .toBe(1);
    // Fotos em sequência do efeito (a inspeção visual escolhe a melhor).
    for (let i = 0; i < 4; i += 1) {
      const aceso = (await estatisticas(page))!.anelDoSilencio;
      await page.screenshot({ path: `tmp/impacto-silencio-${i}${aceso ? '-aceso' : ''}.png` });
    }
    await esperarRepouso(page);
    expect((await estatisticas(page))!.aneisDoSilencio).toBe(1);
  });

  test('mesa 2D: o selo fica na ficha do adversário', async ({ page }) => {
    await abrir(page, partida([especial('skip', 'SKIP', 'AZUL')], 3), {
      caminho: '/?mesa=2d',
      segurar: true,
    });
    await jogar(page, 'skip');
    const naFicha = page.locator('.mesa2d-adversario [data-impacto="PULOU"]');
    await expect(naFicha).toBeVisible();
    await expect(naFicha).toHaveCSS('pointer-events', 'none');
    await page.screenshot({ path: 'tmp/impacto-2d-1280.png' });
  });
});

test.describe('Impactos — movimento reduzido', () => {
  test.use({ viewport: { width: 1280, height: 800 }, contextOptions: { reducedMotion: 'reduce' } });

  test('selo estático, sem tremor de plaqueta nem anel', async ({ page }) => {
    const sete: Carta = { ...numerada('sete', 'AZUL', 7), acao: 'SILENCIO' };
    await abrir(page, partida([sete], 2, {}, { 1: [especial('skip-bot', 'SKIP', 'AZUL')] }));
    await jogar(page, 'sete');
    // O bot 1 responde com Skip e pula o bot 2.
    const pulou = selo(page, 'PULOU', 'p_bot2');
    await expect(pulou).toBeVisible();
    expect(
      await pulou
        .locator('.selo-impacto-corpo')
        .evaluate((corpo) => getComputedStyle(corpo).animationName),
    ).toBe('none');
    const atual = (await estatisticas(page))!;
    expect(atual.impactosAnimados).toBe(0);
    expect(atual.aneisDoSilencio).toBe(0);
    await esperarRepouso(page);
  });
});

test.describe('Impactos — mobile 375×812 com 10 jogadores', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  for (const [nome, caminho] of [
    ['3d', '/'],
    ['2d', '/?mesa=2d'],
  ] as const) {
    test(`+2 Para Todos (${nome}): 9 selos na tela, sem rolagem e sem bloquear toque`, async ({
      page,
    }) => {
      await abrir(page, partida([especial('todos', 'MAIS_DOIS_TODOS')], 9), {
        caminho,
        segurar: true,
      });
      await jogar(page, 'todos', 'Azul');
      const todos = page.locator('[data-impacto="MAIS_DOIS_TODOS"]');
      await expect(todos).toHaveCount(9);

      const medidas = await todos.evaluateAll((selos) =>
        selos.map((elemento) => {
          const caixa = elemento.getBoundingClientRect();
          const noPonto = document.elementFromPoint(
            caixa.x + caixa.width / 2,
            caixa.y + caixa.height / 2,
          );
          return {
            esquerda: caixa.left,
            direita: caixa.right,
            topo: caixa.top,
            base: caixa.bottom,
            bloqueia: elemento.contains(noPonto),
          };
        }),
      );
      for (const medida of medidas) {
        expect(medida.esquerda).toBeGreaterThanOrEqual(0);
        expect(medida.direita).toBeLessThanOrEqual(375);
        expect(medida.topo).toBeGreaterThanOrEqual(0);
        expect(medida.base).toBeLessThanOrEqual(812);
        expect(medida.bloqueia).toBe(false);
      }
      // Vizinhos apertados continuam distinguíveis: nenhum selo cobre outro.
      for (const [i, a] of medidas.entries())
        for (const b of medidas.slice(i + 1))
          expect(
            Math.min(a.direita, b.direita) - Math.max(a.esquerda, b.esquerda) > 4 &&
              Math.min(a.base, b.base) - Math.max(a.topo, b.topo) > 4,
          ).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        375,
      );
      await page.screenshot({ path: `tmp/impacto-todos-375-${nome}-faixa.png` });
      // Sem a faixa central por cima, para inspecionar os selos.
      await expect(page.locator('.mesa3d-faixa')).toHaveCount(0, { timeout: 6_000 });
      await page.screenshot({ path: `tmp/impacto-todos-375-${nome}.png` });
    });
  }

  test('ataque em mim no celular: selo perto da mão', async ({ page }) => {
    await abrir(
      page,
      partida([], 9, { vezDe: 'p_bot9' }, { 9: [especial('mais2-bot', 'MAIS_DOIS', 'AZUL')] }),
      { segurar: true },
    );
    await expect(selo(page, 'ATAQUE', EU)).toBeVisible();
    await page.screenshot({ path: 'tmp/impacto-ataque-local-375.png' });
  });

  test('REFLETIDO! num assento da borda não sai da tela', async ({ page }) => {
    await abrir(
      page,
      partida([especial('zero', 'ZERO_MAIS')], 9, {
        ataqueAcumulado: 4,
        ataqueStack: ['MAIS_QUATRO'],
        historico: [
          {
            tipo: 'ATAQUE_ACUMULADO',
            timestamp: 1,
            novo: 4,
            stack: ['MAIS_QUATRO'],
            origem: 'p_bot7',
          },
        ],
      }),
      { segurar: true },
    );
    await jogar(page, 'zero', 'Azul');
    const refletido = selo(page, 'REFLETIDO', 'p_bot7');
    await expect(refletido).toBeVisible();
    const caixa = (await refletido.boundingBox())!;
    expect(caixa.x).toBeGreaterThanOrEqual(0);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: 'tmp/impacto-refletido-375.png' });
  });
});
