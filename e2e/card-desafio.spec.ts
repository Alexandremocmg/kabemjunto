import { expect, test } from '@playwright/test';
import qrcode from 'qrcode-generator';

test('card público compartilha, baixa e copia o mesmo convite que está no QR', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (texto: string) => Object.assign(window, { __copiado: texto }) },
    });
    Object.assign(navigator, {
      canShare: ({ files }: ShareData) => files?.[0]?.type === 'image/png',
      share: async ({ files, text }: ShareData) => {
        Object.assign(window, { __status: { tipo: files?.[0]?.type, text } });
      },
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Seu apelido').fill('Ana');
  await page.getByRole('button', { name: 'Criar sala' }).click();
  await page.getByLabel('Visibilidade').selectOption('publica');
  await page.getByRole('button', { name: 'Criar sala pública' }).click();
  const codigo = await page.locator('.room-code').innerText();
  const abrir = page.getByRole('button', { name: 'Card de desafio' });
  await abrir.click();
  const dialogo = page.getByRole('dialog', { name: 'Card de desafio' });
  const previa = dialogo.getByRole('img', { name: /QR do convite/ });
  await expect(previa).toBeVisible();
  for (const acao of ['Compartilhar no Status', 'Baixar imagem', 'Copiar link']) {
    await expect(dialogo.getByText(acao, { exact: true })).toBeInViewport({ ratio: 1 });
  }

  const link = new URL(`/?sala=${codigo}`, page.url()).href;
  await dialogo.getByRole('button', { name: 'Copiar link' }).click();
  await expect(dialogo.getByText('Link do convite copiado.')).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__copiado'))).toBe(link);
  await dialogo.getByRole('button', { name: 'Compartilhar no Status' }).click();
  expect(await page.evaluate(() => Reflect.get(window, '__status'))).toEqual({
    text: expect.stringContaining(link),
    tipo: 'image/png',
  });

  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const modulos = qr.getModuleCount();
  const matriz = Array.from({ length: modulos }, (_, linha) =>
    Array.from({ length: modulos }, (_, coluna) => qr.isDark(linha, coluna)),
  );
  const dados = await previa.evaluate(async (elemento, conta) => {
    const imagem = elemento as HTMLImageElement;
    await imagem.decode();
    const canvas = document.createElement('canvas');
    canvas.width = imagem.naturalWidth;
    canvas.height = imagem.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imagem, 0, 0);
    const celula = Math.floor(420 / (conta + 8));
    const tamanho = (conta + 8) * celula;
    const x = Math.floor((canvas.width - tamanho) / 2);
    const y = 1170 + Math.floor((420 - tamanho) / 2);
    const bytes = ctx.getImageData(x, y, tamanho, tamanho).data;
    const escuro = (linha: number, coluna: number) => {
      const meio = Math.floor(celula / 2);
      return bytes[((linha * celula + meio) * tamanho + coluna * celula + meio) * 4] === 0;
    };
    return {
      largura: canvas.width,
      altura: canvas.height,
      matriz: Array.from({ length: conta }, (_, linha) =>
        Array.from({ length: conta }, (_, coluna) => escuro(linha + 4, coluna + 4)),
      ),
    };
  }, modulos);
  expect(dados).toEqual({ largura: 1080, altura: 1920, matriz });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialogo.getByRole('link', { name: 'Baixar imagem' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`kabemjunto-desafio-${codigo}.png`);
  await download.saveAs(testInfo.outputPath('card-desafio.png'));
  await page.evaluate(() => Object.assign(navigator, { canShare: () => false }));
  await dialogo.getByRole('button', { name: 'Compartilhar no Status' }).click();
  await expect(dialogo.getByText(/Baixe a imagem para publicar no Status/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
  await expect(abrir).toBeFocused();

  const convidado = await browser.newPage();
  try {
    await convidado.goto(link, { waitUntil: 'domcontentloaded' });
    await expect(convidado.getByLabel('Código da sala')).toHaveValue(codigo);
    await convidado.getByLabel('Seu apelido').fill('Bia');
    await convidado.getByRole('button', { name: 'Entrar em sala' }).click();
    await expect(convidado.locator('.room-code')).toHaveText(codigo);
    await expect(convidado.getByRole('button', { name: 'Card de desafio' })).toBeVisible();
  } finally {
    await convidado.close();
  }
});

test('sala privada oferece o convite comum', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Seu apelido').fill('Ana');
  await page.getByRole('button', { name: 'Criar sala' }).click();
  await page.getByRole('button', { name: 'Criar sala privada' }).click();
  await expect(page.getByRole('button', { name: 'Convidar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Card de desafio' })).toHaveCount(0);
});
