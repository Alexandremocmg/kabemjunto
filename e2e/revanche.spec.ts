/**
 * Revanche online (precisa do servidor com `client:revanche:pedir`,
 * `server:partida:encerrada` e `server:revanche:atualizada`).
 */
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const SERVIDOR = 'http://127.0.0.1:3101';
const REVANCHE = 'Jogar de novo com a mesma mesa';
const contextosAbertos: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contextosAbertos.splice(0).map((contexto) => contexto.close()));
});

async function novoJogador(browser: Browser): Promise<Page> {
  const contexto = await browser.newContext({ viewport: { width: 900, height: 760 } });
  contextosAbertos.push(contexto);
  await contexto.addInitScript(() => {
    window.localStorage.setItem('kabemjunto.avatar', '07');
    window.localStorage.setItem(
      'kabemjunto.dicas-vistas',
      JSON.stringify(['silencio', 'ataque', 'arrastar', 'grupo', 'zero-mais', 'monte']),
    );
  });
  return contexto.newPage();
}

/** Dois jogadores e a partida terminada com vitória do anfitrião (fixture do servidor). */
async function partidaTerminada(
  browser: Browser,
  request: APIRequestContext,
): Promise<{ host: Page; convidado: Page }> {
  const host = await novoJogador(browser);
  const convidado = await novoJogador(browser);
  await host.goto('/?mesa=2d');
  await host.getByLabel('Seu apelido').fill('Ana');
  await host.getByRole('button', { name: 'Criar sala' }).click();
  await host
    .getByRole('dialog', { name: 'Criar sala' })
    .getByRole('button', { name: 'Criar sala privada' })
    .click();
  await expect(host.locator('.room-code')).toBeVisible();
  const salaId = (await host.locator('.room-code').textContent()) ?? '';

  // O convidado chega pelo link: o código já vem preenchido, mas ele é quem entra.
  await convidado.goto(`/?mesa=2d&sala=${salaId}`);
  await expect(convidado.getByLabel('Código da sala')).toHaveValue(salaId);
  await convidado.getByLabel('Seu apelido').fill('Beto');
  await convidado.getByRole('button', { name: 'Entrar em sala' }).click();
  await expect(convidado.locator('.room-code')).toHaveText(salaId);
  await host.getByRole('button', { name: 'Iniciar partida' }).click();
  for (const pagina of [host, convidado]) await expect(pagina.locator('.mesa3d')).toBeVisible();

  const resposta = await request.post(`${SERVIDOR}/__e2e/fixture/online-vitoria-deterministica`, {
    data: { salaId },
  });
  expect(resposta.ok()).toBeTruthy();
  const { vencedorCardId } = (await resposta.json()) as { vencedorCardId: string };
  await host.locator(`[data-card-id="${vencedorCardId}"]`).focus();
  await host.keyboard.press('Enter');
  await expect(host.getByRole('dialog', { name: 'Você Venceu!' })).toBeVisible();
  await expect(convidado.getByRole('dialog', { name: 'Ana Venceu!' })).toBeVisible();
  return { host, convidado };
}

test('placar da sessão aparece para os dois e os dois aceitos começam outra partida', async ({
  browser,
  request,
}) => {
  const { host, convidado } = await partidaTerminada(browser, request);
  for (const pagina of [host, convidado])
    await expect(pagina.getByRole('dialog')).toContainText('Placar da sessão (1 partida)');

  await host.getByRole('button', { name: REVANCHE }).click();
  await expect(convidado.getByText('1 de 2 prontos: Ana.')).toBeVisible();
  await expect(convidado.getByText(/Começa em \d+ s/)).toBeVisible();
  await convidado.getByRole('button', { name: REVANCHE }).click();

  for (const pagina of [host, convidado]) {
    await expect(pagina.getByRole('dialog')).toHaveCount(0);
    await expect(pagina.locator('.mesa3d')).toHaveAttribute('data-mao', '7');
  }
});

test('quem não aceita a tempo volta ao menu sabendo o motivo', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const { host, convidado } = await partidaTerminada(browser, request);
  await host.getByRole('button', { name: REVANCHE }).click();
  await expect(convidado.getByText(/A revanche começou sem você/)).toBeVisible({ timeout: 60_000 });
  await expect(host.locator('.mesa3d')).toHaveAttribute('data-mao', '7');
});

test('voltar ao menu sai da sala e quem ficou joga a revanche com bots', async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const { host, convidado } = await partidaTerminada(browser, request);
  await convidado.getByRole('button', { name: 'Voltar ao menu' }).click();
  await expect(convidado.getByRole('heading', { name: 'Como você quer jogar?' })).toBeVisible();
  await host.getByRole('button', { name: REVANCHE }).click();
  await expect(host.locator('.mesa3d')).toHaveAttribute('data-mao', '7', { timeout: 60_000 });
});
