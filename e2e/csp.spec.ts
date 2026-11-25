/**
 * Fim de partida no build de produção, servido pelo servidor com a CSP real.
 * O servidor de desenvolvimento do Vite não envia CSP, então só aqui um recurso
 * bloqueado aparece (foi assim que o confete deixou de ser desenhado em produção).
 */
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

function carta(id: string, cor: string, valor: number) {
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

const ESTADO = JSON.stringify({
  partidaId: 'partida-csp',
  salaId: 'local',
  jogadores: ['p_eu', 'p_bot1'].map((id, i) => ({
    id,
    nome: i === 0 ? 'Você' : 'Bot 1',
    mao: [carta(`c${i}`, i === 0 ? 'AZUL' : 'LARANJA', 5)],
    isBot: i > 0,
    conectado: true,
    disseUno: false,
    avatar: '🦊',
    pontos: 0,
  })),
  monteCompra: Array.from({ length: 20 }, (_, i) => carta(`m${i}`, 'VERDE', 3)),
  monteDescarte: [carta('topo', 'AZUL', 4)],
  vezDe: 'p_eu',
  sentido: 1,
  corAtiva: 'AZUL',
  ataqueAcumulado: 0,
  ataqueStack: [],
  silencio: { ativo: false, jogadoresQuebraram: [] },
  historico: [],
  finalizada: false,
});

test('a vitória desenha confete sem violar a CSP', async ({ page }) => {
  const violacoes: string[] = [];
  page.on('console', (mensagem) => {
    if (/Content Security Policy/i.test(mensagem.text())) violacoes.push(mensagem.text());
  });
  await page.addInitScript((salvo) => {
    window.sessionStorage.setItem('kabemjunto.modo', 'local');
    window.sessionStorage.setItem('kabemjunto.estado', salvo);
  }, ESTADO);
  const resposta = await page.goto(`${url}/?mesa=2d`);
  expect(resposta?.headers()['content-security-policy']).toContain("script-src 'self'");
  await page.locator('[data-card-id="c0"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Você Venceu!' })).toBeVisible();

  // Algum canvas tem pixels pintados: o confete apareceu de verdade.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          [...document.querySelectorAll('canvas')].some((canvas) => {
            try {
              const dados = canvas
                .getContext('2d')
                ?.getImageData(0, 0, canvas.width, canvas.height).data;
              return dados ? dados.some((valor, i) => i % 4 === 3 && valor > 0) : false;
            } catch {
              return false; // canvas transferido para um worker
            }
          }),
        ),
      { timeout: 4000 },
    )
    .toBe(true);
  expect(violacoes).toEqual([]);
  // Ao sair, o canvas do confete é removido.
  await page.getByRole('button', { name: 'Voltar ao menu' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
});
