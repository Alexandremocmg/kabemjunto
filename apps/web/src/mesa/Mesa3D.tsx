/**
 * Mesa 3D do Kabemjunto: um componente só para Local e Online.
 *
 * Camadas, de baixo para cima:
 * 1. `<canvas>` com a cena Three.js (`CenaMesa`): render e gestos de ponteiro;
 * 2. camada acessível em DOM, alinhada às cartas projetadas: botões reais
 *    para teclado e leitor de tela (invisíveis ao mouse, que fala com o canvas);
 * 3. HUD, dicas, anúncios e escolhas (cor, alvo, Corta-Frente, vitória).
 *
 * A mesa só envia intenções pelo `ControladorMesa`; quem aceita ou recusa é
 * o motor (local) ou o servidor (online).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Carta, EstadoPartidaPublico } from '@kabemjunto/shared';
import { saoCartasIdenticas } from '@kabemjunto/shared';
import { BARALHO_COMPLETO_108 } from '@kabemjunto/shared/constants';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import { caminhoDoAvatar, emojiDoAvatar } from '../services/avatar';
import { AvisoDeVez } from './AvisoDeVez';
import { derivarAnuncios, inferirQuemJogou, type Anuncio } from './anuncios';
import { situacaoDoBot } from './controleBot';
import { TelaDeFim } from './fim/TelaDeFim';
import {
  escolherDica,
  lerDicasVistas,
  salvarDicasVistas,
  TEXTO_DICA,
  TODAS_AS_DICAS,
  type TipoDica,
} from './dicas';
import type {
  CenaMesa,
  EventosCena,
  InstantaneoCena,
  LayoutProjetado,
  Retangulo,
} from './cena/CenaMesa';
import { temaDaMesa } from './temas';
import { CartaView } from '../components/CartaView';
import {
  alternarSelecao,
  cartasDaJogada,
  diagnosticarCarta,
  diagnosticarCompra,
  janelaInterceptavel,
  ordenarAdversarios,
  precisaEscolherCor,
  reconciliarSelecao,
  rotuloDaCarta,
  type SituacaoCarta,
} from './interacao';
import { lerPreferenciaPeso, prefereMovimentoReduzido, suportaWebGL } from './preferencias';
import { SeloDeImpacto, SelosDeImpacto } from './SelosDeImpacto';
import { useSelosDeImpacto } from './useSelosDeImpacto';
import { CORES_JOGAVEIS, type ControladorMesa, type CorJogavel } from './tipos';
import './mesa3d.css';

export interface Mesa3DProps {
  controlador: ControladorMesa;
  onSair: () => void;
  onJogarNovamente: () => void;
  /** Da tela de fim (padrão: o mesmo que sair). */
  onVoltarAoMenu?: () => void;
  /**
   * '3d' (padrão) desenha a mesa com Three.js; '2d' é a mesa simples em DOM,
   * com as mesmas regras de interação. Sem WebGL (ou se o contexto cair), a
   * mesa passa sozinha para '2d' e avisa.
   */
  renderizacao?: '3d' | '2d';
  /** Botões extras no fim do HUD (ex.: menu da partida online). */
  acoesHud?: ReactNode;
  /** Última fala de cada jogador, mostrada como balão no assento. */
  baloes?: ReadonlyMap<string, string>;
  /** Falas rápidas (online): uma toque e a mensagem vai para o chat. */
  falasRapidas?: { opcoes: ReadonlyArray<string>; onEnviar: (texto: string) => void };
}

interface Pendente {
  cartaId: string;
  etapa: 'alvo' | 'cor';
  alvoId?: string;
}

interface Toast {
  id: number;
  tipo: 'erro' | 'info' | 'sucesso';
  texto: string;
}

const TEMPO_ENVIO_MS = 8000;
const DURACAO_FAIXA_MS = 1900;
const VAZIO: ReadonlyArray<string> = [];

function estiloDoRetangulo(retangulo: Retangulo | undefined): CSSProperties {
  if (!retangulo) return { left: 0, top: 0, width: 0, height: 0 };
  return {
    left: retangulo.x,
    top: retangulo.y,
    width: retangulo.largura,
    height: retangulo.altura,
  };
}

function retangulosIguais(a: Retangulo | undefined, b: Retangulo | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.largura - b.largura) < 0.5 &&
    Math.abs(a.altura - b.altura) < 0.5
  );
}

/** Evita uma renderização extra do React quando a projeção não mudou de fato. */
function layoutsIguais(a: LayoutProjetado | undefined, b: LayoutProjetado): boolean {
  if (!a) return false;
  if (!retangulosIguais(a.monte, b.monte) || !retangulosIguais(a.descarte, b.descarte))
    return false;
  const cartas = Object.keys(b.cartas);
  if (cartas.length !== Object.keys(a.cartas).length) return false;
  if (!cartas.every((id) => retangulosIguais(a.cartas[id], b.cartas[id]))) return false;
  const assentos = Object.keys(b.assentos);
  if (assentos.length !== Object.keys(a.assentos).length) return false;
  return assentos.every((id) => {
    const pa = a.assentos[id];
    const pb = b.assentos[id];
    return (
      pa !== undefined &&
      pb !== undefined &&
      Math.abs(pa.x - pb.x) < 0.5 &&
      Math.abs(pa.y - pb.y) < 0.5
    );
  });
}

