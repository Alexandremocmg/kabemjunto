/** Imagem do resultado (1080x1350), desenhada só com formas e texto: sem rede. */
export const LARGURA = 1080;
export const ALTURA = 1350;

export interface DadosDaImagem {
  titulo: string;
  premios: ReadonlyArray<{ titulo: string; nome: string; detalhe: string }>;
  /** Endereço curto mostrado no rodapé. */
  endereco: string;
}

const FONTE = '"Outfit", "Segoe UI", system-ui, sans-serif';
const CORES = ['#f39c12', '#3498db', '#27ae60', '#2c3e50'];

/** Corta com reticências para caber na largura, com a fonte já definida no contexto. */
function caber(ctx: CanvasRenderingContext2D, texto: string, largura: number): string {
  if (ctx.measureText(texto).width <= largura) return texto;
  const letras = [...texto];
  while (letras.length > 1 && ctx.measureText(`${letras.join('')}…`).width > largura) letras.pop();
  return `${letras.join('')}…`;
}

/** Diminui a fonte até `minimo` antes de cortar o texto. */
function escrever(
  ctx: CanvasRenderingContext2D,
  texto: string,
  y: number,
  opcoes: { largura: number; tamanho: number; minimo: number; peso: number; cor: string },
): void {
  let { tamanho } = opcoes;
  ctx.font = `${opcoes.peso} ${tamanho}px ${FONTE}`;
  while (tamanho > opcoes.minimo && ctx.measureText(texto).width > opcoes.largura) {
    tamanho -= 2;
    ctx.font = `${opcoes.peso} ${tamanho}px ${FONTE}`;
  }
  ctx.fillStyle = opcoes.cor;
  ctx.fillText(caber(ctx, texto, opcoes.largura), LARGURA / 2, y);
}

function caixa(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  raio: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + raio, y);
  ctx.arcTo(x + w, y, x + w, y + h, raio);
  ctx.arcTo(x + w, y + h, x, y + h, raio);
  ctx.arcTo(x, y + h, x, y, raio);
  ctx.arcTo(x, y, x + w, y, raio);
  ctx.closePath();
}

export function desenharResultado(ctx: CanvasRenderingContext2D, dados: DadosDaImagem): void {
  const fundo = ctx.createLinearGradient(0, 0, 0, ALTURA);
  fundo.addColorStop(0, '#12324a');
  fundo.addColorStop(1, '#0b1626');
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, LARGURA, ALTURA);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  escrever(ctx, 'KABEMJUNTO', 110, {
    largura: 900,
    tamanho: 76,
    minimo: 40,
    peso: 900,
    cor: '#f8c56b',
  });

  // Leque de cartas nas cores do baralho.
  CORES.forEach((cor, indice) => {
    const desvio = indice - 1.5;
    ctx.save();
    ctx.translate(LARGURA / 2 + desvio * 120, 340 + Math.abs(desvio) * 24);
    ctx.rotate(desvio * 0.2);
    caixa(ctx, -80, -120, 160, 240, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    caixa(ctx, -66, -106, 132, 212, 16);
    ctx.fillStyle = cor;
    ctx.fill();
    ctx.restore();
  });

  escrever(ctx, dados.titulo, 590, {
    largura: 940,
    tamanho: 92,
    minimo: 44,
    peso: 900,
    cor: '#ffffff',
  });

  dados.premios.slice(0, 3).forEach((premio, indice) => {
    const y = 690 + indice * 165;
    caixa(ctx, 90, y, LARGURA - 180, 145, 28);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fill();
    escrever(ctx, `${premio.titulo}: ${premio.nome}`, y + 50, {
      largura: 840,
      tamanho: 46,
      minimo: 32,
      peso: 800,
      cor: '#f8c56b',
    });
    escrever(ctx, premio.detalhe, y + 104, {
      largura: 840,
      tamanho: 36,
      minimo: 26,
      peso: 500,
      cor: '#e2e8f0',
    });
  });

  escrever(ctx, 'Vem jogar:', 1225, {
    largura: 900,
    tamanho: 36,
    minimo: 28,
    peso: 500,
    cor: '#cbd5e1',
  });
  escrever(ctx, dados.endereco, 1282, {
    largura: 960,
    tamanho: 46,
    minimo: 24,
    peso: 800,
    cor: '#ffffff',
  });
}

export async function gerarImagemDoResultado(dados: DadosDaImagem): Promise<Blob | undefined> {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  desenharResultado(ctx, dados);
  return new Promise((resolver) =>
    canvas.toBlob((blob) => resolver(blob ?? undefined), 'image/png'),
  );
}
