/**
 * Cena 3D da mesa (Three.js puro, sem framework de render declarativo).
 *
 * A cena é só apresentação: recebe um instantâneo do estado público + mão
 * local (`atualizar`) e anima a diferença. Ela nunca decide jogada; quando o
 * jogador solta uma carta no centro ou toca no monte, apenas avisa a mesa
 * pelos callbacks de `EventosCena`.
 *
 * Orçamento de performance (ADR-014):
 * - uma geometria de carta compartilhada; adversários em UM InstancedMesh;
 * - texturas de face em cache por chave (uma por face, não por carta);
 * - nada de geometria/material novo por quadro; a contagem do Corta-Frente é
 *   um uniforme de shader;
 * - pixel ratio limitado a 2 e reduzido sozinho se os quadros ficarem lentos;
 * - o quadro só é redesenhado quando algo se move;
 * - `destruir()` libera geometrias, materiais, texturas e o contexto.
 */
import {
  AdditiveBlending,
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type CanvasTexture,
  type Material,
  type ShaderMaterial,
} from 'three';
import type { Carta } from '@kabemjunto/shared';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import {
  calcularLeque,
  chaveDaFace,
  classificarGesto,
  estaNaZonaDeSoltura,
  posicoesAssentos,
  RAIO_ZONA_DE_SOLTURA,
  type SituacaoCarta,
} from '../interacao';
import type { CorJogavel } from '../tipos';
import {
  ALTURA_CARTA,
  criarGeometriaBrilho,
  criarGeometriaCarta,
  criarMaterialDeContagem,
  ESPESSURA_CARTA,
} from './geometria';
import {
  DISTANCIA_MINIMA_DO_POUSO,
  DURACAO_ASSENTADA,
  curvaDaAssentada,
  sombraDeVoo,
} from './assentada';
import { BancoDeTexturas, desenharPlaqueta, type TemaMesa } from './texturas';

// ─── Contratos ──────────────────────────────────────────────────────────────

export interface CartaDaMao {
  carta: Carta;
  situacao: SituacaoCarta;
  selecionada: boolean;
}

export interface AdversarioCena {
  id: string;
  nome: string;
  avatar: string;
  quantidadeCartas: number;
  conectado: boolean;
  naVez: boolean;
}

export interface InstantaneoCena {
  mao: ReadonlyArray<CartaDaMao>;
  topo: Carta;
  corAtiva: CorJogavel;
  sentido: 1 | -1;
  quantidadeMonte: number;
  podeComprar: boolean;
  minhaVez: boolean;
  adversarios: ReadonlyArray<AdversarioCena>;
  /** Cartas soltas no centro que aguardam cor, alvo ou resposta do servidor. */
  pendentes: ReadonlyArray<string>;
  /** Carta com foco de teclado (vem da camada acessível). */
  cartaEmFocoId?: string | undefined;
  /** De quem saiu a carta do topo, para o voo partir do assento certo. */
  quemJogouId?: string | undefined;
  /** Corta-Frente: instante (epoch ms) em que a janela fecha. */
  fechaInterceptacaoEm?: number | undefined;
}

export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/** Posições em pixels CSS, para a camada DOM (acessibilidade, balões, alvos). */
export interface LayoutProjetado {
  cartas: Record<string, Retangulo>;
  assentos: Record<string, { x: number; y: number }>;
  monte: Retangulo;
  descarte: Retangulo;
}

export interface EventosCena {
  aoSoltarNoCentro: (cartaId: string) => void;
  aoTocarCarta: (cartaId: string) => void;
  aoTocarMonte: () => void;
  aoTocarCentro: () => void;
  aoProjetar: (layout: LayoutProjetado) => void;
  aoPerderContexto: () => void;
}

export interface OpcoesCena {
  tema: TemaMesa;
  movimentoReduzido: boolean;
  /** Pop e sombra ao pousar no descarte (opção `?peso=1`; desligada por padrão). */
  pesoDasCartas: boolean;
}

export interface EstatisticasCena {
  quadrosDesenhados: number;
  fps: number;
  chamadasDeDesenho: number;
  triangulos: number;
  pixelRatio: number;
  /** Alguma carta ainda está em movimento (voo, leque, tremor). */
  cartasAnimando: boolean;
  /** Sombras de voo em uso; volta a 0 quando as cartas param. */
  sombrasDeVoo: number;
  /** Diagnóstico: quais cartas se movem e quanto falta (posição, ângulo, escala). */
  movimentos: string[];
}

// ─── Constantes de cena ─────────────────────────────────────────────────────

const FOV = 42;
const ELEVACAO = (55 * Math.PI) / 180;
const ALVO_CAMERA = new Vector3(0, 0, 1.05);
const DISTANCIA_MAO = 6;
const POS_MONTE = new Vector3(-0.98, 0, 0);
const POS_DESCARTE = new Vector3(0.98, 0, 0);
const ESCALA_NA_MESA = 1.22;
const RAIO_TAMPO = 6.6;
/** Só o topo (e um pouco das de baixo) aparece; guardar mais só custa desenho. */
const MAXIMO_NO_DESCARTE = 4;
const MAXIMO_POR_ADVERSARIO = 7;
const CAPACIDADE_INSTANCIAS = 9 * MAXIMO_POR_ADVERSARIO;
const CIMA = new Vector3(0, 1, 0);
const EIXO_X = new Vector3(1, 0, 0);
/** Sombras de voo (peso das cartas): quantas cartas podem ter sombra ao mesmo tempo. */
const SOMBRAS_DE_VOO = 6;
const LARGURA_DA_SOMBRA = 1.7;
const ALTURA_DA_SOMBRA = 2;
const Y_DA_SOMBRA = 0.012;
const PLANO_DA_MESA = new Plane(CIMA, 0);
const BRANCO = new Color('#ffffff');

type LocalDaCarta = 'mao' | 'descarte' | 'saindo';

interface SombraDeCarta {
  malha: Mesh;
  material: MeshBasicMaterial;
}

interface ObjetoCarta {
  id: string;
  malha: Mesh;
  frente: MeshBasicMaterial | undefined;
  brilho: Mesh | undefined;
  materialBrilho: MeshBasicMaterial | undefined;
  /** Posição "no chão" do movimento; a malha soma o arco do voo a ela. */
  base: Vector3;
  alvoPos: Vector3;
  alvoQuat: Quaternion;
  alvoEscala: number;
  rigidez: number;
  atraso: number;
  vooDistancia: number;
  vooAltura: number;
  local: LocalDaCarta;
  removerAoChegar: boolean;
  tom: number;
  alvoTom: number;
  alvoBrilho: number;
  corBrilho: Color;
  pulsar: boolean;
  tremor: number;
  /** Veio voar até o descarte: ganha pouso (pop e sombra) quando parar. */
  pousoPendente: boolean;
  /** Segundos que faltam da acomodação depois do pouso (0 = parada). */
  assentar: number;
  /** Sombra emprestada da reserva enquanto a carta voa e pousa. */
  sombra: SombraDeCarta | undefined;
}

interface AssentoCena {
  id: string;
  posicao: Vector3;
  guinada: number;
  plaqueta: Sprite;
  material: SpriteMaterial;
  textura: CanvasTexture;
  canvas: HTMLCanvasElement;
  assinatura: string;
  quantidade: number;
}

interface GestoAtivo {
  ponteiroId: number;
  tipoPonteiro: string;
  alvo: 'carta' | 'monte' | 'centro';
  cartaId: string | undefined;
  x0: number;
  y0: number;
  arrastando: boolean;
  varreu: boolean;
}

