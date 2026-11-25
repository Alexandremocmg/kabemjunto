import qrcode from 'qrcode-generator';
import { FRASE_DESAFIO } from './convite';

const LARGURA = 1080;
const ALTURA = 1920;
const CENTRO = LARGURA / 2;
const PASTA = `${import.meta.env.BASE_URL}assets/cards/kabemjunto/`;
const FONTE = '"Segoe UI", system-ui, sans-serif';

function carregarImagem(arquivo: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolver) => {
    const imagem = new Image();
    imagem.onload = () => resolver(imagem);
    imagem.onerror = () => resolver(undefined);
    imagem.src = PASTA + arquivo;
  });
}

function desenharCarta(
  ctx: CanvasRenderingContext2D,
  imagem: HTMLImageElement | undefined,
  x: number,
  angulo: number,
): void {
  if (!imagem) return;
  const altura = 340;
  const largura = (altura * imagem.naturalWidth) / imagem.naturalHeight;
  ctx.save();
  ctx.translate(x, 590);
  ctx.rotate(angulo);
  ctx.drawImage(imagem, -largura / 2, -altura / 2, largura, altura);
  ctx.restore();
}

function desenharQr(ctx: CanvasRenderingContext2D, link: string): void {
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();

  const modulos = qr.getModuleCount();
  // Quatro módulos de área branca em cada lado, com células em pixels inteiros.
  const margem = 4;
  const celula = Math.floor(420 / (modulos + 2 * margem));
  const tamanho = (modulos + 2 * margem) * celula;
  const x = Math.floor((LARGURA - tamanho) / 2);
  const y = 1170 + Math.floor((420 - tamanho) / 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, tamanho, tamanho);
  ctx.fillStyle = '#000';
  for (let linha = 0; linha < modulos; linha += 1) {
    for (let coluna = 0; coluna < modulos; coluna += 1) {
      if (qr.isDark(linha, coluna)) {
        ctx.fillRect(x + (coluna + margem) * celula, y + (linha + margem) * celula, celula, celula);
      }
    }
  }
}

export async function gerarImagemDoDesafio(salaId: string, link: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');

  const [logo, maisQuatro, zeroMais] = await Promise.all([
    carregarImagem('brand-kabemjunto.webp'),
    carregarImagem('mais-quatro.webp'),
    carregarImagem('zero-mais.webp'),
  ]);
  const fundo = ctx.createRadialGradient(CENTRO, 650, 100, CENTRO, 650, 1360);
  fundo.addColorStop(0, '#285844');
  fundo.addColorStop(1, '#071510');
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const texto = (valor: string, y: number, tamanho: number, cor = '#fff9ee', peso = 800) => {
    ctx.font = `${peso} ${tamanho}px ${FONTE}`;
    ctx.fillStyle = cor;
    ctx.fillText(valor, CENTRO, y, 920);
  };
  if (logo) {
    const largura = 650;
    const altura = (largura * logo.naturalHeight) / logo.naturalWidth;
    const x = CENTRO - largura / 2;
    const y = 270 - altura / 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, largura, altura, 24);
    ctx.clip();
    ctx.drawImage(logo, x, y, largura, altura);
    ctx.restore();
  } else {
    texto('KABEMJUNTO', 290, 80, '#f8c56b');
  }
  desenharCarta(ctx, maisQuatro, CENTRO - 117, -0.23);
  desenharCarta(ctx, zeroMais, CENTRO + 117, 0.23);

  texto(FRASE_DESAFIO[0], 850, 77);
  texto(FRASE_DESAFIO[1], 945, 91, '#f8c56b');
  texto(FRASE_DESAFIO[2], 1040, 91, '#f8c56b');
  texto('A mesa tá aberta. Encara?', 1120, 42, '#fff9ee', 600);
  desenharQr(ctx, link);
  texto('Escaneie e vem jogar', 1650, 48);
  texto(`Sala ${salaId}`, 1722, 44, '#f8c56b', 600);

  return new Promise((resolver, rejeitar) => {
    canvas.toBlob((blob) => {
      if (blob) resolver(blob);
      else rejeitar(new Error('PNG indisponível'));
    }, 'image/png');
  });
}
