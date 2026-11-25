/**
 * Texturas da mesa 3D, desenhadas em canvas 2D.
 *
 * As faces numéricas e de ação são geradas por código (cor + símbolo), como já
 * acontecia nos templates CSS da mesa 2D; as neutras especiais reaproveitam a
 * arte `.webp` existente. Cada face é criada uma vez e compartilhada por todas
 * as cartas iguais (cache por chave), e tudo é liberado em `destruir()`.
 */
import { emojiDoAvatar } from '../../services/avatar';
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import type { Carta } from '@kabemjunto/shared';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import { CARD_BACK_ASSET, getCardVisual } from '../../components/cardVisuals';
import { chaveDaFace, simboloDaCarta } from '../interacao';

const LARGURA = 256;
const ALTURA = 364;
const FONTE = '"Outfit", "Inter", system-ui, -apple-system, sans-serif';

export { TEMAS_MESA, temaDaMesa, type TemaMesa } from '../temas';
import type { TemaMesa } from '../temas';

function criarCanvas(largura: number, altura: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  return canvas;
}

function contexto(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para gerar as texturas das cartas.');
  return ctx;
}

function retanguloArredondado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  largura: number,
  altura: number,
  raio: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + raio, y);
  ctx.arcTo(x + largura, y, x + largura, y + altura, raio);
  ctx.arcTo(x + largura, y + altura, x, y + altura, raio);
  ctx.arcTo(x, y + altura, x, y, raio);
  ctx.arcTo(x, y, x + largura, y, raio);
  ctx.closePath();
}

function clarear(hex: string, fator: number): string {
  const valor = Number.parseInt(hex.slice(1), 16);
  const canal = (deslocamento: number): number => {
    const base = (valor >> deslocamento) & 0xff;
    return Math.round(base + (255 - base) * fator);
  };
  return `rgb(${canal(16)}, ${canal(8)}, ${canal(0)})`;
}

