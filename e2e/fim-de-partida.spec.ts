/** Tela de fim na partida local: prêmios, compartilhar, jogar de novo e sair. */
import { expect, test, type Page } from '@playwright/test';
import type { Carta, EstadoPartida, EventoPartida, Jogador } from '@kabemjunto/shared';

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

function quaseNoFim(total: number): EstadoPartida {
  const jogadores: Jogador[] = Array.from({ length: total }, (_, i) => ({
    id: i === 0 ? 'p_eu' : `p_bot${i}`,
    nome: i === 0 ? 'Você' : `Bot ${i}`,
    mao: [numerada(`c${i}`, i === 0 ? 'AZUL' : 'LARANJA', 5)],
    isBot: i > 0,
    conectado: true,
    disseUno: false,
    avatar: i === 0 ? '🦊' : '🤖',
    pontos: 0,
  }));
  const historico: EventoPartida[] = Array.from({ length: 9 }, (_, i) => ({
    tipo: 'CARTA_JOGADA',
    timestamp: i,
    jogadorId: 'p_eu',
    cartaId: `jogada-${i}`,
  }));
  return {
    partidaId: 'partida-fim',
    salaId: 'local',
    jogadores,
    monteCompra: Array.from({ length: 40 }, (_, i) => numerada(`m${i}`, 'VERDE', 3)),
    monteDescarte: [numerada('topo-azul', 'AZUL', 4)],
    vezDe: 'p_eu',
    sentido: 1,
    corAtiva: 'AZUL',
    ataqueAcumulado: 0,
    ataqueStack: [],
    silencio: { ativo: false, jogadoresQuebraram: [] },
    historico,
    finalizada: false,
  };
}

async function vencer(page: Page, total = 4): Promise<void> {
  await page.addInitScript(
    (salvo) => {
      if (!window.sessionStorage.getItem('kabemjunto.estado')) {
        window.sessionStorage.setItem('kabemjunto.modo', 'local');
        window.sessionStorage.setItem('kabemjunto.estado', salvo);
      }
      window.localStorage.setItem(
        'kabemjunto.dicas-vistas',
        JSON.stringify(['silencio', 'ataque', 'arrastar', 'grupo', 'zero-mais', 'monte']),
      );
    },
    JSON.stringify(quaseNoFim(total)),
  );
  await page.goto('/?mesa=2d');
  await page.locator('[data-card-id="c0"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Você Venceu!' })).toBeVisible();
}

for (const viewport of [
  { width: 375, height: 667 },
  { width: 1280, height: 800 },
]) {
  test(`cabe em ${viewport.width}x${viewport.height} e mostra o prêmio`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await vencer(page, 10);
    const dialogo = page.getByRole('dialog', { name: 'Você Venceu!' });
    await expect(dialogo).toContainText('Mão ligeira');
    await expect(page.locator('#fim-titulo')).toBeFocused();
    for (const nome of ['Jogar de novo', 'Compartilhar', 'Voltar ao menu'])
      await expect(dialogo.getByRole('button', { name: nome, exact: true })).toBeInViewport({
        ratio: 1,
      });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.waitForTimeout(4000); // o confete termina sozinho
    await page.screenshot({ path: `tmp/fim-local-${viewport.width}.png` });
  });
}

test('jogar de novo começa outra partida; voltar ao menu sai', async ({ page }) => {
  await vencer(page);
  await page.getByRole('button', { name: 'Jogar de novo' }).click();
  await expect(page.locator('.mesa3d')).toHaveAttribute('data-mao', '7');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Esc vai para "Voltar ao menu" sem sair; Enter sai', async ({ page }) => {
  await vencer(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Voltar ao menu' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Como você quer jogar?' })).toBeVisible();
});

test('compartilhar entrega um PNG 1080x1350, com o endereço do jogo e sem código de sala', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(navigator, {
      canShare: () => true,
      share: async (dados: ShareData) => {
        const arquivo = dados.files![0]!;
        const imagem = await createImageBitmap(arquivo);
        Object.assign(window, {
          __compartilhado: {
            texto: dados.text,
            tipo: arquivo.type,
            largura: imagem.width,
            altura: imagem.height,
            url: await new Promise((ok) => {
              const leitor = new FileReader();
              leitor.onload = () => ok(leitor.result);
              leitor.readAsDataURL(arquivo);
            }),
          },
        });
      },
    });
  });
  await vencer(page);
  await page.getByRole('button', { name: 'Compartilhar' }).click();
  await expect(page.getByText('Resultado compartilhado.')).toBeVisible();
  const dados = await page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>)['__compartilhado'] as {
        texto: string;
        tipo: string;
        largura: number;
        altura: number;
        url: string;
      },
  );
  expect(dados).toMatchObject({ tipo: 'image/png', largura: 1080, altura: 1350 });
  expect(dados.texto).toContain('http://127.0.0.1:5175/');
  expect(dados.texto).not.toContain('sala=');
  await page.setContent(`<body style="margin:0"><img src="${dados.url}"></body>`);
  await page.locator('img').screenshot({ path: 'tmp/fim-compartilhar.png' });
});

test('link de convite preenche o código e não entra sozinho', async ({ page }) => {
  await page.goto('/?sala=abc234');
  await expect(page.getByLabel('Código da sala')).toHaveValue('ABC234');
  await expect(page.getByText('Convite para a sala ABC234')).toBeVisible();
  await page.goto('/?sala=abc-23');
  await expect(page.getByLabel('Código da sala')).toHaveValue('');
});
