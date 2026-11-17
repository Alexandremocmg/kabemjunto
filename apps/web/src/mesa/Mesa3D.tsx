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
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Carta, EstadoPartidaPublico } from '@kabemjunto/shared';
import { saoCartasIdenticas } from '@kabemjunto/shared';
import { BARALHO_COMPLETO_108 } from '@kabemjunto/shared/constants';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import { VitoriaAnimada } from '../components/VitoriaAnimada';
import { derivarAnuncios, inferirQuemJogou, type Anuncio } from './anuncios';
import {
  CenaMesa,
  type EventosCena,
  type InstantaneoCena,
  type LayoutProjetado,
  type Retangulo,
} from './cena/CenaMesa';
import { temaDaMesa } from './cena/texturas';
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
import { prefereMovimentoReduzido } from './preferencias';
import { CORES_JOGAVEIS, type ControladorMesa, type CorJogavel } from './tipos';
import './mesa3d.css';

export interface Mesa3DProps {
  controlador: ControladorMesa;
  onSair: () => void;
  onJogarNovamente: () => void;
  /** WebGL indisponível ou perdido: troca para a mesa 2D. */
  onUsar2D: () => void;
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

export function Mesa3D({ controlador, onSair, onJogarNovamente, onUsar2D }: Mesa3DProps) {
  const { estado, mao, jogadorId, aviso } = controlador;
  const tema = useMemo(() => temaDaMesa(lerTema()), []);
  const movimentoReduzido = useMemo(prefereMovimentoReduzido, []);

  const palcoRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cenaRef = useRef<CenaMesa>();
  const eventosRef = useRef<Omit<EventosCena, 'aoProjetar' | 'aoPerderContexto'>>();
  const ultimaTentativaRef = useRef<string>();
  const sequenciaToastRef = useRef(0);
  const maoRef = useRef<HTMLUListElement>(null);
  /** Posição da carta com foco de teclado, para o foco não cair no `body` quando ela sai da mão. */
  const indiceFocoTecladoRef = useRef<number>();

  const [falhaWebGL, setFalhaWebGL] = useState(false);
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
  const [agora, setAgora] = useState(() => Date.now());

  // Estado anterior, guardado como estado derivado (padrão oficial do React):
  // é o que permite saber quem jogou e o que mudou entre dois instantâneos.
  const [historico, setHistorico] = useState<{
    atual: EstadoPartidaPublico;
    anterior?: EstadoPartidaPublico;
  }>({ atual: estado });
  if (historico.atual !== estado) setHistorico({ atual: estado, anterior: historico.atual });

  const minhaVez = estado.vezDe === jogadorId && !estado.finalizada;
  const compra = diagnosticarCompra(estado, mao, jogadorId);
  const janela = janelaInterceptavel(estado, jogadorId);
  const adversarios = useMemo(
    () => ordenarAdversarios(estado.jogadores, jogadorId),
    [estado.jogadores, jogadorId],
  );
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const palco = palcoRef.current;
    if (!canvas || !palco) return undefined;
    let cena: CenaMesa;
    try {
      cena = new CenaMesa(
        canvas,
        {
          aoSoltarNoCentro: (id) => eventosRef.current?.aoSoltarNoCentro(id),
          aoTocarCarta: (id) => eventosRef.current?.aoTocarCarta(id),
          aoTocarMonte: () => eventosRef.current?.aoTocarMonte(),
          aoTocarCentro: () => eventosRef.current?.aoTocarCentro(),
          aoProjetar: (novo) => setLayout((atual) => (layoutsIguais(atual, novo) ? atual : novo)),
          aoPerderContexto: () => setFalhaWebGL(true),
        },
        { tema, movimentoReduzido },
      );
    } catch {
      setFalhaWebGL(true);
      return undefined;
    }
    cenaRef.current = cena;
    cena.aquecerFaces(BARALHO_COMPLETO_108);
    const medir = () => {
      const caixa = palco.getBoundingClientRect();
      cena.redimensionar(caixa.width, caixa.height, window.devicePixelRatio || 1);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(palco);
    // Diagnóstico só de leitura (FPS, chamadas de desenho), usado nos testes de performance.
    (window as unknown as Record<string, unknown>)['__kabemjuntoMesa'] = {
      estatisticas: () => cena.estatisticas(),
    };
    return () => {
      observador.disconnect();
      cena.destruir();
      cenaRef.current = undefined;
      delete (window as unknown as Record<string, unknown>)['__kabemjuntoMesa'];
    };
  }, [movimentoReduzido, tema]);

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
    cenaRef.current?.atualizar(instantaneo);
  }, [instantaneo]);

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

  if (falhaWebGL) {
    return (
      <main className="mesa3d mesa3d-falha" style={{ background: tema.fundo }}>
        <section className="mesa3d-painel" role="alert">
          <h1>A mesa 3D não está disponível</h1>
          <p>
            Este aparelho ou navegador não conseguiu desenhar a mesa 3D. A partida continua na mesa
            2D, do ponto em que parou.
          </p>
          <button type="button" className="mesa3d-botao-primario" onClick={onUsar2D}>
            Usar mesa 2D
          </button>
        </section>
      </main>
    );
  }

  const corAtiva = PALETA_CORES[estado.corAtiva];
  const segundosCorte = estado.interceptacao
    ? Math.max(0, Math.ceil((estado.interceptacao.fechaEm - agora) / 1000))
    : 0;
  const pendenteCarta = pendente ? mao.find((carta) => carta.id === pendente.cartaId) : undefined;
  const vencedor = estado.jogadores.find((jogador) => jogador.id === estado.vencedor);
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
  else if (grupoPronto) dica = `Arraste o grupo de ${selecao.length} cartas até o centro.`;
  else if (estado.ataqueAcumulado > 0)
    dica = compra.permitido
      ? `Ataque +${estado.ataqueAcumulado}: cubra com +2, +4 ou 0+, ou toque no monte.`
      : `Ataque +${estado.ataqueAcumulado}: cubra com +2, +4 ou 0+.`;
  else if (compra.permitido) dica = 'Nenhuma carta serve: toque no monte para comprar.';
  else dica = 'Arraste uma carta até o centro da mesa.';

  return (
    <main
      className="mesa3d"
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
      <div ref={palcoRef} className="mesa3d-palco">
        <canvas ref={canvasRef} className="mesa3d-canvas" aria-hidden="true" />
      </div>

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
      </header>

      {estado.silencio.ativo && (
        <p className="mesa3d-silencio" role="status">
          🤫 SILÊNCIO · quem falar compra +2
        </p>
      )}

      {!pendente && (
        <p className="mesa3d-dica" aria-hidden="true">
          {dica}
        </p>
      )}

      {faixa && (
        <div
          key={`${faixa.tipo}-${faixa.titulo}`}
          className={`mesa3d-faixa mesa3d-faixa-${faixa.tipo}`}
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
          </li>
        ))}
      </ul>
      <p className="sr-only">
        Topo do descarte: {rotuloDaCarta(estado.topo)}. Cor ativa: {corAtiva.nomePt}. Monte com{' '}
        {estado.quantidadeMonteCompra} cartas.
      </p>

      {/* Alvos acessíveis alinhados à cena (o ponteiro passa direto para o canvas). */}
      <div className="mesa3d-alvos">
        <div
          className="mesa3d-marcador-descarte"
          style={estiloDoRetangulo(layout?.descarte)}
          aria-hidden="true"
        />
        <button
          type="button"
          className="mesa3d-alvo"
          style={estiloDoRetangulo(layout?.monte)}
          aria-disabled={!compra.permitido}
          aria-label={
            compra.permitido
              ? `Comprar ${compra.quantidade} ${compra.quantidade === 1 ? 'carta' : 'cartas'} do monte`
              : `Monte: ${compra.motivo ?? 'indisponível'}`
          }
          onClick={comprar}
        />
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
                  style={estiloDoRetangulo(layout?.cartas[carta.id])}
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
                  onClick={() => tentarJogar(carta.id)}
                  onKeyDown={(evento) => {
                    if (evento.key === ' ') {
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
                />
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

      {toast && (
        <p
          key={toast.id}
          className={`mesa3d-toast mesa3d-toast-${toast.tipo}`}
          role={toast.tipo === 'erro' ? 'alert' : 'status'}
        >
          {toast.texto}
        </p>
      )}

      {confirmarSaida && (
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
                ? 'Você abandona a partida e não poderá voltar a ela.'
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

      {estado.finalizada && vencedor && (
        <VitoriaAnimada
          vencedorNome={vencedor.nome}
          isVoce={vencedor.id === jogadorId}
          onJogarNovamente={onJogarNovamente}
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
        className="mesa3d-escolha-alvo"
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