function hashDeTexto(texto: string): number {
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

export class CenaMesa {
  private readonly renderizador: WebGLRenderer;
  private readonly cena = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  private readonly raio = new Raycaster();
  private readonly texturas: BancoDeTexturas;

  private readonly geometriaCarta: BufferGeometry;
  private readonly geometriaBrilho: BufferGeometry;
  private readonly geometriaPlano = new PlaneGeometry(1, 1);
  private readonly materialVerso: MeshBasicMaterial;
  private readonly descartaveis: Array<{ dispose: () => void }> = [];

  private readonly objetos = new Map<string, ObjetoCarta>();
  private maoIds: string[] = [];
  private descarteIds: string[] = [];
  private readonly assentos = new Map<string, AssentoCena>();
  private ordemAssentos: string[] = [];

  private readonly monte: Mesh;
  private readonly brilhoMonte: Mesh;
  private readonly materialBrilhoMonte: MeshBasicMaterial;
  private readonly versosAdversarios: InstancedMesh;
  private readonly anelSentido: Mesh;
  private readonly materialAnelSentido: MeshBasicMaterial;
  private readonly discoCor: Mesh;
  private readonly materialDiscoCor: MeshBasicMaterial;
  private readonly zonaSoltura: Mesh;
  private readonly materialZona: MeshBasicMaterial;
  private readonly brilhoVez: Mesh;
  private readonly materialBrilhoVez: MeshBasicMaterial;
  private readonly anelContagem: Mesh;
  private readonly materialContagem: ShaderMaterial;
  private readonly sombraArrasto: Mesh;
  private readonly materialSombra: MeshBasicMaterial;
  private readonly reservaDeSombras: SombraDeCarta[] = [];
  private sombrasEmUso = 0;

  private instantaneo: InstantaneoCena | undefined;
  private largura = 1;
  private altura = 1;
  private pixelRatio = 1;
  /** Teto do pixel ratio: começa em 2 e só desce (aparelho lento). */
  private tetoPixelRatio = 2;
  private meiaAlturaMao = 1;
  private meiaLarguraMao = 1;
  private larguraCartaMao = 1;
  private raioAssentosX = 4;
  private raioAssentosLonge = 4;
  private escalaAdversario = 0.6;
  private escalaPlaqueta = 1;

  private gesto: GestoAtivo | undefined;
  private focoPonteiroId: string | undefined;
  private readonly ponteiro = new Vector2();
  private sobreZona = false;
  private readonly soltas = new Set<string>();
  private centrosNaTela: Array<{ id: string; x: number }> = [];

  private janelaFechaEm: number | undefined;
  private janelaDuracao = 1;
  private sequenciaFantasma = 0;

  private animacao = 0;
  private ultimoInstante = 0;
  private tempo = 0;
  private sujo = true;
  private destruida = false;
  private quadrosDesenhados = 0;
  private cartasAnimando = true;
  private fps = 60;
  private amostrasLentas = 0;
  private amostras = 0;
  private tempoDeAmostra = 0;

  private readonly aux = new Object3D();
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly q1 = new Quaternion();
  private readonly m1 = new Matrix4();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly eventos: EventosCena,
    private readonly opcoes: OpcoesCena,
  ) {
    this.renderizador = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderizador.setClearColor(0x000000, 0);
    this.texturas = new BancoDeTexturas(
      Math.min(4, this.renderizador.capabilities.getMaxAnisotropy()),
      () => this.marcarSujo(),
    );

    this.geometriaCarta = criarGeometriaCarta();
    this.geometriaBrilho = criarGeometriaBrilho();
    // Faces sem iluminação: a arte aparece com a cor exata e o escurecimento das
    // cartas bloqueadas fica visível (luz forte saturava a cor).
    this.materialVerso = new MeshBasicMaterial({ map: this.texturas.versoDaCarta() });
    this.descartaveis.push(
      this.geometriaCarta,
      this.geometriaBrilho,
      this.geometriaPlano,
      this.materialVerso,
    );

    this.cena.add(new AmbientLight(0xffffff, 2.1));
    const sol = new DirectionalLight(0xffffff, 1.5);
    sol.position.set(-3, 9, 5);
    this.cena.add(sol);

    // Tampo.
    const geometriaTampo = new CircleGeometry(RAIO_TAMPO, 72);
    const materialTampo = new MeshLambertMaterial({ map: this.texturas.tampo(opcoes.tema) });
    const tampo = new Mesh(geometriaTampo, materialTampo);
    tampo.rotation.x = -Math.PI / 2;
    tampo.position.y = -0.01;
    this.cena.add(tampo);
    this.descartaveis.push(geometriaTampo, materialTampo);

    const mancha = this.texturas.mancha();
    const criarMancha = (cor: string, aditiva: boolean): [Mesh, MeshBasicMaterial] => {
      const material = new MeshBasicMaterial({
        map: mancha,
        color: new Color(cor),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        ...(aditiva ? { blending: AdditiveBlending } : {}),
      });
      const malha = new Mesh(this.geometriaPlano, material);
      malha.rotation.x = -Math.PI / 2;
      this.descartaveis.push(material);
      this.cena.add(malha);
      return [malha, material];
    };

    // Disco da cor ativa, embaixo do descarte.
    [this.discoCor, this.materialDiscoCor] = criarMancha('#ffffff', false);
    this.discoCor.position.set(POS_DESCARTE.x, 0.004, POS_DESCARTE.z);
    this.discoCor.scale.setScalar(4.4);
    this.materialDiscoCor.opacity = 0.9;

    // Zona de soltura (aparece durante o arrasto).
    [this.zonaSoltura, this.materialZona] = criarMancha(opcoes.tema.destaque, true);
    this.zonaSoltura.position.set(0, 0.006, 0);
    this.zonaSoltura.scale.setScalar(RAIO_ZONA_DE_SOLTURA * 2.5);

    // Brilho de quem está na vez.
    [this.brilhoVez, this.materialBrilhoVez] = criarMancha(opcoes.tema.destaque, true);
    this.brilhoVez.position.y = 0.008;

    // Brilho do monte quando comprar é a jogada disponível.
    [this.brilhoMonte, this.materialBrilhoMonte] = criarMancha(opcoes.tema.destaque, true);
    this.brilhoMonte.position.set(POS_MONTE.x, 0.007, POS_MONTE.z);
    this.brilhoMonte.scale.setScalar(4.2);

    // Sombra da carta arrastada.
    [this.sombraArrasto, this.materialSombra] = criarMancha('#000000', false);
    this.sombraArrasto.position.y = 0.012;
    this.sombraArrasto.scale.set(1.9, 2.5, 1);

    // Sombras das cartas em voo (só usadas com o peso das cartas ligado).
    if (opcoes.pesoDasCartas && !opcoes.movimentoReduzido) {
      for (let i = 0; i < SOMBRAS_DE_VOO; i += 1) {
        const [malha, material] = criarMancha('#000000', false);
        malha.visible = false;
        malha.position.y = Y_DA_SOMBRA;
        this.reservaDeSombras.push({ malha, material });
      }
    }

    // Anel de sentido, na cor ativa.
    this.materialAnelSentido = new MeshBasicMaterial({
      map: this.texturas.anelDeSentido(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: DoubleSide,
    });
    this.anelSentido = new Mesh(this.geometriaPlano, this.materialAnelSentido);
    this.anelSentido.rotation.x = -Math.PI / 2;
    this.anelSentido.position.y = 0.01;
    this.anelSentido.scale.setScalar(5.6);
    this.cena.add(this.anelSentido);
    this.descartaveis.push(this.materialAnelSentido);

    // Anel de contagem do Corta-Frente.
    this.materialContagem = criarMaterialDeContagem();
    this.anelContagem = new Mesh(this.geometriaPlano, this.materialContagem);
    this.anelContagem.rotation.x = -Math.PI / 2;
    this.anelContagem.position.set(POS_DESCARTE.x, 0.3, POS_DESCARTE.z);
    this.anelContagem.scale.setScalar(2.9);
    this.anelContagem.visible = false;
    this.cena.add(this.anelContagem);
    this.descartaveis.push(this.materialContagem);

    // Monte de compra.
    this.monte = new Mesh(this.geometriaCarta, [this.materialVerso, this.materialVerso]);
    this.monte.rotation.set(Math.PI / 2, 0.06, 0, 'YXZ');
    this.monte.position.copy(POS_MONTE);
    this.cena.add(this.monte);

    // Cartas dos adversários: um único InstancedMesh.
    // Materiais próprios: se um material alterna entre malha instanciada e
    // comum, o Three.js troca de shader a cada desenho (custava ~60% da CPU).
    const versoInstanciado = this.materialVerso.clone();
    this.descartaveis.push(versoInstanciado);
    this.versosAdversarios = new InstancedMesh(
      this.geometriaCarta,
      [versoInstanciado, versoInstanciado],
      CAPACIDADE_INSTANCIAS,
    );
    this.versosAdversarios.count = 0;
    this.versosAdversarios.frustumCulled = false;
    this.cena.add(this.versosAdversarios);

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.aoApertar);
    canvas.addEventListener('pointermove', this.aoMover);
    canvas.addEventListener('pointerup', this.aoSoltar);
    canvas.addEventListener('pointercancel', this.aoCancelar);
    canvas.addEventListener('pointerleave', this.aoSair);
    canvas.addEventListener('webglcontextlost', this.aoPerderContexto);

    this.ultimoInstante = performance.now();
    this.animacao = requestAnimationFrame(this.quadro);
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  redimensionar(largura: number, altura: number, devicePixelRatio: number): void {
    if (this.destruida || largura <= 0 || altura <= 0) return;
    this.largura = largura;
    this.altura = altura;
    this.pixelRatio = Math.min(this.tetoPixelRatio, Math.max(1, devicePixelRatio));
    this.renderizador.setPixelRatio(this.pixelRatio);
    this.renderizador.setSize(largura, altura, false);

    const aspecto = largura / altura;
    const tangente = Math.tan((FOV * Math.PI) / 360);
    const distancia = Math.min(17.5, Math.max(11.2, 3.1 / (tangente * aspecto)));
    this.camera.aspect = aspecto;
    this.camera.position.set(
      ALVO_CAMERA.x,
      ALVO_CAMERA.y + Math.sin(ELEVACAO) * distancia,
      ALVO_CAMERA.z + Math.cos(ELEVACAO) * distancia,
    );
    this.camera.lookAt(ALVO_CAMERA);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);

    this.meiaAlturaMao = DISTANCIA_MAO * tangente;
    this.meiaLarguraMao = this.meiaAlturaMao * aspecto;
    this.larguraCartaMao = Math.min(this.meiaLarguraMao * 0.5, this.meiaAlturaMao * 0.36);

    // Onde cabem os assentos: projeta a borda útil da tela sobre a mesa.
    const lateral = this.pontoNaMesa(-0.74, 0.12);
    const fundo = this.pontoNaMesa(0, 0.6);
    this.raioAssentosX = Math.min(4.9, Math.max(1.9, Math.abs(lateral?.x ?? 4)));
    this.raioAssentosLonge = Math.min(4.3, Math.max(2.6, Math.abs(fundo?.z ?? 4)));

    if (this.instantaneo) this.aplicar(this.instantaneo, true);
    this.marcarSujo();
  }

  atualizar(instantaneo: InstantaneoCena): void {
    if (this.destruida) return;
    this.aplicar(instantaneo, false);
    this.instantaneo = instantaneo;
    this.marcarSujo();
  }

  /**
   * Pré-gera as faces do baralho em tempo ocioso e já as envia à GPU, para
   * nenhuma jogada pagar o desenho da face (canvas + upload) na hora.
   */
  aquecerFaces(cartas: ReadonlyArray<Carta>): void {
    const fila = [...new Map(cartas.map((carta) => [chaveDaFace(carta), carta])).values()];
    const agendar = (passo: (prazo: IdleDeadline) => void): void => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(passo, { timeout: 2000 });
      } else {
        window.setTimeout(() => passo({ didTimeout: true, timeRemaining: () => 6 }), 50);
      }
    };
    const passo = (prazo: IdleDeadline): void => {
      if (this.destruida) return;
      let feitas = 0;
      while (fila.length > 0 && (prazo.timeRemaining() > 4 || (prazo.didTimeout && feitas === 0))) {
        const carta = fila.shift();
        if (carta) this.renderizador.initTexture(this.texturas.face(carta));
        feitas += 1;
      }
      if (fila.length > 0) agendar(passo);
    };
    agendar(passo);
  }

  estatisticas(): EstatisticasCena {
    return {
      quadrosDesenhados: this.quadrosDesenhados,
      fps: Math.round(this.fps * 10) / 10,
      chamadasDeDesenho: this.renderizador.info.render.calls,
      triangulos: this.renderizador.info.render.triangles,
      pixelRatio: this.pixelRatio,
      cartasAnimando: this.cartasAnimando,
      sombrasDeVoo: this.sombrasEmUso,
      movimentos: [...this.objetos.values()]
        .map((objeto) => {
          const distancia = objeto.base.distanceTo(objeto.alvoPos);
          const angulo = objeto.malha.quaternion.angleTo(objeto.alvoQuat);
          const escala = Math.abs(objeto.malha.scale.x - objeto.alvoEscala);
          return { objeto, distancia, angulo, escala };
        })
        .filter(
          ({ objeto, distancia, angulo, escala }) =>
            objeto.atraso > 0 || distancia > 0.002 || angulo > 0.004 || escala > 0.002,
        )
        .map(
          ({ objeto, distancia, angulo, escala }) =>
            `${objeto.id} ${objeto.local} d=${distancia.toFixed(3)} a=${angulo.toFixed(3)} e=${escala.toFixed(3)} atraso=${objeto.atraso.toFixed(2)}`,
        ),
    };
  }

  destruir(): void {
    if (this.destruida) return;
    this.destruida = true;
    cancelAnimationFrame(this.animacao);
    const canvas = this.canvas;
    canvas.removeEventListener('pointerdown', this.aoApertar);
    canvas.removeEventListener('pointermove', this.aoMover);
    canvas.removeEventListener('pointerup', this.aoSoltar);
    canvas.removeEventListener('pointercancel', this.aoCancelar);
    canvas.removeEventListener('pointerleave', this.aoSair);
    canvas.removeEventListener('webglcontextlost', this.aoPerderContexto);
    for (const objeto of this.objetos.values()) this.liberarObjeto(objeto);
    this.objetos.clear();
    for (const assento of this.assentos.values()) this.liberarAssento(assento);
    this.assentos.clear();
    this.versosAdversarios.dispose();
    for (const item of this.descartaveis) item.dispose();
    this.texturas.destruir();
    this.renderizador.dispose();
  }

  // ─── Sincronização com o estado ───────────────────────────────────────────

  private aplicar(inst: InstantaneoCena, soLayout: boolean): void {
    const anterior = this.instantaneo;
    const primeiraVez = anterior === undefined;
    this.atualizarAssentos(inst, anterior, soLayout || primeiraVez);
    if (!soLayout) this.sincronizarCartas(inst, anterior);
    this.posicionarMao(inst);
    this.posicionarDescarte();
    this.atualizarMesa(inst);
    this.projetar(inst);
  }

  private sincronizarCartas(inst: InstantaneoCena, anterior: InstantaneoCena | undefined): void {
    const novosIds = inst.mao.map((item) => item.carta.id);
    const novos = new Set(novosIds);
    const antigos = new Set(this.maoIds);
    const removidos = this.maoIds.filter((id) => !novos.has(id));
    const adicionados = inst.mao.filter((item) => !antigos.has(item.carta.id));
    const topoMudou = anterior === undefined || anterior.topo.id !== inst.topo.id;
    const jogueiOTopo = topoMudou && removidos.includes(inst.topo.id);
    // Troca/Gira Mão: as cartas que saem não foram jogadas, mudaram de dono.
    const redistribuiu =
      topoMudou && (inst.topo.acao === 'TROCA_MAO' || inst.topo.acao === 'GIRA_MAO');
    const trocaDeMao = redistribuiu || (removidos.length > 0 && !jogueiOTopo);

    // Cartas que saíram da mão.
    for (const id of removidos) {
      const objeto = this.objetos.get(id);
      if (!objeto) continue;
      this.soltas.delete(id);
      this.definirBrilho(objeto, 0, false);
      objeto.alvoTom = 0;
      if (jogueiOTopo && (id === inst.topo.id || !redistribuiu)) {
        objeto.local = 'descarte';
        if (id !== inst.topo.id) this.descarteIds.push(id);
      } else {
        // Troca/Gira Mão: a mão antiga vai para o centro e some.
        objeto.local = 'saindo';
        this.cancelarPouso(objeto);
        objeto.removerAoChegar = true;
        objeto.alvoEscala = 0.2;
        this.voar(objeto, new Vector3(0, 0.7, 0), this.orientacaoNaMesa(true, 0), 9);
      }
    }

    // Topo do descarte.
    if (topoMudou) {
      let objetoTopo = this.objetos.get(inst.topo.id);
      if (!objetoTopo) {
        objetoTopo = this.criarObjeto(inst.topo.id, inst.topo);
        const origem = inst.quemJogouId ? this.assentos.get(inst.quemJogouId) : undefined;
        if (anterior === undefined) {
          objetoTopo.base.copy(POS_DESCARTE).setY(0.05);
          objetoTopo.malha.quaternion.copy(this.orientacaoNaMesa(true, 0));
        } else if (origem) {
          objetoTopo.base.copy(origem.posicao).setY(0.25);
          objetoTopo.malha.quaternion.copy(this.orientacaoNaMesa(false, origem.guinada));
          objetoTopo.malha.scale.setScalar(this.escalaAdversario);
        } else {
          objetoTopo.base.copy(POS_MONTE).setY(this.monte.position.y * 2 + 0.05);
          objetoTopo.malha.quaternion.copy(this.orientacaoNaMesa(false, 0));
        }
        objetoTopo.malha.position.copy(objetoTopo.base);
      }
      objetoTopo.local = 'descarte';
      objetoTopo.removerAoChegar = false;
      this.descarteIds = this.descarteIds.filter((id) => id !== inst.topo.id);
      this.descarteIds.push(inst.topo.id);
      while (this.descarteIds.length > MAXIMO_NO_DESCARTE) {
        const antigo = this.descarteIds.shift();
        const objetoAntigo = antigo ? this.objetos.get(antigo) : undefined;
        if (objetoAntigo) this.removerObjeto(objetoAntigo);
      }
    }

    // Cartas que chegaram à mão: saem do monte (ou do centro, numa troca de mão).
    adicionados.forEach((item, indice) => {
      if (this.objetos.has(item.carta.id)) {
        const existente = this.objetos.get(item.carta.id)!;
        existente.local = 'mao';
        this.cancelarPouso(existente);
        existente.removerAoChegar = false;
        this.descarteIds = this.descarteIds.filter((id) => id !== item.carta.id);
        return;
      }
      const objeto = this.criarObjeto(item.carta.id, item.carta);
      if (trocaDeMao) {
        objeto.base.set(0, 0.7, 0);
        objeto.malha.scale.setScalar(0.2);
      } else {
        objeto.base.copy(POS_MONTE).setY(this.monte.position.y * 2 + 0.06);
        objeto.malha.scale.setScalar(ESCALA_NA_MESA);
      }
      objeto.malha.position.copy(objeto.base);
      objeto.malha.quaternion.copy(this.orientacaoNaMesa(false, 0.06));
      objeto.atraso = this.opcoes.movimentoReduzido ? 0 : indice * 0.07;
      objeto.vooDistancia = -1; // calculado no primeiro alvo
    });

    this.maoIds = novosIds;
    this.focoPonteiroId =
      this.focoPonteiroId && novos.has(this.focoPonteiroId) ? this.focoPonteiroId : undefined;
  }

  private posicionarMao(inst: InstantaneoCena): void {
    const total = inst.mao.length;
    const focoId = this.gesto?.arrastando ? undefined : (this.focoPonteiroId ?? inst.cartaEmFocoId);
    const indiceEmFoco = focoId ? inst.mao.findIndex((item) => item.carta.id === focoId) : -1;
    const leque = calcularLeque(total, {
      larguraDisponivel: this.meiaLarguraMao * 2 * 0.9,
      larguraCarta: this.larguraCartaMao,
      indiceEmFoco: indiceEmFoco >= 0 ? indiceEmFoco : undefined,
    });
    const alturaCarta = this.larguraCartaMao * ALTURA_CARTA;
    const yBase = -this.meiaAlturaMao + alturaCarta * 0.62 + this.meiaAlturaMao * 0.035;
    const pendentes = new Set(inst.pendentes);
    const arrastada = this.gesto?.arrastando ? this.gesto.cartaId : undefined;
    const grupoArrastado =
      arrastada !== undefined &&
      inst.mao.some((item) => item.carta.id === arrastada && item.selecionada) &&
      inst.mao.filter((item) => item.selecionada).length >= 2;
    let ordemNoGrupo = 0;
    let ordemPendente = 0;
    this.centrosNaTela = [];

    inst.mao.forEach((item, indice) => {
      const objeto = this.objetos.get(item.carta.id);
      const slot = leque[indice];
      if (!objeto || !slot) return;
      objeto.local = 'mao';

      const emFoco = indice === indiceEmFoco;
      const jogavel = item.situacao === 'jogavel' || item.situacao === 'interceptavel';
      let elevacao = 0;
      if (jogavel) elevacao += alturaCarta * 0.07;
      if (item.selecionada) elevacao += alturaCarta * 0.2;
      if (emFoco) elevacao += alturaCarta * 0.2;

      // Posição de descanso no leque (espaço da câmera → mundo).
      this.aux.position.set(
        slot.x,
        yBase + slot.y + elevacao,
        -DISTANCIA_MAO + slot.camada * 0.016 + (emFoco ? 0.12 : 0),
      );
      this.aux.rotation.set(-0.1, 0, emFoco ? slot.rotacao * 0.35 : slot.rotacao);
      this.aux.updateMatrix();
      const repousoPos = this.v1.copy(this.aux.position).applyMatrix4(this.camera.matrixWorld);
      const repousoQuat = this.q1.copy(this.camera.quaternion).multiply(this.aux.quaternion);

      // Centro na tela (para a varredura por toque).
      this.v2.copy(repousoPos).project(this.camera);
      this.centrosNaTela.push({ id: item.carta.id, x: (this.v2.x * 0.5 + 0.5) * this.largura });

      const seguindoPonteiro = item.carta.id === arrastada || (grupoArrastado && item.selecionada);
      if (seguindoPonteiro) {
        const deslocamento = item.carta.id === arrastada ? 0 : (ordemNoGrupo += 1);
        this.alvoDeArrasto(objeto, deslocamento);
      } else if (pendentes.has(item.carta.id)) {
        // Solta no centro: paira sobre o descarte até a resposta chegar.
        objeto.alvoPos.set(POS_DESCARTE.x * 0.4, 1.05 + ordemPendente * 0.05, 0.7);
        objeto.alvoQuat.copy(this.orientacaoPairando());
        objeto.alvoEscala = ESCALA_NA_MESA * 1.05;
        objeto.rigidez = 12;
        ordemPendente += 1;
      } else if (this.soltas.has(item.carta.id)) {
        // Acabou de ser solta e a mesa ainda não respondeu: fica onde está.
      } else {
        if (objeto.vooDistancia < 0) {
          // Carta recém-comprada: voo em arco do monte até a mão.
          objeto.vooDistancia = Math.max(0.001, objeto.base.distanceTo(repousoPos));
          objeto.vooAltura = this.opcoes.movimentoReduzido ? 0 : 0.9;
        }
        objeto.alvoPos.copy(repousoPos);
        objeto.alvoQuat.copy(repousoQuat);
        objeto.alvoEscala = this.larguraCartaMao;
        objeto.rigidez = 13;
      }

      // Aparência: jogável brilha, bloqueada escurece.
      objeto.alvoTom =
        item.situacao === 'bloqueada' ? 0.52 : item.situacao === 'aguardando' ? 0.2 : 0;
      if (item.situacao === 'interceptavel') {
        this.definirBrilho(objeto, 1, true, '#ff4d6d');
      } else if (item.selecionada) {
        this.definirBrilho(objeto, 1, false, '#ffffff');
      } else if (emFoco) {
        this.definirBrilho(objeto, 0.95, false, '#ffffff');
      } else if (item.situacao === 'jogavel') {
        this.definirBrilho(objeto, 0.8, true, this.opcoes.tema.destaque);
      } else {
        this.definirBrilho(objeto, 0, false);
      }
    });
  }

  private posicionarDescarte(): void {
    this.descarteIds.forEach((id, indice) => {
      const objeto = this.objetos.get(id);
      if (!objeto || objeto.local !== 'descarte') return;
      const ruido = hashDeTexto(id);
      const guinada = (ruido - 0.5) * 0.7;
      const destino = this.v1.set(
        POS_DESCARTE.x + (hashDeTexto(`${id}x`) - 0.5) * 0.16,
        0.03 + indice * (ESPESSURA_CARTA * ESCALA_NA_MESA + 0.004),
        POS_DESCARTE.z + (hashDeTexto(`${id}z`) - 0.5) * 0.16,
      );
      if (objeto.alvoPos.distanceToSquared(destino) > 1e-6) {
        this.voar(objeto, destino, this.orientacaoNaMesa(true, guinada), 10);
      }
      objeto.alvoEscala = ESCALA_NA_MESA;
      objeto.alvoTom = 0;
    });
  }

  private atualizarMesa(inst: InstantaneoCena): void {
    // Monte: a altura acompanha a quantidade de cartas.
    const alturaMonte = Math.min(0.85, Math.max(0.03, inst.quantidadeMonte * 0.009));
    this.monte.scale.set(ESCALA_NA_MESA, ESCALA_NA_MESA, alturaMonte / ESPESSURA_CARTA);
    this.monte.position.y = alturaMonte / 2;
    this.monte.visible = inst.quantidadeMonte > 0;

    const cor = PALETA_CORES[inst.corAtiva].hex;
    this.materialDiscoCor.color.set(cor);
    this.materialAnelSentido.color.set(cor).lerp(BRANCO, 0.35);
    // Espelha as setas quando o jogo corre no sentido anti-horário.
    this.anelSentido.scale.set(5.6 * inst.sentido, 5.6, 1);

    // Brilho de vez: no assento de quem joga, ou na borda de baixo se sou eu.
    const daVez = inst.adversarios.find((adversario) => adversario.naVez);
    const assento = daVez ? this.assentos.get(daVez.id) : undefined;
    if (assento) {
      this.brilhoVez.position.set(assento.posicao.x, 0.008, assento.posicao.z);
      this.brilhoVez.scale.setScalar(3.4 * this.escalaAdversario + 1.2);
      this.brilhoVez.visible = true;
    } else {
      this.brilhoVez.visible = false;
    }

    if (inst.fechaInterceptacaoEm !== undefined) {
      if (this.janelaFechaEm !== inst.fechaInterceptacaoEm) {
        this.janelaFechaEm = inst.fechaInterceptacaoEm;
        this.janelaDuracao = Math.max(500, inst.fechaInterceptacaoEm - Date.now());
      }
    } else {
      this.janelaFechaEm = undefined;
    }
  }

  private atualizarAssentos(
    inst: InstantaneoCena,
    anterior: InstantaneoCena | undefined,
    forcar: boolean,
  ): void {
    const ids = inst.adversarios.map((adversario) => adversario.id);
    const mudouOrdem = forcar || ids.join('|') !== this.ordemAssentos.join('|');
    const total = ids.length;
    this.escalaAdversario =
      Math.min(0.74, Math.max(0.4, this.raioAssentosX / 6.2)) * (total > 5 ? 0.86 : 1);
    this.escalaPlaqueta =
      Math.min(1, Math.max(0.52, this.raioAssentosX / 4.2)) * (total > 6 ? 0.86 : 1);

    if (mudouOrdem) {
      for (const [id, assento] of this.assentos) {
        if (!ids.includes(id)) {
          this.liberarAssento(assento);
          this.assentos.delete(id);
        }
      }
      const posicoes = posicoesAssentos(total);
      inst.adversarios.forEach((adversario, indice) => {
        const posicao = posicoes[indice];
        if (!posicao) return;
        let assento = this.assentos.get(adversario.id);
        if (!assento) {
          const { textura, canvas } = this.texturas.criarPlaqueta();
          const material = new SpriteMaterial({
            map: textura,
            transparent: true,
            depthTest: false,
          });
          const plaqueta = new Sprite(material);
          plaqueta.renderOrder = 5;
          this.cena.add(plaqueta);
          assento = {
            id: adversario.id,
            posicao: new Vector3(),
            guinada: 0,
            plaqueta,
            material,
            textura,
            canvas,
            assinatura: '',
            quantidade: adversario.quantidadeCartas,
          };
          this.assentos.set(adversario.id, assento);
        }
        const raioZ = posicao.z > 0 ? 1.7 : this.raioAssentosLonge;
        assento.posicao.set(posicao.x * this.raioAssentosX, 0, posicao.z * raioZ);
        assento.guinada = Math.atan2(-assento.posicao.x, -assento.posicao.z);
        const doFundo = assento.posicao.z < -1;
        // Do fundo: rente à mesa e logo à frente das cartas, sem cobri-las.
        assento.plaqueta.position.set(
          assento.posicao.x * 1.04,
          doFundo ? 0.3 : 0.95 * this.escalaPlaqueta + 0.25,
          assento.posicao.z + (doFundo ? 0.55 + ALTURA_CARTA * this.escalaAdversario * 0.6 : -0.35),
        );
        assento.plaqueta.scale.set(2.4 * this.escalaPlaqueta, 0.8 * this.escalaPlaqueta, 1);
      });
      this.ordemAssentos = ids;
    }

    // Plaquetas e cartas instanciadas.
    let instancia = 0;
    for (const adversario of inst.adversarios) {
      const assento = this.assentos.get(adversario.id);
      if (!assento) continue;
      const assinatura = `${adversario.nome}|${adversario.avatar}|${adversario.quantidadeCartas}|${adversario.naVez}|${adversario.conectado}`;
      if (assinatura !== assento.assinatura) {
        desenharPlaqueta(assento.canvas, {
          nome: adversario.nome,
          avatar: adversario.avatar,
          quantidadeCartas: adversario.quantidadeCartas,
          naVez: adversario.naVez,
          conectado: adversario.conectado,
          destaque: this.opcoes.tema.destaque,
        });
        assento.textura.needsUpdate = true;
        assento.assinatura = assinatura;
      }

      // Compras dos adversários: versos voando do monte até o assento.
      const antes = anterior?.adversarios.find((item) => item.id === adversario.id);
      const comprou = antes ? adversario.quantidadeCartas - antes.quantidadeCartas : 0;
      const maosRedistribuidas =
        anterior !== undefined &&
        anterior.topo.id !== inst.topo.id &&
        (inst.topo.acao === 'TROCA_MAO' || inst.topo.acao === 'GIRA_MAO');
      if (comprou > 0 && !maosRedistribuidas) this.lancarFantasmas(assento, Math.min(comprou, 4));
      assento.quantidade = adversario.quantidadeCartas;

      const visiveis = Math.min(adversario.quantidadeCartas, MAXIMO_POR_ADVERSARIO);
      for (let j = 0; j < visiveis && instancia < CAPACIDADE_INSTANCIAS; j += 1) {
        const desvio = j - (visiveis - 1) / 2;
        const lateral = desvio * 0.3 * this.escalaAdversario;
        this.aux.position.set(
          assento.posicao.x + Math.cos(assento.guinada) * lateral,
          0.03 + j * 0.012,
          assento.posicao.z - Math.sin(assento.guinada) * lateral,
        );
        this.aux.rotation.set(Math.PI / 2, assento.guinada, desvio * 0.1, 'YXZ');
        this.aux.scale.setScalar(this.escalaAdversario);
        this.aux.updateMatrix();
        this.versosAdversarios.setMatrixAt(instancia, this.aux.matrix);
        instancia += 1;
      }
    }
    this.aux.scale.setScalar(1);
    this.versosAdversarios.count = instancia;
    this.versosAdversarios.instanceMatrix.needsUpdate = true;
  }

  private lancarFantasmas(assento: AssentoCena, quantidade: number): void {
    if (this.opcoes.movimentoReduzido) return;
    for (let i = 0; i < quantidade; i += 1) {
      this.sequenciaFantasma += 1;
      const objeto = this.criarObjeto(`fantasma-${this.sequenciaFantasma}`, undefined);
      objeto.base.copy(POS_MONTE).setY(this.monte.position.y * 2 + 0.06);
      objeto.malha.position.copy(objeto.base);
      objeto.malha.quaternion.copy(this.orientacaoNaMesa(false, 0.06));
      objeto.malha.scale.setScalar(ESCALA_NA_MESA);
      objeto.local = 'saindo';
      objeto.removerAoChegar = true;
      objeto.atraso = i * 0.09;
      objeto.alvoEscala = this.escalaAdversario;
      this.voar(
        objeto,
        new Vector3(assento.posicao.x, 0.12, assento.posicao.z),
        this.orientacaoNaMesa(false, assento.guinada),
        8,
      );
    }
  }

  // ─── Objetos de carta ─────────────────────────────────────────────────────

  private criarObjeto(id: string, carta: Carta | undefined): ObjetoCarta {
    let frente: MeshBasicMaterial | undefined;
    let materiais: Material[];
    if (carta) {
      frente = new MeshBasicMaterial({ map: this.texturas.face(carta) });
      materiais = [frente, this.materialVerso];
    } else {
      materiais = [this.materialVerso, this.materialVerso];
    }
    const malha = new Mesh(this.geometriaCarta, materiais);
    malha.userData['cartaId'] = id;
    this.cena.add(malha);
    const objeto: ObjetoCarta = {
      id,
      malha,
      frente,
      brilho: undefined,
      materialBrilho: undefined,
      base: new Vector3(),
      alvoPos: new Vector3(),
      alvoQuat: new Quaternion(),
      alvoEscala: 1,
      rigidez: 12,
      atraso: 0,
      vooDistancia: 0,
      vooAltura: 0,
      local: 'descarte',
      removerAoChegar: false,
      tom: 0,
      alvoTom: 0,
      alvoBrilho: 0,
      corBrilho: new Color('#ffffff'),
      pulsar: false,
      tremor: 0,
      pousoPendente: false,
      assentar: 0,
      sombra: undefined,
    };
    this.objetos.set(id, objeto);
    return objeto;
  }

  private definirBrilho(
    objeto: ObjetoCarta,
    intensidade: number,
    pulsar: boolean,
    cor?: string,
  ): void {
    objeto.alvoBrilho = intensidade;
    objeto.pulsar = pulsar;
    if (cor) objeto.corBrilho.set(cor);
    if (intensidade > 0 && !objeto.brilho) {
      const material = new MeshBasicMaterial({
        color: objeto.corBrilho,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const brilho = new Mesh(this.geometriaBrilho, material);
      brilho.position.z = -ESPESSURA_CARTA * 0.6;
      objeto.malha.add(brilho);
      objeto.brilho = brilho;
      objeto.materialBrilho = material;
    }
  }

  private voar(
    objeto: ObjetoCarta,
    destino: Vector3,
    orientacao: Quaternion,
    rigidez: number,
  ): void {
    objeto.alvoPos.copy(destino);
    objeto.alvoQuat.copy(orientacao);
    objeto.rigidez = rigidez;
    const distancia = objeto.base.distanceTo(destino);
    objeto.vooDistancia = Math.max(0.001, distancia);
    objeto.vooAltura =
      this.opcoes.movimentoReduzido || distancia < 1.2 ? 0 : Math.min(1.7, distancia * 0.24);
    // Peso das cartas: quem voa até o descarte ganha sombra no ar e pouso ao parar.
    if (
      this.opcoes.pesoDasCartas &&
      !this.opcoes.movimentoReduzido &&
      objeto.local === 'descarte' &&
      distancia > DISTANCIA_MINIMA_DO_POUSO
    ) {
      objeto.pousoPendente = true;
      this.pegarSombra(objeto);
    }
  }

  private removerObjeto(objeto: ObjetoCarta): void {
    this.liberarObjeto(objeto);
    this.objetos.delete(objeto.id);
    this.descarteIds = this.descarteIds.filter((id) => id !== objeto.id);
  }

  private liberarObjeto(objeto: ObjetoCarta): void {
    this.soltarSombra(objeto);
    this.cena.remove(objeto.malha);
    objeto.frente?.dispose();
    objeto.materialBrilho?.dispose();
  }

  private liberarAssento(assento: AssentoCena): void {
    this.cena.remove(assento.plaqueta);
    assento.material.dispose();
    this.texturas.liberar(assento.textura);
  }

  /** Orientação de uma carta deitada na mesa (face para cima ou para baixo). */
  private orientacaoNaMesa(faceParaCima: boolean, guinada: number): Quaternion {
    return new Quaternion().setFromEuler(
      new Euler(faceParaCima ? -Math.PI / 2 : Math.PI / 2, guinada, 0, 'YXZ'),
    );
  }

  /** Carta pairando sobre o centro, meio inclinada para a câmera. */
  private orientacaoPairando(): Quaternion {
    return new Quaternion().setFromEuler(new Euler(-Math.PI / 2 + 0.75, 0, 0, 'YXZ'));
  }

  // ─── Ponteiro ─────────────────────────────────────────────────────────────

  private lerPonteiro(evento: PointerEvent): void {
    const caixa = this.canvas.getBoundingClientRect();
    this.ponteiro.set(
      ((evento.clientX - caixa.left) / Math.max(1, caixa.width)) * 2 - 1,
      -(((evento.clientY - caixa.top) / Math.max(1, caixa.height)) * 2 - 1),
    );
  }

  private pontoNaMesa(ndcX: number, ndcY: number): Vector3 | null {
    this.raio.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    return this.raio.ray.intersectPlane(PLANO_DA_MESA, new Vector3());
  }

  private cartaSobOPonteiro(): string | undefined {
    this.raio.setFromCamera(this.ponteiro, this.camera);
    const malhas: Mesh[] = [];
    for (const id of this.maoIds) {
      const objeto = this.objetos.get(id);
      if (objeto) malhas.push(objeto.malha);
    }
    const acerto = this.raio.intersectObjects(malhas, false)[0];
    const id: unknown = acerto?.object.userData['cartaId'];
    return typeof id === 'string' ? id : undefined;
  }

  private alvoSobOPonteiro(): 'monte' | 'centro' | undefined {
    this.raio.setFromCamera(this.ponteiro, this.camera);
    if (this.monte.visible && this.raio.intersectObject(this.monte, false).length > 0)
      return 'monte';
    const ponto = this.raio.ray.intersectPlane(PLANO_DA_MESA, this.v1);
    if (!ponto) return undefined;
    if (Math.hypot(ponto.x - POS_MONTE.x, ponto.z - POS_MONTE.z) < 0.95) return 'monte';
    if (Math.hypot(ponto.x - POS_DESCARTE.x, ponto.z - POS_DESCARTE.z) < 1.25) return 'centro';
    return undefined;
  }

  private alvoDeArrasto(objeto: ObjetoCarta, ordemNoGrupo: number): void {
    const profundidade = DISTANCIA_MAO - 0.9;
    const tangente = Math.tan((FOV * Math.PI) / 360);
    const meiaAltura = profundidade * tangente;
    const meiaLargura = meiaAltura * this.camera.aspect;
    const alturaCarta = this.larguraCartaMao * ALTURA_CARTA;
    const folgaDoDedo = this.gesto?.tipoPonteiro === 'touch' ? alturaCarta * 0.55 : 0;
    this.aux.position.set(
      this.ponteiro.x * meiaLargura + ordemNoGrupo * this.larguraCartaMao * 0.22,
      this.ponteiro.y * meiaAltura + folgaDoDedo - ordemNoGrupo * 0.04,
      -profundidade - ordemNoGrupo * 0.02,
    );
    this.aux.rotation.set(this.sobreZona ? -0.55 : -0.2, 0, ordemNoGrupo * -0.08);
    this.aux.updateMatrix();
    objeto.alvoPos.copy(this.aux.position).applyMatrix4(this.camera.matrixWorld);
    objeto.alvoQuat.copy(this.camera.quaternion).multiply(this.aux.quaternion);
    objeto.alvoEscala = this.larguraCartaMao * (this.sobreZona ? 1.1 : 1.02);
    objeto.rigidez = 38;
    objeto.vooAltura = 0;
  }

  private readonly aoApertar = (evento: PointerEvent): void => {
    if (this.gesto || (evento.pointerType === 'mouse' && evento.button !== 0)) return;
    this.lerPonteiro(evento);
    const cartaId = this.cartaSobOPonteiro();
    const alvo = cartaId ? 'carta' : this.alvoSobOPonteiro();
    if (!alvo) return;
    this.gesto = {
      ponteiroId: evento.pointerId,
      tipoPonteiro: evento.pointerType,
      alvo,
      cartaId,
      x0: evento.clientX,
      y0: evento.clientY,
      arrastando: false,
      varreu: false,
    };
    try {
      this.canvas.setPointerCapture(evento.pointerId);
    } catch {
      // Eventos sintéticos de teste não têm ponteiro físico para capturar.
    }
    if (cartaId) this.focar(cartaId);
  };

  private readonly aoMover = (evento: PointerEvent): void => {
    this.lerPonteiro(evento);
    const gesto = this.gesto;
    if (!gesto) {
      // Hover (mouse): destaca a carta sob o cursor.
      if (evento.pointerType === 'mouse') this.focar(this.cartaSobOPonteiro());
      return;
    }
    if (gesto.ponteiroId !== evento.pointerId || gesto.alvo !== 'carta') return;

    if (!gesto.arrastando) {
      const caixa = this.canvas.getBoundingClientRect();
      const alturaCartaPx =
        ((this.larguraCartaMao * ALTURA_CARTA) / (this.meiaAlturaMao * 2)) * caixa.height;
      const tipo = classificarGesto(
        gesto.tipoPonteiro,
        evento.clientX - gesto.x0,
        evento.clientY - gesto.y0,
        alturaCartaPx,
      );
      if (tipo === 'arrastar') {
        gesto.arrastando = true;
        gesto.cartaId = this.focoPonteiroId ?? gesto.cartaId;
      } else if (tipo === 'varrer') {
        gesto.varreu = true;
        const x = evento.clientX - caixa.left;
        let maisProxima: { id: string; x: number } | undefined;
        for (const centro of this.centrosNaTela) {
          if (!maisProxima || Math.abs(centro.x - x) < Math.abs(maisProxima.x - x)) {
            maisProxima = centro;
          }
        }
        this.focar(maisProxima?.id);
        return;
      } else {
        return;
      }
    }

    const ponto = this.pontoNaMesa(this.ponteiro.x, this.ponteiro.y);
    this.sobreZona = estaNaZonaDeSoltura(ponto);
    if (this.instantaneo) this.posicionarMao(this.instantaneo);
    this.marcarSujo();
  };

  private readonly aoSoltar = (evento: PointerEvent): void => {
    const gesto = this.gesto;
    if (!gesto || gesto.ponteiroId !== evento.pointerId) return;
    this.lerPonteiro(evento);
    this.encerrarGesto(evento.pointerId);

    if (gesto.alvo === 'monte') {
      if (this.alvoSobOPonteiro() === 'monte') this.eventos.aoTocarMonte();
      return;
    }
    if (gesto.alvo === 'centro') {
      if (this.alvoSobOPonteiro() === 'centro') this.eventos.aoTocarCentro();
      return;
    }
    const cartaId = gesto.cartaId;
    if (!cartaId) return;
    if (gesto.arrastando) {
      const ponto = this.pontoNaMesa(this.ponteiro.x, this.ponteiro.y);
      if (estaNaZonaDeSoltura(ponto)) {
        // Fica onde foi solta até a mesa responder (aceite, cor, alvo ou recusa).
        this.soltas.add(cartaId);
        window.setTimeout(() => {
          if (this.destruida || !this.soltas.delete(cartaId)) return;
          if (this.instantaneo) this.posicionarMao(this.instantaneo);
          this.marcarSujo();
        }, 220);
        this.eventos.aoSoltarNoCentro(cartaId);
      }
    } else if (!gesto.varreu) {
      this.eventos.aoTocarCarta(cartaId);
    }
    if (evento.pointerType !== 'mouse') this.focar(undefined);
    if (this.instantaneo) this.posicionarMao(this.instantaneo);
    this.marcarSujo();
  };

  private readonly aoCancelar = (evento: PointerEvent): void => {
    if (!this.gesto || this.gesto.ponteiroId !== evento.pointerId) return;
    this.encerrarGesto(evento.pointerId);
    this.focar(undefined);
    if (this.instantaneo) this.posicionarMao(this.instantaneo);
    this.marcarSujo();
  };

  private readonly aoSair = (): void => {
    if (!this.gesto) this.focar(undefined);
  };

  private readonly aoPerderContexto = (evento: Event): void => {
    evento.preventDefault();
    this.eventos.aoPerderContexto();
  };

  private encerrarGesto(ponteiroId: number): void {
    this.gesto = undefined;
    this.sobreZona = false;
    try {
      if (this.canvas.hasPointerCapture(ponteiroId)) this.canvas.releasePointerCapture(ponteiroId);
    } catch {
      // Sem captura ativa: nada a liberar.
    }
  }

  private focar(cartaId: string | undefined): void {
    if (this.focoPonteiroId === cartaId) return;
    this.focoPonteiroId = cartaId;
    this.canvas.style.cursor = cartaId ? 'grab' : 'default';
    if (this.instantaneo) this.posicionarMao(this.instantaneo);
    this.marcarSujo();
  }

  /** Faz a carta tremer (jogada recusada) e voltar para a mão. */
  tremer(cartaId: string): void {
    const objeto = this.objetos.get(cartaId);
    if (!objeto) return;
    this.soltas.delete(cartaId);
    objeto.tremor = this.opcoes.movimentoReduzido ? 0 : 0.45;
    if (this.instantaneo) this.posicionarMao(this.instantaneo);
    this.marcarSujo();
  }

  // ─── Projeção para a camada DOM ───────────────────────────────────────────

  private retanguloDe(posicao: Vector3, orientacao: Quaternion, escala: number): Retangulo {
    this.m1.compose(posicao, orientacao, this.v2.set(escala, escala, escala));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of [
      [-0.5, -ALTURA_CARTA / 2],
      [0.5, -ALTURA_CARTA / 2],
      [0.5, ALTURA_CARTA / 2],
      [-0.5, ALTURA_CARTA / 2],
    ] as const) {
      const canto = new Vector3(x, y, 0).applyMatrix4(this.m1).project(this.camera);
      const px = (canto.x * 0.5 + 0.5) * this.largura;
      const py = (-canto.y * 0.5 + 0.5) * this.altura;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    return { x: minX, y: minY, largura: maxX - minX, altura: maxY - minY };
  }

  private projetar(inst: InstantaneoCena): void {
    const cartas: Record<string, Retangulo> = {};
    for (const item of inst.mao) {
      const objeto = this.objetos.get(item.carta.id);
      if (objeto)
        cartas[item.carta.id] = this.retanguloDe(
          objeto.alvoPos,
          objeto.alvoQuat,
          objeto.alvoEscala,
        );
    }
    const assentos: Record<string, { x: number; y: number }> = {};
    for (const assento of this.assentos.values()) {
      const ponto = assento.plaqueta.position.clone().project(this.camera);
      assentos[assento.id] = {
        x: (ponto.x * 0.5 + 0.5) * this.largura,
        y: (-ponto.y * 0.5 + 0.5) * this.altura,
      };
    }
    this.eventos.aoProjetar({
      cartas,
      assentos,
      monte: this.retanguloDe(
        new Vector3(POS_MONTE.x, this.monte.position.y * 2, POS_MONTE.z),
        this.orientacaoNaMesa(false, 0),
        ESCALA_NA_MESA,
      ),
      descarte: this.retanguloDe(
        new Vector3(POS_DESCARTE.x, 0.05, POS_DESCARTE.z),
        this.orientacaoNaMesa(true, 0),
        ESCALA_NA_MESA,
      ),
    });
  }

  // ─── Laço de animação ─────────────────────────────────────────────────────

  private marcarSujo(): void {
    this.sujo = true;
  }

  private readonly quadro = (instante: number): void => {
    if (this.destruida) return;
    this.animacao = requestAnimationFrame(this.quadro);
    const dt = Math.min(0.05, Math.max(0.001, (instante - this.ultimoInstante) / 1000));
    this.ultimoInstante = instante;
    this.tempo += dt;
    const inst = this.instantaneo;
    if (!inst) return;

    let emMovimento = this.avancarCartas(dt);
    const reduzido = this.opcoes.movimentoReduzido;

    // Efeitos contínuos: só mantêm o laço desenhando quando estão visíveis.
    const pulso = reduzido ? 0.75 : 0.62 + Math.sin(this.tempo * 4.2) * 0.38;
    const arrastando = this.gesto?.arrastando === true;

    const alvoZona = arrastando ? (this.sobreZona ? 0.62 : 0.3) : 0;
    emMovimento = this.aproximar(this.materialZona, alvoZona, dt) || emMovimento;
    const alvoSombra = arrastando && this.sobreZona ? 0.3 : 0;
    emMovimento = this.aproximar(this.materialSombra, alvoSombra, dt) || emMovimento;
    if (arrastando) {
      const ponto = this.pontoNaMesa(this.ponteiro.x, this.ponteiro.y);
      if (ponto) this.sombraArrasto.position.set(ponto.x, 0.012, ponto.z);
    }

    if (this.brilhoVez.visible) {
      this.materialBrilhoVez.opacity = 0.34 * pulso;
      emMovimento = emMovimento || !reduzido;
    }
    const alvoMonte = inst.podeComprar ? 0.5 * pulso : 0;
    if (Math.abs(this.materialBrilhoMonte.opacity - alvoMonte) > 0.004) {
      this.materialBrilhoMonte.opacity = alvoMonte;
      emMovimento = true;
    }

    if (!reduzido && !inst.pendentes.length) {
      this.anelSentido.rotation.z -= inst.sentido * dt * 0.35;
      emMovimento = true;
    }

    if (this.janelaFechaEm !== undefined) {
      const restante = Math.max(0, this.janelaFechaEm - Date.now());
      this.materialContagem.uniforms['uProgresso']!.value = Math.min(
        1,
        restante / this.janelaDuracao,
      );
      this.materialContagem.uniforms['uOpacidade']!.value = 1;
      this.anelContagem.visible = true;
      emMovimento = true;
    } else if (this.anelContagem.visible) {
      this.anelContagem.visible = false;
      emMovimento = true;
    }

    if (emMovimento || this.sujo) {
      this.sujo = false;
      this.renderizador.render(this.cena, this.camera);
      this.quadrosDesenhados += 1;
      this.medir(dt);
    }
  };

  private aproximar(material: MeshBasicMaterial, alvo: number, dt: number): boolean {
    const diferenca = alvo - material.opacity;
    if (Math.abs(diferenca) < 0.004) {
      material.opacity = alvo;
      return false;
    }
    material.opacity += diferenca * (1 - Math.exp(-12 * dt));
    return true;
  }

  // ─── Peso das cartas (pop e sombra ao pousar) ─────────────────────────────

  private pegarSombra(objeto: ObjetoCarta): void {
    if (objeto.sombra) return;
    const sombra = this.reservaDeSombras.pop();
    if (!sombra) return;
    sombra.material.opacity = 0;
    sombra.malha.visible = true;
    objeto.sombra = sombra;
    this.sombrasEmUso += 1;
  }

  private soltarSombra(objeto: ObjetoCarta): void {
    const sombra = objeto.sombra;
    if (!sombra) return;
    sombra.material.opacity = 0;
    sombra.malha.visible = false;
    this.reservaDeSombras.push(sombra);
    objeto.sombra = undefined;
    this.sombrasEmUso -= 1;
  }

  /** A carta deixou de ir ao descarte (troca de mão, volta à mão): sem pouso nem sombra. */
  private cancelarPouso(objeto: ObjetoCarta): void {
    objeto.pousoPendente = false;
    objeto.assentar = 0;
    this.soltarSombra(objeto);
  }

  /** Sombra no chão acompanhando a carta em voo: mais larga, fraca e deslocada quanto mais alta. */
  private atualizarSombraDeVoo(objeto: ObjetoCarta, altura: number): void {
    const sombra = objeto.sombra;
    if (!sombra) return;
    const forma = sombraDeVoo(altura);
    const escala = objeto.malha.scale.x * forma.escala;
    sombra.malha.position.set(
      objeto.base.x + forma.deslocamentoX,
      Y_DA_SOMBRA,
      objeto.base.z + forma.deslocamentoZ,
    );
    sombra.malha.scale.set(LARGURA_DA_SOMBRA * escala, ALTURA_DA_SOMBRA * escala, 1);
    sombra.material.opacity = forma.opacidade;
  }

  /** Fixa a carta no destino e começa a acomodação (pop, inclinação e sombra de impacto). */
  private iniciarAssentada(objeto: ObjetoCarta): void {
    objeto.pousoPendente = false;
    objeto.base.copy(objeto.alvoPos);
    objeto.malha.position.copy(objeto.base);
    objeto.malha.quaternion.copy(objeto.alvoQuat);
    objeto.malha.scale.setScalar(objeto.alvoEscala);
    objeto.vooAltura = 0;
    objeto.assentar = DURACAO_ASSENTADA;
  }

  private avancarAssentada(objeto: ObjetoCarta, dt: number): void {
    objeto.assentar = Math.max(0, objeto.assentar - dt);
    const curva = curvaDaAssentada(1 - objeto.assentar / DURACAO_ASSENTADA);
    objeto.malha.scale.setScalar(objeto.alvoEscala * curva.escala);
    // A carta "bate" com uma borda levemente erguida e achata: gira em torno do eixo da largura.
    this.q1.setFromAxisAngle(EIXO_X, curva.inclinacao);
    objeto.malha.quaternion.copy(objeto.alvoQuat).multiply(this.q1);
    const sombra = objeto.sombra;
    if (sombra) {
      // Logo abaixo da carta de cima e acima da pilha: a borda aparece ao redor dela.
      sombra.malha.position.set(
        objeto.alvoPos.x,
        objeto.alvoPos.y - ESPESSURA_CARTA * 0.65,
        objeto.alvoPos.z,
      );
      const escala = objeto.alvoEscala * curva.sombraEscala;
      sombra.malha.scale.set(LARGURA_DA_SOMBRA * escala, ALTURA_DA_SOMBRA * escala, 1);
      sombra.material.opacity = curva.sombra;
    }
    if (objeto.assentar === 0) {
      objeto.malha.scale.setScalar(objeto.alvoEscala);
      objeto.malha.quaternion.copy(objeto.alvoQuat);
      this.soltarSombra(objeto);
    }
  }

  /** Avança as cartas um quadro. Retorna se algo mudou (posição ou efeito visual). */
  private avancarCartas(dt: number): boolean {
    let emMovimento = false;
    // Só deslocamento conta como "animando"; brilho pulsante não.
    let deslocando = false;
    const reduzido = this.opcoes.movimentoReduzido;
    const pulso = reduzido ? 1 : 0.7 + Math.sin(this.tempo * 5) * 0.3;

    for (const objeto of this.objetos.values()) {
      if (objeto.atraso > 0) {
        objeto.atraso -= dt;
        emMovimento = true;
        deslocando = true;
        continue;
      }
      // Acomodação depois do pouso: o pop é aplicado por cima do estado final.
      if (objeto.assentar > 0) {
        this.avancarAssentada(objeto, dt);
        emMovimento = true;
        deslocando = true;
        continue;
      }

      const fator = reduzido ? 1 : 1 - Math.exp(-objeto.rigidez * dt);
      const distancia = objeto.base.distanceTo(objeto.alvoPos);
      const angulo = objeto.malha.quaternion.angleTo(objeto.alvoQuat);
      const diferencaEscala = Math.abs(objeto.malha.scale.x - objeto.alvoEscala);

      // Chegou ao descarte voando: encaixa no estado final e começa a acomodação.
      if (objeto.pousoPendente && distancia < 0.03 && angulo < 0.02 && diferencaEscala < 0.01) {
        this.iniciarAssentada(objeto);
        emMovimento = true;
        deslocando = true;
        continue;
      }

      // Perto do destino, encaixa de uma vez: a aproximação exponencial tem uma
      // cauda longa, que em aparelho lento (quadros espaçados) vira arrasto.
      if (
        objeto.tremor <= 0 &&
        (distancia > 0.002 || angulo > 0.004 || diferencaEscala > 0.002) &&
        distancia < 0.03 &&
        angulo < 0.02 &&
        diferencaEscala < 0.01
      ) {
        objeto.base.copy(objeto.alvoPos);
        objeto.malha.quaternion.copy(objeto.alvoQuat);
        objeto.malha.scale.setScalar(objeto.alvoEscala);
        objeto.malha.position.copy(objeto.base);
        objeto.vooAltura = 0;
        emMovimento = true;
        continue;
      }

      if (distancia > 0.002 || angulo > 0.004 || diferencaEscala > 0.002 || objeto.tremor > 0) {
        emMovimento = true;
        deslocando = true;
        objeto.base.lerp(objeto.alvoPos, fator);
        objeto.malha.quaternion.slerp(objeto.alvoQuat, fator);
        objeto.malha.scale.setScalar(
          objeto.malha.scale.x + (objeto.alvoEscala - objeto.malha.scale.x) * fator,
        );
        objeto.malha.position.copy(objeto.base);
        let arco = 0;
        if (objeto.vooAltura > 0 && objeto.vooDistancia > 0) {
          const progresso = 1 - Math.min(1, distancia / objeto.vooDistancia);
          arco = Math.sin(Math.PI * progresso) * objeto.vooAltura;
          objeto.malha.position.y += arco;
        }
        if (objeto.sombra) this.atualizarSombraDeVoo(objeto, arco);
        if (objeto.tremor > 0) {
          objeto.tremor = Math.max(0, objeto.tremor - dt);
          objeto.malha.position.x += Math.sin(this.tempo * 70) * 0.05 * (objeto.tremor / 0.45);
        }
      } else if (objeto.removerAoChegar) {
        this.removerObjeto(objeto);
        emMovimento = true;
        deslocando = true;
        continue;
      } else if (objeto.vooAltura !== 0) {
        objeto.vooAltura = 0;
        objeto.malha.position.copy(objeto.base);
        emMovimento = true;
      }

      if (objeto.frente && Math.abs(objeto.tom - objeto.alvoTom) > 0.004) {
        objeto.tom += (objeto.alvoTom - objeto.tom) * (reduzido ? 1 : 1 - Math.exp(-10 * dt));
        objeto.frente.color.setScalar(1 - objeto.tom);
        emMovimento = true;
      }
      if (objeto.materialBrilho) {
        const alvo = objeto.alvoBrilho * (objeto.pulsar ? pulso : 1);
        if (Math.abs(objeto.materialBrilho.opacity - alvo) > 0.004) {
          objeto.materialBrilho.color.copy(objeto.corBrilho);
          objeto.materialBrilho.opacity +=
            (alvo - objeto.materialBrilho.opacity) * (reduzido ? 1 : 0.35);
          emMovimento = true;
        }
        // Brilho apagado não entra na lista de desenho.
        if (objeto.brilho) objeto.brilho.visible = objeto.materialBrilho.opacity > 0.01;
      }
    }
    this.cartasAnimando = deslocando;
    return emMovimento;
  }

  /**
   * Mede o ritmo dos quadros e reduz o pixel ratio se o aparelho não acompanha.
   * Avalia a cada 90 quadros OU 1,5 s (num aparelho muito lento, 90 quadros
   * levariam meio minuto).
   */
  private medir(dt: number): void {
    this.fps += (1 / dt - this.fps) * 0.05;
    this.amostras += 1;
    this.tempoDeAmostra += dt;
    if (dt > 1 / 42) this.amostrasLentas += 1;
    if (this.amostras < 90 && this.tempoDeAmostra < 1.5) return;
    if (this.amostrasLentas > this.amostras / 2 && this.pixelRatio > 1) {
      this.tetoPixelRatio = Math.max(1, this.pixelRatio - 0.5);
      this.pixelRatio = this.tetoPixelRatio;
      this.renderizador.setPixelRatio(this.pixelRatio);
      this.renderizador.setSize(this.largura, this.altura, false);
      this.marcarSujo();
    }
    this.amostras = 0;
    this.amostrasLentas = 0;
    this.tempoDeAmostra = 0;
  }
}