function texto(
  ctx: CanvasRenderingContext2D,
  conteudo: string,
  x: number,
  y: number,
  tamanho: number,
  contorno: number,
): void {
  ctx.font = `900 ${tamanho}px ${FONTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = contorno;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeText(conteudo, x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(conteudo, x, y);
}

function desenharMoldura(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LARGURA, ALTURA);
}

function desenharFaceGerada(ctx: CanvasRenderingContext2D, carta: Carta): void {
  const info = PALETA_CORES[carta.cor] ?? PALETA_CORES.NEUTRO;
  const simbolo = simboloDaCarta(carta);
  desenharMoldura(ctx);

  // Miolo colorido com borda branca grossa (estilo party game).
  const margem = 14;
  retanguloArredondado(ctx, margem, margem, LARGURA - margem * 2, ALTURA - margem * 2, 22);
  if (carta.cor === 'NEUTRO') {
    const gradiente = ctx.createLinearGradient(0, 0, LARGURA, ALTURA);
    gradiente.addColorStop(0, '#ff007a');
    gradiente.addColorStop(0.5, '#7928ca');
    gradiente.addColorStop(1, '#00dfd8');
    ctx.fillStyle = gradiente;
  } else {
    const gradiente = ctx.createLinearGradient(0, 0, 0, ALTURA);
    gradiente.addColorStop(0, clarear(info.hex, 0.18));
    gradiente.addColorStop(1, info.hex);
    ctx.fillStyle = gradiente;
  }
  ctx.fill();

  // Oval central inclinada.
  ctx.save();
  ctx.translate(LARGURA / 2, ALTURA / 2);
  ctx.rotate(-0.42);
  ctx.beginPath();
  ctx.ellipse(0, 0, 86, 136, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fill();
  ctx.restore();

  const tamanhoCentral = simbolo.length > 1 ? 118 : 168;
  texto(ctx, simbolo, LARGURA / 2, ALTURA / 2 + 6, tamanhoCentral, 14);

  // Índices nos cantos + símbolo acessível da cor (não depende só da cor).
  const tamanhoCanto = simbolo.length > 1 ? 30 : 38;
  texto(ctx, simbolo, 44, 48, tamanhoCanto, 7);
  texto(ctx, info.simboloAcessivel, 44, 86, 22, 5);
  ctx.save();
  ctx.translate(LARGURA - 44, ALTURA - 48);
  ctx.rotate(Math.PI);
  texto(ctx, simbolo, 0, 0, tamanhoCanto, 7);
  texto(ctx, info.simboloAcessivel, 0, 38, 22, 5);
  ctx.restore();
}

function desenharArte(
  ctx: CanvasRenderingContext2D,
  imagem: HTMLImageElement,
  simbolo: string | undefined,
): void {
  desenharMoldura(ctx);
  const margem = 10;
  ctx.save();
  retanguloArredondado(ctx, margem, margem, LARGURA - margem * 2, ALTURA - margem * 2, 22);
  ctx.clip();
  // Preenche (cover) mantendo a proporção da arte.
  const escala = Math.max(
    (LARGURA - margem * 2) / imagem.naturalWidth,
    (ALTURA - margem * 2) / imagem.naturalHeight,
  );
  const largura = imagem.naturalWidth * escala;
  const altura = imagem.naturalHeight * escala;
  ctx.drawImage(imagem, (LARGURA - largura) / 2, (ALTURA - altura) / 2, largura, altura);
  ctx.restore();
  if (simbolo) texto(ctx, simbolo, 44, 46, simbolo.length > 1 ? 28 : 36, 7);
}

function desenharVersoProvisorio(ctx: CanvasRenderingContext2D): void {
  desenharMoldura(ctx);
  retanguloArredondado(ctx, 12, 12, LARGURA - 24, ALTURA - 24, 22);
  const gradiente = ctx.createLinearGradient(0, 0, LARGURA, ALTURA);
  gradiente.addColorStop(0, '#1e3a8a');
  gradiente.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradiente;
  ctx.fill();
  texto(ctx, 'K', LARGURA / 2, ALTURA / 2, 150, 12);
}

/** Cache de texturas da cena. Uma instância por cena; `destruir()` libera a GPU. */
export class BancoDeTexturas {
  private readonly faces = new Map<string, CanvasTexture>();
  private readonly avulsas = new Set<CanvasTexture>();
  private verso: CanvasTexture | undefined;
  private destruido = false;

  constructor(
    private readonly anisotropia: number,
    /** Chamado quando uma arte assíncrona termina de carregar (pede um novo quadro). */
    private readonly aoAtualizar: () => void,
  ) {}

  private registrar(canvas: HTMLCanvasElement): CanvasTexture {
    const textura = new CanvasTexture(canvas);
    textura.colorSpace = SRGBColorSpace;
    textura.anisotropy = this.anisotropia;
    textura.minFilter = LinearMipmapLinearFilter;
    textura.magFilter = LinearFilter;
    textura.generateMipmaps = true;
    return textura;
  }

  private carregarImagem(src: string, aoCarregar: (imagem: HTMLImageElement) => void): void {
    const imagem = new Image();
    imagem.decoding = 'async';
    imagem.onload = () => {
      if (this.destruido || imagem.naturalWidth === 0) return;
      aoCarregar(imagem);
      this.aoAtualizar();
    };
    imagem.src = src;
  }

  face(carta: Carta): CanvasTexture {
    const chave = chaveDaFace(carta);
    const existente = this.faces.get(chave);
    if (existente) return existente;

    const canvas = criarCanvas(LARGURA, ALTURA);
    const ctx = contexto(canvas);
    desenharFaceGerada(ctx, carta);
    const textura = this.registrar(canvas);
    this.faces.set(chave, textura);

    const visual = getCardVisual(carta);
    if (visual.kind === 'asset') {
      this.carregarImagem(visual.src, (imagem) => {
        desenharArte(ctx, imagem, simboloDaCarta(carta));
        textura.needsUpdate = true;
      });
    }
    return textura;
  }

  versoDaCarta(): CanvasTexture {
    if (this.verso) return this.verso;
    const canvas = criarCanvas(LARGURA, ALTURA);
    const ctx = contexto(canvas);
    desenharVersoProvisorio(ctx);
    const textura = this.registrar(canvas);
    this.verso = textura;
    this.carregarImagem(CARD_BACK_ASSET, (imagem) => {
      desenharArte(ctx, imagem, undefined);
      textura.needsUpdate = true;
    });
    return textura;
  }

  /** Tampo da mesa: feltro com gradiente radial, aro e marcação central. */
  tampo(tema: TemaMesa): CanvasTexture {
    const tamanho = 1024;
    const canvas = criarCanvas(tamanho, tamanho);
    const ctx = contexto(canvas);
    const centro = tamanho / 2;
    const gradiente = ctx.createRadialGradient(centro, centro, 40, centro, centro, centro);
    gradiente.addColorStop(0, clarear(tema.feltro, 0.22));
    gradiente.addColorStop(0.62, tema.feltro);
    gradiente.addColorStop(1, tema.feltroBorda);
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, tamanho, tamanho);

    // Textura de feltro: pontilhado leve e determinístico.
    let semente = 20260727;
    const aleatorio = (): number => {
      semente = (semente * 1664525 + 1013904223) % 4294967296;
      return semente / 4294967296;
    };
    for (let i = 0; i < 5200; i += 1) {
      ctx.fillStyle = aleatorio() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(aleatorio() * tamanho, aleatorio() * tamanho, 2, 2);
    }

    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(centro, centro, centro * 0.36, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 26;
    ctx.strokeStyle = tema.aro;
    ctx.beginPath();
    ctx.arc(centro, centro, centro - 15, 0, Math.PI * 2);
    ctx.stroke();

    const textura = this.registrar(canvas);
    this.avulsas.add(textura);
    return textura;
  }

  /** Anel com setas que indica o sentido do jogo (gira na direção da vez). */
  anelDeSentido(): CanvasTexture {
    const tamanho = 512;
    const canvas = criarCanvas(tamanho, tamanho);
    const ctx = contexto(canvas);
    const centro = tamanho / 2;
    const raio = centro - 34;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    const setas = 3;
    for (let i = 0; i < setas; i += 1) {
      const inicio = (i * Math.PI * 2) / setas;
      const fim = inicio + (Math.PI * 2) / setas - 0.55;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(centro, centro, raio, inicio, fim);
      ctx.stroke();
      // Ponta da seta no fim do arco (sentido horário no canvas).
      const px = centro + Math.cos(fim) * raio;
      const py = centro + Math.sin(fim) * raio;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(fim + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(30, 0);
      ctx.lineTo(-10, -26);
      ctx.lineTo(-10, 26);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const textura = this.registrar(canvas);
    this.avulsas.add(textura);
    return textura;
  }

  /** Mancha suave usada como sombra de contato e como brilho de vez. */
  mancha(): CanvasTexture {
    const tamanho = 128;
    const canvas = criarCanvas(tamanho, tamanho);
    const ctx = contexto(canvas);
    const centro = tamanho / 2;
    const gradiente = ctx.createRadialGradient(centro, centro, 4, centro, centro, centro);
    gradiente.addColorStop(0, 'rgba(255,255,255,1)');
    gradiente.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    gradiente.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, tamanho, tamanho);
    const textura = this.registrar(canvas);
    this.avulsas.add(textura);
    return textura;
  }

  /** Cria a textura de uma plaqueta (nome do jogador); o dono redesenha e libera. */
  criarPlaqueta(): { textura: CanvasTexture; canvas: HTMLCanvasElement } {
    const canvas = criarCanvas(384, 128);
    const textura = this.registrar(canvas);
    this.avulsas.add(textura);
    return { textura, canvas };
  }

  liberar(textura: CanvasTexture): void {
    if (this.avulsas.delete(textura)) textura.dispose();
  }

  destruir(): void {
    this.destruido = true;
    for (const textura of this.faces.values()) textura.dispose();
    for (const textura of this.avulsas) textura.dispose();
    this.verso?.dispose();
    this.faces.clear();
    this.avulsas.clear();
    this.verso = undefined;
  }
}

export interface DadosPlaqueta {
  nome: string;
  avatar: string;
  quantidadeCartas: number;
  naVez: boolean;
  conectado: boolean;
  /** Por que um bot joga neste assento, em texto curto. */
  situacao?: string | undefined;
  /** Desenho do avatar já carregado; sem ele, vai o emoji. */
  imagem?: HTMLImageElement | undefined;
  destaque: string;
}

/** Desenha a plaqueta de um adversário: avatar, nome e contador de cartas. */
export function desenharPlaqueta(canvas: HTMLCanvasElement, dados: DadosPlaqueta): void {
  const ctx = contexto(canvas);
  const { width: largura, height: altura } = canvas;
  ctx.clearRect(0, 0, largura, altura);

  retanguloArredondado(ctx, 6, 14, largura - 12, altura - 28, 50);
  ctx.fillStyle = dados.naVez ? 'rgba(15, 23, 42, 0.96)' : 'rgba(15, 23, 42, 0.78)';
  ctx.fill();
  ctx.lineWidth = dados.naVez ? 8 : 3;
  ctx.strokeStyle = dados.naVez ? dados.destaque : 'rgba(255, 255, 255, 0.28)';
  ctx.stroke();

  // Avatar (emoji) num disco claro.
  ctx.beginPath();
  ctx.arc(64, altura / 2, 38, 0, Math.PI * 2);
  ctx.fillStyle = dados.conectado ? '#f8fafc' : '#64748b';
  ctx.fill();
  ctx.font = `48px ${FONTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f172a';
  if (dados.imagem) {
    ctx.globalAlpha = dados.conectado ? 1 : 0.45;
    ctx.drawImage(dados.imagem, 28, altura / 2 - 36, 72, 72);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillText(emojiDoAvatar(dados.avatar), 64, altura / 2 + 4);
  }

  // Nome (cortado para caber).
  ctx.font = `800 34px ${FONTE}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = dados.conectado ? '#ffffff' : '#94a3b8';
  let nome = dados.nome;
  const larguraMaxima = largura - 214;
  while (nome.length > 1 && ctx.measureText(nome).width > larguraMaxima) {
    nome = `${nome.slice(0, -2)}…`;
  }
  ctx.fillText(nome, 116, altura / 2 + (dados.situacao ? -14 : 2));
  if (dados.situacao) {
    ctx.font = `700 21px ${FONTE}`;
    ctx.fillStyle = '#fde68a';
    ctx.fillText(dados.situacao, 116, altura / 2 + 20, larguraMaxima);
  }

  // Contador de cartas.
  retanguloArredondado(ctx, largura - 96, altura / 2 - 30, 74, 60, 18);
  ctx.fillStyle = dados.quantidadeCartas <= 1 ? '#ef4444' : dados.destaque;
  ctx.fill();
  ctx.font = `900 38px ${FONTE}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`${dados.quantidadeCartas}`, largura - 59, altura / 2 + 3);
}