function descreverSituacao(situacao: SituacaoCarta, motivo: string | undefined): string {
  if (situacao === 'jogavel') return 'jogável';
  if (situacao === 'interceptavel') return 'idêntica ao descarte: corte a frente';
  return motivo ?? 'indisponível';
}

function lerTema(): string | null {
  try {
    return window.localStorage.getItem('kabemjunto.tema');
  } catch {
    return null;
  }
}

export function Mesa3D({
  controlador,
  onSair,
  onJogarNovamente,
  onVoltarAoMenu = onSair,
  renderizacao = '3d',
  acoesHud,
  baloes,
  falasRapidas,
}: Mesa3DProps) {
  const { estado, mao, jogadorId, aviso } = controlador;
  const tema = useMemo(() => temaDaMesa(lerTema()), []);
  const movimentoReduzido = useMemo(prefereMovimentoReduzido, []);
  const pesoDasCartas = useMemo(lerPreferenciaPeso, []);

  const palcoRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cenaRef = useRef<CenaMesa>();
  const instantaneoRef = useRef<InstantaneoCena>();
  const eventosRef = useRef<Omit<EventosCena, 'aoProjetar' | 'aoPerderContexto'>>();
  const ultimaTentativaRef = useRef<string>();
  const sequenciaToastRef = useRef(0);
  const maoRef = useRef<HTMLUListElement>(null);
  /** Posição da carta com foco de teclado, para o foco não cair no `body` quando ela sai da mão. */
  const indiceFocoTecladoRef = useRef<number>();

  const [falhaWebGL, setFalhaWebGL] = useState(() => renderizacao === '3d' && !suportaWebGL());
  const modo2D = renderizacao === '2d' || falhaWebGL;
  const [layout, setLayout] = useState<LayoutProjetado>();
  const [selecao, setSelecao] = useState<ReadonlyArray<string>>(VAZIO);
  const [pendente, setPendente] = useState<Pendente>();
  const [enviando, setEnviando] = useState<ReadonlyArray<string>>(VAZIO);
  const [foco, setFoco] = useState<string>();
  const [toast, setToast] = useState<Toast>();
  const [faixa, setFaixa] = useState<Anuncio>();
  const [filaFaixa, setFilaFaixa] = useState<ReadonlyArray<Anuncio>>([]);
  const [anuncioFalado, setAnuncioFalado] = useState('');
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [falasAbertas, setFalasAbertas] = useState(false);
  const [dicasVistas, setDicasVistas] = useState<ReadonlySet<TipoDica>>(lerDicasVistas);
  const [agora, setAgora] = useState(() => Date.now());

  // Estado anterior, guardado como estado derivado (padrão oficial do React):
  // é o que permite saber quem jogou e o que mudou entre dois instantâneos.
  const [historico, setHistorico] = useState<{
    atual: EstadoPartidaPublico;
    anterior?: EstadoPartidaPublico;
    conexao: number | undefined;
  }>({ atual: estado, conexao: controlador.conexao });
  if (historico.atual !== estado)
    setHistorico({
      atual: estado,
      conexao: controlador.conexao,
      // Depois de reconectar, o que se passou na queda não vira selo nem anúncio.
      ...(historico.conexao === controlador.conexao ? { anterior: historico.atual } : {}),
    });

  const minhaVez = estado.vezDe === jogadorId && !estado.finalizada;
  const compra = diagnosticarCompra(estado, mao, jogadorId);
  const janela = janelaInterceptavel(estado, jogadorId);
  const adversarios = useMemo(
    () => ordenarAdversarios(estado.jogadores, jogadorId),
    [estado.jogadores, jogadorId],
  );
  const eu = estado.jogadores.find((jogador) => jogador.id === jogadorId);
  const jogadorDaVez = estado.jogadores.find((jogador) => jogador.id === estado.vezDe);
  const cartasParaCortar = janela
    ? mao.filter((carta) => saoCartasIdenticas(carta, estado.topo))
    : [];
  const diagnosticos = useMemo(
    () => new Map(mao.map((carta) => [carta.id, diagnosticarCarta(estado, carta, jogadorId)])),
    [estado, jogadorId, mao],
  );
  const quemJogou = useMemo(
    () => (historico.anterior ? inferirQuemJogou(historico.anterior, historico.atual) : undefined),
    [historico],
  );

  const mostrar = useCallback((tipo: Toast['tipo'], texto: string) => {
    sequenciaToastRef.current += 1;
    setToast({ id: sequenciaToastRef.current, tipo, texto });
  }, []);

  // ─── Jogadas ──────────────────────────────────────────────────────────────

  const ehJogavel = useCallback(
    (carta: Carta) => diagnosticarCarta(estado, carta, jogadorId).situacao === 'jogavel',
    [estado, jogadorId],
  );

  const tentarJogar = useCallback(
    (cartaId: string) => {
      const carta = mao.find((item) => item.id === cartaId);
      if (!carta || enviando.length > 0) return;
      ultimaTentativaRef.current = cartaId;
      const diagnostico = diagnosticarCarta(estado, carta, jogadorId);

      if (diagnostico.situacao === 'interceptavel') {
        setSelecao(VAZIO);
        setEnviando([cartaId]);
        controlador.interceptar(cartaId);
        return;
      }

      // Grupo selecionado (descarte múltiplo): sai inteiro, começando por uma válida.
      const ids = cartasDaJogada(cartaId, selecao, mao, ehJogavel);
      if (ids.length >= 2) {
        const primeira = mao.find((item) => item.id === ids[0]);
        if (!primeira || !ehJogavel(primeira)) {
          mostrar('erro', diagnostico.motivo ?? 'Nenhuma carta do grupo pode abrir a jogada.');
          cenaRef.current?.tremer(cartaId);
          return;
        }
        setSelecao(VAZIO);
        setEnviando(ids);
        controlador.jogarMultiplas(ids);
        return;
      }

      if (diagnostico.situacao !== 'jogavel') {
        mostrar('erro', diagnostico.motivo ?? 'Essa carta não pode ser jogada agora.');
        cenaRef.current?.tremer(cartaId);
        return;
      }
      setSelecao(VAZIO);
      if (carta.acao === 'TROCA_MAO') {
        setPendente({ cartaId, etapa: 'alvo' });
        return;
      }
      if (precisaEscolherCor(carta)) {
        setPendente({ cartaId, etapa: 'cor' });
        return;
      }
      setEnviando([cartaId]);
      controlador.jogar(cartaId);
    },
    [controlador, ehJogavel, enviando.length, estado, jogadorId, mao, mostrar, selecao],
  );

  const comprar = useCallback(() => {
    if (pendente || enviando.length > 0) return;
    if (!compra.permitido) {
      mostrar('info', compra.motivo ?? 'Não é possível comprar agora.');
      return;
    }
    controlador.comprar();
  }, [compra, controlador, enviando.length, mostrar, pendente]);

  const alternar = useCallback(
    (cartaId: string) => {
      const carta = mao.find((item) => item.id === cartaId);
      if (!carta) return;
      if (diagnosticarCarta(estado, carta, jogadorId).situacao === 'interceptavel') {
        tentarJogar(cartaId);
        return;
      }
      // Tocar de novo na única carta selecionada joga (alternativa ao arrasto).
      if (selecao.length === 1 && selecao[0] === cartaId && minhaVez) {
        tentarJogar(cartaId);
        return;
      }
      setSelecao((atual) => alternarSelecao(atual, carta, mao));
    },
    [estado, jogadorId, mao, minhaVez, selecao, tentarJogar],
  );

  const confirmarCor = useCallback(
    (cor: CorJogavel) => {
      if (!pendente) return;
      const { cartaId, alvoId } = pendente;
      setPendente(undefined);
      setEnviando([cartaId]);
      controlador.jogar(cartaId, alvoId ? { cor, alvoTrocaId: alvoId } : { cor });
    },
    [controlador, pendente],
  );

  const escolherAlvo = useCallback((alvoId: string) => {
    setPendente((atual) => (atual ? { cartaId: atual.cartaId, etapa: 'cor', alvoId } : atual));
  }, []);

  eventosRef.current = {
    aoSoltarNoCentro: tentarJogar,
    aoTocarCarta: alternar,
    aoTocarMonte: comprar,
    aoTocarCentro: () => {
      const [primeira] = selecao;
      if (primeira) tentarJogar(primeira);
    },
  };

  // ─── Cena 3D ──────────────────────────────────────────────────────────────

  // Three.js só é baixado quando a mesa 3D vai mesmo ser desenhada.
  useEffect(() => {
    if (modo2D) return undefined;
    let cancelado = false;
    let desmontar: (() => void) | undefined;
    void import('./cena/CenaMesa')
      .then(({ CenaMesa: Cena }) => {
        const canvas = canvasRef.current;
        const palco = palcoRef.current;
        if (cancelado || !canvas || !palco) return;
        let cena: CenaMesa;
        try {
          cena = new Cena(
            canvas,
            {
              aoSoltarNoCentro: (id) => eventosRef.current?.aoSoltarNoCentro(id),
              aoTocarCarta: (id) => eventosRef.current?.aoTocarCarta(id),
              aoTocarMonte: () => eventosRef.current?.aoTocarMonte(),
              aoTocarCentro: () => eventosRef.current?.aoTocarCentro(),
              aoProjetar: (novo) =>
                setLayout((atual) => (layoutsIguais(atual, novo) ? atual : novo)),
              aoPerderContexto: () => setFalhaWebGL(true),
            },
            { tema, movimentoReduzido, pesoDasCartas },
          );
        } catch {
          setFalhaWebGL(true);
          return;
        }
        cenaRef.current = cena;
        cena.aquecerFaces(BARALHO_COMPLETO_108);
        const medir = () => {
          const caixa = palco.getBoundingClientRect();
          cena.redimensionar(caixa.width, caixa.height, window.devicePixelRatio || 1);
        };
        medir();
        // A cena chegou depois do primeiro estado: desenha o que já existe.
        if (instantaneoRef.current) cena.atualizar(instantaneoRef.current);
        const observador = new ResizeObserver(medir);
        observador.observe(palco);
        // Diagnóstico só de leitura (FPS, chamadas de desenho), usado nos testes de performance.
        (window as unknown as Record<string, unknown>)['__kabemjuntoMesa'] = {
          estatisticas: () => cena.estatisticas(),
        };
        desmontar = () => {
          observador.disconnect();
          cena.destruir();
          cenaRef.current = undefined;
          delete (window as unknown as Record<string, unknown>)['__kabemjuntoMesa'];
        };
      })
      .catch(() => {
        if (!cancelado) setFalhaWebGL(true);
      });
    return () => {
      cancelado = true;
      desmontar?.();
    };
  }, [modo2D, movimentoReduzido, pesoDasCartas, tema]);

  const instantaneo = useMemo<InstantaneoCena>(
    () => ({
      mao: mao.map((carta) => ({
        carta,
        situacao: diagnosticos.get(carta.id)?.situacao ?? 'aguardando',
        selecionada: selecao.includes(carta.id),
      })),
      topo: estado.topo,
      corAtiva: estado.corAtiva,
      sentido: estado.sentido,
      quantidadeMonte: estado.quantidadeMonteCompra,
      podeComprar: compra.permitido && !pendente && enviando.length === 0,
      minhaVez,
      adversarios: adversarios.map((jogador) => ({
        id: jogador.id,
        nome: jogador.nome,
        avatar: jogador.avatar,
        quantidadeCartas: jogador.quantidadeCartas,
        conectado: jogador.conectado,
        situacao: situacaoDoBot(jogador),
        naVez: jogador.id === estado.vezDe && !estado.finalizada,
      })),
      pendentes: pendente ? [pendente.cartaId, ...enviando] : enviando,
      cartaEmFocoId: foco,
      quemJogouId: quemJogou,
      fechaInterceptacaoEm: estado.interceptacao?.fechaEm,
    }),
    [
      adversarios,
      compra.permitido,
      diagnosticos,
      enviando,
      estado,
      foco,
      mao,
      minhaVez,
      pendente,
      quemJogou,
      selecao,
    ],
  );

  useEffect(() => {
    instantaneoRef.current = instantaneo;
    cenaRef.current?.atualizar(instantaneo);
  }, [instantaneo]);

  // Impactos: selo sobre o jogador afetado e tremor da plaqueta dele.
  const selos = useSelosDeImpacto(historico.anterior, historico.atual, jogadorId, (impacto) =>
    cenaRef.current?.impactar(impacto.jogadorId),
  );

  // ─── Reações ao estado ────────────────────────────────────────────────────

  // Anúncios: faixa central (destaques) e leitor de tela (todos).
  useEffect(() => {
    if (!historico.anterior) return;
    const novos = derivarAnuncios(historico.anterior, historico.atual, jogadorId);
    if (novos.length === 0) return;
    setAnuncioFalado(
      novos
        .map((anuncio) =>
          /[.!?]$/.test(anuncio.titulo)
            ? `${anuncio.titulo} ${anuncio.detalhe}`
            : `${anuncio.titulo}. ${anuncio.detalhe}`,
        )
        .join(' '),
    );
    const destaques = novos.filter((anuncio) => anuncio.destaque);
    if (destaques.length > 0) setFilaFaixa((fila) => [...fila, ...destaques].slice(-4));
  }, [historico, jogadorId]);

  useEffect(() => {
    if (faixa || filaFaixa.length === 0) return;
    const [proximo, ...resto] = filaFaixa;
    setFaixa(proximo);
    setFilaFaixa(resto);
  }, [faixa, filaFaixa]);

  useEffect(() => {
    if (!faixa) return undefined;
    const timer = window.setTimeout(() => setFaixa(undefined), DURACAO_FAIXA_MS);
    return () => window.clearTimeout(timer);
  }, [faixa]);

  // A seleção e o envio só guardam cartas que ainda estão na mão.
  useEffect(() => {
    setSelecao((atual) => reconciliarSelecao(atual, mao));
    setEnviando((atual) => {
      if (atual.length === 0) return atual;
      const restantes = reconciliarSelecao(atual, mao);
      // Um descarte múltiplo some da mão de uma vez: se saiu alguma, saíram todas.
      return restantes.length < atual.length ? VAZIO : atual;
    });
  }, [mao]);

  // A carta focada pelo teclado saiu da mão: o foco vai para a vizinha.
  useEffect(() => {
    const indice = indiceFocoTecladoRef.current;
    if (indice === undefined) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const botoes = maoRef.current?.querySelectorAll<HTMLButtonElement>('button');
    if (!botoes || botoes.length === 0) return;
    botoes[Math.min(indice, botoes.length - 1)]?.focus();
  }, [mao]);

  // Sem resposta (rede caiu, evento perdido): devolve o controle ao jogador.
  useEffect(() => {
    if (enviando.length === 0) return undefined;
    const timer = window.setTimeout(() => {
      setEnviando(VAZIO);
      mostrar('erro', 'Sem resposta. A carta voltou para a sua mão; tente de novo.');
    }, TEMPO_ENVIO_MS);
    return () => window.clearTimeout(timer);
  }, [enviando, mostrar]);

  // A escolha pendente perde o sentido se a carta saiu ou a vez passou.
  useEffect(() => {
    if (!pendente) return;
    if (!minhaVez || !mao.some((carta) => carta.id === pendente.cartaId)) setPendente(undefined);
  }, [mao, minhaVez, pendente]);

  // Recusa do motor/servidor: avisa e a carta treme de volta para a mão.
  useEffect(() => {
    if (!aviso) return;
    setToast({ id: -aviso.id, tipo: aviso.tipo, texto: aviso.texto });
    if (aviso.tipo !== 'erro') return;
    setEnviando(VAZIO);
    const ultima = ultimaTentativaRef.current;
    if (ultima) cenaRef.current?.tremer(ultima);
  }, [aviso]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(undefined), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Contagem do Corta-Frente em texto (o anel na cena é a versão visual).
  useEffect(() => {
    if (!estado.interceptacao) return undefined;
    setAgora(Date.now());
    const timer = window.setInterval(() => setAgora(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [estado.interceptacao]);

  // Esc cancela a escolha de cor/alvo.
  useEffect(() => {
    if (!pendente) return undefined;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setPendente(undefined);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [pendente]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const dicaContextual = escolherDica(
    {
      minhaVez,
      silencioAtivo: estado.silencio.ativo,
      ataqueAcumulado: estado.ataqueAcumulado,
      podeComprar: compra.permitido,
      ocupada:
        Boolean(pendente) ||
        enviando.length > 0 ||
        Boolean(estado.interceptacao) ||
        estado.finalizada ||
        confirmarSaida,
      mao,
      ehJogavel,
    },
    dicasVistas,
  );
  const marcarDicas = (vistas: ReadonlySet<TipoDica>) => {
    setDicasVistas(vistas);
    salvarDicasVistas(vistas);
  };

  const corAtiva = PALETA_CORES[estado.corAtiva];
  const segundosCorte = estado.interceptacao
    ? Math.max(0, Math.ceil((estado.interceptacao.fechaEm - agora) / 1000))
    : 0;
  const pendenteCarta = pendente ? mao.find((carta) => carta.id === pendente.cartaId) : undefined;
  const grupoPronto = selecao.length >= 2 && minhaVez;
  const centroDescarte = layout
    ? {
        x: layout.descarte.x + layout.descarte.largura / 2,
        y: layout.descarte.y + layout.descarte.altura / 2,
      }
    : undefined;

  let dica: string;
  if (estado.finalizada) dica = 'Fim da partida.';
  else if (pendente?.etapa === 'alvo') dica = 'Escolha com quem trocar de mão.';
  else if (pendente?.etapa === 'cor') dica = 'Escolha a nova cor.';
  else if (cartasParaCortar.length > 0)
    dica = 'Corta-Frente! Jogue sua carta idêntica antes do tempo acabar.';
  else if (estado.interceptacao) dica = 'Corta-Frente em andamento…';
  else if (enviando.length > 0) dica = 'Enviando jogada…';
  else if (!minhaVez) dica = `Aguardando ${jogadorDaVez?.nome ?? 'o próximo jogador'}…`;
  else if (grupoPronto)
    dica = modo2D
      ? `Toque em "Jogar ${selecao.length} cartas".`
      : `Arraste o grupo de ${selecao.length} cartas até o centro.`;
  else if (estado.ataqueAcumulado > 0)
    dica = compra.permitido
      ? `Ataque +${estado.ataqueAcumulado}: cubra com +2, +4 ou 0+, ou toque no monte.`
      : `Ataque +${estado.ataqueAcumulado}: cubra com +2, +4 ou 0+.`;
  else if (compra.permitido) dica = 'Nenhuma carta serve: toque no monte para comprar.';
  else
    dica = modo2D
      ? 'Toque numa carta que brilha e toque de novo para jogar.'
      : 'Arraste uma carta até o centro da mesa.';

  return (
    <main
      className={`mesa3d ${modo2D ? 'mesa2d' : ''}`}
      style={
        {
          '--mesa-fundo': tema.fundo,
          '--mesa-destaque': tema.destaque,
          '--mesa-cor-ativa': corAtiva.hex,
        } as CSSProperties
      }
      data-topo-id={estado.topo.id}
      data-vez={estado.vezDe}
      data-cor={estado.corAtiva}
      data-mao={mao.length}
      aria-label="Mesa de jogo"
    >
      {!modo2D && (
        <div ref={palcoRef} className="mesa3d-palco">
          <canvas ref={canvasRef} className="mesa3d-canvas" aria-hidden="true" />
        </div>
      )}

      <header className="mesa3d-hud">
        <button
          type="button"
          className="mesa3d-hud-botao"
          onClick={() => setConfirmarSaida(true)}
          aria-label="Sair da partida"
        >
          ✕
        </button>
        <div className={`mesa3d-vez ${minhaVez ? 'mesa3d-vez-minha' : ''}`}>
          <strong>
            {estado.finalizada ? 'FIM' : minhaVez ? 'SUA VEZ' : (jogadorDaVez?.nome ?? '…')}
          </strong>
          {estado.turno && !estado.finalizada && (
            <AvisoDeVez turno={estado.turno} minhaVez={estado.turno.jogadorId === jogadorId} />
          )}
        </div>
        <div className="mesa3d-chip" aria-label={`Cor ativa: ${corAtiva.nomePt}`}>
          <span className="mesa3d-ponto-cor" aria-hidden="true">
            {corAtiva.simboloAcessivel}
          </span>
          {corAtiva.nomePt}
        </div>
        <div
          className="mesa3d-chip"
          aria-label={`Sentido ${estado.sentido === 1 ? 'horário' : 'anti-horário'}`}
        >
          <span aria-hidden="true">{estado.sentido === 1 ? '↻' : '↺'}</span>
        </div>
        {estado.ataqueAcumulado > 0 && (
          <div className="mesa3d-chip mesa3d-chip-perigo">+{estado.ataqueAcumulado}</div>
        )}
        {falasRapidas && (
          <button
            type="button"
            className="mesa3d-hud-botao"
            aria-label="Falas rápidas"
            aria-expanded={falasAbertas}
            aria-controls="mesa3d-falas"
            onClick={() => setFalasAbertas((abertas) => !abertas)}
          >
            💬
          </button>
        )}
        {acoesHud}
      </header>

      {falasRapidas && falasAbertas && (
        <div id="mesa3d-falas" className="mesa3d-falas" role="group" aria-label="Falas rápidas">
          {estado.silencio.ativo && (
            <p className="mesa3d-falas-aviso">Silêncio ativo: falar agora custa +2.</p>
          )}
          {falasRapidas.opcoes.map((fala) => (
            <button
              key={fala}
              type="button"
              onClick={() => {
                falasRapidas.onEnviar(fala);
                setFalasAbertas(false);
              }}
            >
              {fala}
            </button>
          ))}
        </div>
      )}

      {baloes &&
        [...baloes].map(([id, texto]) => {
          const nome = estado.jogadores.find((jogador) => jogador.id === id)?.nome ?? 'Alguém';
          const posicao = id === jogadorId ? undefined : layout?.assentos[id];
          // Na mesa 2D, o balão do adversário fica na ficha dele.
          if (id !== jogadorId && (modo2D || !posicao)) return null;
          return (
            <div
              key={id}
              className={`mesa3d-balao ${id === jogadorId ? 'mesa3d-balao-meu' : ''}`}
              style={posicao ? { left: posicao.x, top: posicao.y } : undefined}
              role="status"
              aria-live="polite"
              data-jogador={id}
            >
              <span className="sr-only">{id === jogadorId ? 'Você disse' : `${nome} disse`}: </span>
              {texto}
            </div>
          );
        })}

      <SelosDeImpacto
        selos={selos}
        jogadorId={jogadorId}
        assentos={modo2D ? undefined : layout?.assentos}
      />

      {/* Avisos do topo empilhados (nunca um por cima do outro). */}
      <div className="mesa3d-topo">
        {falhaWebGL && (
          <p className="mesa3d-toast" role="status">
            A mesa 3D não está disponível neste aparelho. Você está jogando na mesa 2D.
          </p>
        )}
        {eu?.controladoPorBot && eu.motivoBot === 'INATIVO' && !estado.finalizada && (
          <section className="mesa3d-ausente" role="alert" aria-label="Um bot joga por você">
            <span>Seu tempo acabou e um bot está jogando por você.</span>
            <button
              type="button"
              className="mesa3d-botao-primario"
              onClick={controlador.retomarControle}
            >
              Voltei
            </button>
          </section>
        )}
        {estado.silencio.ativo && (
          <p className="mesa3d-silencio" role="status">
            🤫 SILÊNCIO · quem falar compra +2
          </p>
        )}
        {cartasParaCortar.length > 0 && estado.interceptacao && (
          <section className="mesa3d-corte" aria-label="Corta-Frente" role="alert">
            <strong>Corta-Frente! {segundosCorte}s</strong>
            <span>Arraste sua carta idêntica para o centro ou toque abaixo.</span>
            <div className="mesa3d-corte-botoes">
              {cartasParaCortar.map((carta) => (
                <button
                  key={carta.id}
                  type="button"
                  className="mesa3d-botao-primario"
                  onClick={() => tentarJogar(carta.id)}
                >
                  Cortar com {rotuloDaCarta(carta)}
                </button>
              ))}
            </div>
          </section>
        )}
        {dicaContextual && (
          <section className="mesa3d-coach" aria-label="Dica" data-dica={dicaContextual}>
            <strong>{TEXTO_DICA[dicaContextual].titulo}</strong>
            <span>{TEXTO_DICA[dicaContextual].texto}</span>
            <div className="mesa3d-coach-acoes">
              <button
                type="button"
                className="mesa3d-botao-primario"
                onClick={() => marcarDicas(new Set([...dicasVistas, dicaContextual]))}
              >
                Entendi
              </button>
              <button
                type="button"
                className="mesa3d-botao-link"
                onClick={() => marcarDicas(TODAS_AS_DICAS)}
              >
                Não mostrar dicas
              </button>
            </div>
          </section>
        )}
        {toast && (
          <p
            key={toast.id}
            className={`mesa3d-toast mesa3d-toast-${toast.tipo}`}
            role={toast.tipo === 'erro' ? 'alert' : 'status'}
          >
            {toast.texto}
          </p>
        )}
      </div>

      {!pendente && (
        <p className="mesa3d-dica" aria-hidden="true">
          {dica}
        </p>
      )}

      {faixa && (
        <div
          key={`${faixa.tipo}-${faixa.titulo}`}
          className={`mesa3d-faixa mesa3d-faixa-${faixa.tipo} ${selos.size >= 4 ? 'mesa3d-faixa-afastada' : ''}`}
          aria-hidden="true"
        >
          <strong>{faixa.titulo}</strong>
          <span>{faixa.detalhe}</span>
        </div>
      )}

      {/* Leitor de tela: estado atual e anúncios. */}
      <div className="sr-only" role="status" aria-live="polite">
        {anuncioFalado}
      </div>
      <p className="sr-only" aria-live="polite">
        {dica}
      </p>
      <ul className="sr-only" aria-label="Jogadores">
        {estado.jogadores.map((jogador) => (
          <li key={jogador.id}>
            {jogador.id === jogadorId && jogador.nome !== 'Você'
              ? `Você (${jogador.nome})`
              : jogador.nome}
            : {jogador.quantidadeCartas} {jogador.quantidadeCartas === 1 ? 'carta' : 'cartas'}
            {jogador.id === estado.vezDe && !estado.finalizada ? ', na vez' : ''}
            {jogador.conectado ? '' : ', desconectado'}
            {jogador.controladoPorBot ? `, ${situacaoDoBot(jogador) ?? ''}` : ''}
          </li>
        ))}
      </ul>
      <p className="sr-only">
        Topo do descarte: {rotuloDaCarta(estado.topo)}. Cor ativa: {corAtiva.nomePt}. Monte com{' '}
        {estado.quantidadeMonteCompra} cartas.
      </p>

      {/* Alvos acessíveis alinhados à cena (o ponteiro passa direto para o canvas). */}
      <div className="mesa3d-alvos">
        {modo2D && (
          <ul className="mesa2d-adversarios" aria-hidden="true">
            {adversarios.map((jogador) => (
              <li
                key={jogador.id}
                className={`mesa2d-adversario ${jogador.id === estado.vezDe && !estado.finalizada ? 'mesa2d-na-vez' : ''}`}
              >
                <span className="mesa2d-avatar">
                  {caminhoDoAvatar(jogador.avatar) ? (
                    <img src={caminhoDoAvatar(jogador.avatar)} alt="" width={26} height={26} />
                  ) : (
                    emojiDoAvatar(jogador.avatar)
                  )}
                </span>
                <strong>
                  {jogador.nome}
                  {jogador.controladoPorBot && (
                    <small className="mesa2d-situacao">{situacaoDoBot(jogador)}</small>
                  )}
                </strong>
                <span className="mesa2d-contagem">{jogador.quantidadeCartas}</span>
                {baloes?.get(jogador.id) && (
                  <span className="mesa2d-balao" data-jogador={jogador.id}>
                    {baloes.get(jogador.id)}
                  </span>
                )}
                <SeloDeImpacto selo={selos.get(jogador.id)} onde="ficha" />
              </li>
            ))}
          </ul>
        )}
        <div className={modo2D ? 'mesa2d-centro' : undefined}>
          <button
            type="button"
            className="mesa3d-alvo mesa3d-alvo-monte"
            style={modo2D ? undefined : estiloDoRetangulo(layout?.monte)}
            aria-disabled={!compra.permitido}
            aria-label={
              compra.permitido
                ? `Comprar ${compra.quantidade} ${compra.quantidade === 1 ? 'carta' : 'cartas'} do monte`
                : `Monte: ${compra.motivo ?? 'indisponível'}`
            }
            onClick={comprar}
          >
            {modo2D && (
              <span aria-hidden="true">
                <CartaView
                  verso
                  jogavel={compra.permitido}
                  contador={`${estado.quantidadeMonteCompra}`}
                />
              </span>
            )}
          </button>
          <div
            className="mesa3d-marcador-descarte"
            style={modo2D ? undefined : estiloDoRetangulo(layout?.descarte)}
            aria-hidden="true"
          >
            {modo2D && <CartaView carta={estado.topo} jogavel={false} />}
          </div>
        </div>
        <ul ref={maoRef} className="mesa3d-mao" aria-label={`Sua mão: ${mao.length} cartas`}>
          {mao.map((carta, indice) => {
            const diagnostico = diagnosticos.get(carta.id);
            const situacao = diagnostico?.situacao ?? 'aguardando';
            const selecionada = selecao.includes(carta.id);
            return (
              <li key={carta.id} className="mesa3d-mao-item">
                <button
                  type="button"
                  className="mesa3d-alvo"
                  data-card-id={carta.id}
                  data-situacao={situacao}
                  style={modo2D ? undefined : estiloDoRetangulo(layout?.cartas[carta.id])}
                  aria-pressed={selecionada}
                  aria-label={`${rotuloDaCarta(carta)}, ${descreverSituacao(situacao, diagnostico?.motivo)}`}
                  aria-describedby="mesa3d-ajuda-teclado"
                  onFocus={() => {
                    indiceFocoTecladoRef.current = indice;
                    setFoco(carta.id);
                  }}
                  onBlur={(evento) => {
                    // Foco levado para outro elemento: esquece a posição na mão.
                    if (evento.relatedTarget) indiceFocoTecladoRef.current = undefined;
                    setFoco((atual) => (atual === carta.id ? undefined : atual));
                  }}
                  // Na 2D o toque seleciona (e o segundo toque joga); na 3D quem
                  // clica aqui é o teclado ou o leitor de tela: joga direto.
                  onClick={() => (modo2D ? alternar(carta.id) : tentarJogar(carta.id))}
                  onKeyDown={(evento) => {
                    if (evento.key === 'Enter') {
                      evento.preventDefault();
                      tentarJogar(carta.id);
                    } else if (evento.key === ' ') {
                      evento.preventDefault();
                      alternar(carta.id);
                    } else if (evento.key === 'ArrowRight' || evento.key === 'ArrowLeft') {
                      evento.preventDefault();
                      const passo = evento.key === 'ArrowRight' ? 1 : -1;
                      const botoes = maoRef.current?.querySelectorAll<HTMLButtonElement>('button');
                      botoes?.[(indice + passo + mao.length) % mao.length]?.focus();
                    }
                  }}
                  onKeyUp={(evento) => {
                    if (evento.key === ' ') evento.preventDefault();
                  }}
                >
                  {modo2D && (
                    <span aria-hidden="true">
                      <CartaView
                        carta={carta}
                        pequena
                        jogavel={situacao === 'jogavel' || situacao === 'interceptavel'}
                        selecionada={selecionada}
                      />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p id="mesa3d-ajuda-teclado" className="sr-only">
          Enter joga a carta. Espaço seleciona para descarte múltiplo. Setas mudam de carta.
        </p>
      </div>

      {grupoPronto && !pendente && enviando.length === 0 && (
        <button
          type="button"
          className="mesa3d-botao-grupo"
          onClick={() => {
            const [primeira] = selecao;
            if (primeira) tentarJogar(primeira);
          }}
        >
          Jogar {selecao.length} cartas
        </button>
      )}

      {pendente?.etapa === 'cor' && pendenteCarta && (
        <AnelDeCores
          centro={centroDescarte}
          carta={pendenteCarta}
          onEscolher={confirmarCor}
          onCancelar={() => setPendente(undefined)}
        />
      )}

      {pendente?.etapa === 'alvo' && (
        <EscolhaDeAlvo
          adversarios={adversarios}
          posicoes={layout?.assentos}
          onEscolher={escolherAlvo}
          onCancelar={() => setPendente(undefined)}
        />
      )}

      {confirmarSaida && !estado.finalizada && (
        <div className="mesa3d-modal" role="presentation">
          <section
            className="mesa3d-painel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mesa3d-sair-titulo"
          >
            <h2 id="mesa3d-sair-titulo">Sair da partida?</h2>
            <p>
              {controlador.modo === 'online'
                ? 'Um bot assume o seu lugar e você não poderá voltar a esta partida.'
                : 'A partida atual será encerrada.'}
            </p>
            <div className="mesa3d-painel-acoes">
              <button
                type="button"
                className="mesa3d-botao-secundario"
                autoFocus
                onClick={() => setConfirmarSaida(false)}
              >
                Continuar jogando
              </button>
              <button
                type="button"
                className="mesa3d-botao-primario"
                onClick={() => {
                  setConfirmarSaida(false);
                  onSair();
                }}
              >
                Sair
              </button>
            </div>
          </section>
        </div>
      )}

      {estado.finalizada && (
        <TelaDeFim
          controlador={controlador}
          onJogarDeNovo={onJogarNovamente}
          onVoltarAoMenu={onVoltarAoMenu}
        />
      )}
    </main>
  );
}

function AnelDeCores({
  centro,
  carta,
  onEscolher,
  onCancelar,
}: {
  centro: { x: number; y: number } | undefined;
  carta: Carta;
  onEscolher: (cor: CorJogavel) => void;
  onCancelar: () => void;
}) {
  const primeiroRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primeiroRef.current?.focus(), []);
  return (
    <div className="mesa3d-escolha" role="presentation" onPointerDown={onCancelar}>
      <section
        className="mesa3d-anel"
        role="group"
        aria-label={`Escolha a cor para ${rotuloDaCarta(carta)}`}
        // Centro horizontal da tela (centrado no descarte, o anel sairia pela
        // borda direita no celular); na altura do descarte.
        style={centro ? { top: centro.y } : undefined}
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        {CORES_JOGAVEIS.map((cor, indice) => {
          const info = PALETA_CORES[cor];
          return (
            <button
              key={cor}
              ref={indice === 0 ? primeiroRef : undefined}
              type="button"
              className={`mesa3d-anel-cor mesa3d-anel-cor-${indice}`}
              style={{ '--cor': info.hex } as CSSProperties}
              onClick={() => onEscolher(cor)}
              aria-label={info.nomePt}
            >
              <span aria-hidden="true">{info.simboloAcessivel}</span>
              <small>{info.nomePt}</small>
            </button>
          );
        })}
        <button
          type="button"
          className="mesa3d-anel-cancelar"
          onClick={onCancelar}
          aria-label="Cancelar e voltar a carta para a mão"
        >
          ✕
        </button>
      </section>
    </div>
  );
}

function EscolhaDeAlvo({
  adversarios,
  posicoes,
  onEscolher,
  onCancelar,
}: {
  adversarios: ReadonlyArray<EstadoPartidaPublico['jogadores'][number]>;
  posicoes: LayoutProjetado['assentos'] | undefined;
  onEscolher: (alvoId: string) => void;
  onCancelar: () => void;
}) {
  const primeiroRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primeiroRef.current?.focus(), []);
  return (
    <div className="mesa3d-escolha" role="presentation">
      <section
        className={`mesa3d-escolha-alvo ${posicoes ? '' : 'mesa3d-escolha-alvo-lista'}`}
        role="group"
        aria-label="Escolha com quem trocar de mão"
      >
        <p className="mesa3d-escolha-titulo">Trocar de mão com quem?</p>
        {adversarios.map((jogador, indice) => {
          const posicao = posicoes?.[jogador.id];
          return (
            <button
              key={jogador.id}
              ref={indice === 0 ? primeiroRef : undefined}
              type="button"
              className="mesa3d-alvo-jogador"
              style={posicao ? { left: posicao.x, top: posicao.y } : undefined}
              onClick={() => onEscolher(jogador.id)}
            >
              {jogador.nome} · {jogador.quantidadeCartas}{' '}
              {jogador.quantidadeCartas === 1 ? 'carta' : 'cartas'}
            </button>
          );
        })}
        <button
          type="button"
          className="mesa3d-botao-secundario mesa3d-escolha-cancelar"
          onClick={onCancelar}
        >
          Cancelar
        </button>
      </section>
    </div>
  );
}

export default Mesa3D;
