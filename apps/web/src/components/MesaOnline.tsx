import React, { useEffect, useRef, useState } from 'react';
import type {
  Carta,
  EstadoPartidaPublico,
  JogadorPublico,
  ServerChatEvent,
} from '@kabemjunto/shared';
import { saoCartasIdenticas } from '@kabemjunto/shared';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import { validarJogadaPublica } from '../services/validarJogadaPublica';
import { CartaView } from './CartaView';
import { InterceptacaoBanner } from './InterceptacaoBanner';
import {
  appendCardToMultipleDiscardStack,
  canSelectMultipleDiscardCard,
  createMultipleDiscardStack,
  findFirstValidInStack,
  getSelectedMultipleDiscardCards,
  isEligibleForMultipleDiscard,
  passouDoLimiarDeArrasto,
  reconcileStacks,
  rotateStack,
  temMesmaFace,
} from './multipleDiscard';

interface MesaOnlineProps {
  estado: EstadoPartidaPublico;
  mao: ReadonlyArray<Carta>;
  mensagens: ReadonlyArray<ServerChatEvent>;
  jogadorId?: string | undefined;
  selectedCardId?: string | undefined;
  onSelecionarCarta: (carta: Carta) => void;
  onPlayMultiple?: (cartas: ReadonlyArray<Carta>) => void;
  onComprarCarta: () => void;
  onEnviarFalaRapida: (texto: string) => void;
  /** Incrementado pelo socketClient cada vez que server:erro dispara com batch pendente. */
  descarteMultiploErro?: number | undefined;
  /** Corta-Frente: envia o pedido de interceptação. O servidor decide o vencedor. */
  onInterceptar?: (janelaId: string, revisao: number, cartaId: string) => void;
}

const FALAS_RAPIDAS = [
  'Boa jogada!',
  'Sua vez!',
  'Vou comprar.',
  'Calma aí!',
  'Vamos lá!',
  'GG!',
] as const;
const DURACAO_BALAO_FALA_MS = 5000;

type BalaoFala = { chave: ServerChatEvent; texto: string };

function SentidoIcone({ sentido }: { sentido: number }) {
  return (
    <span aria-hidden="true" className="status-sentido-icone">
      {sentido === 1 ? '↻' : '↺'}
    </span>
  );
}

function BalaoDeFala({ nome, texto }: { nome: string; texto: string }) {
  return (
    <div className="chat-speech-bubble" role="status" aria-live="polite">
      <span className="sr-only">{nome} disse: </span>
      {texto}
    </div>
  );
}

function AssentoOnline({
  jogador,
  index,
  totalJogadores,
  ativo,
  balaoFala,
}: {
  jogador: JogadorPublico;
  index: number;
  totalJogadores: number;
  ativo: boolean;
  balaoFala?: string | undefined;
}) {
  const angle = (index * 360) / totalJogadores;
  const radians = (angle * Math.PI) / 180;
  const bubbleDirection =
    Math.abs(Math.sin(radians)) > Math.abs(Math.cos(radians))
      ? Math.sin(radians) > 0
        ? 'right'
        : 'left'
      : -Math.cos(radians) < 0
        ? 'top'
        : 'bottom';
  return (
    <div
      className={`player-seat player-seat-ring ${ativo ? 'active' : ''} ${balaoFala ? 'has-speech' : ''} speech-outward-${bubbleDirection}`}
      style={
        {
          '--seat-angle': `${angle}deg`,
          '--seat-offset-x': `${Math.sin(radians) * 140}px`,
          '--seat-offset-y': `${-Math.cos(radians) * 160}px`,
        } as React.CSSProperties
      }
      data-seat-index={index}
      aria-label={`${jogador.nome}${ativo ? ' — vez deste jogador' : ''} · ${jogador.quantidadeCartas} cartas · ${jogador.conectado ? 'Online' : 'Offline'}`}
    >
      {balaoFala && <BalaoDeFala nome={jogador.nome} texto={balaoFala} />}
      <div className="player-seat-avatar" aria-hidden="true">
        {jogador.avatar || '👤'}
      </div>
      <div className="player-seat-copy">
        <strong>{jogador.nome}</strong>
        <span>{jogador.conectado ? 'Online' : 'Offline'}</span>
      </div>
      <div
        className={`player-seat-count ${!jogador.conectado ? 'player-seat-count-offline' : ''}`}
        aria-label={`${jogador.quantidadeCartas} cartas`}
      >
        {jogador.quantidadeCartas}
      </div>
    </div>
  );
}

export const MesaOnline: React.FC<MesaOnlineProps> = ({
  estado,
  mao,
  mensagens,
  jogadorId,
  selectedCardId,
  onSelecionarCarta,
  onPlayMultiple,
  onComprarCarta,
  onEnviarFalaRapida,
  descarteMultiploErro,
  onInterceptar,
}) => {
  const [falasRapidasAbertas, setFalasRapidasAbertas] = useState(false);
  // Multiple ordered stacks; each inner array is card IDs in play order
  const [stacks, setStacks] = useState<ReadonlyArray<ReadonlyArray<string>>>([]);
  // The stack currently being sent to the server (null = none)
  const [sendingStack, setSendingStack] = useState<ReadonlyArray<string> | null>(null);
  // Trava síncrona: impede dois emits no mesmo tick antes do próximo render React.
  const batchPendingRef = useRef(false);
  const [stackFeedback, setStackFeedback] = useState('');
  // Whether a vertical drag has activated the drop zone
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const dragAnchorRef = useRef<{
    carta: Carta;
    primeiraCartaJogavel: boolean;
    x: number;
    y: number;
    /** index into `stacks` array if dragging a stack for execution, else -1 */
    stackIndex: number;
    locked: 'none' | 'horizontal' | 'vertical';
    pointerType: string;
  }>();
  const suppressNextClickRef = useRef(false);
  const ultimoPonteiroFoiToqueRef = useRef(false);
  const prevMaoRef = useRef<ReadonlyArray<Carta>>(mao);
  const [baloesDeFala, setBaloesDeFala] = useState<ReadonlyMap<string, BalaoFala>>(new Map());
  const mensagensVistasRef = useRef(new WeakSet<ServerChatEvent>());
  const timersDeBalaoRef = useRef(new Map<string, number>());
  const minhaVez = estado.vezDe === jogadorId;
  const podeJogarCarta = (carta: Carta): boolean =>
    validarJogadaPublica(estado, carta, jogadorId ?? '').valida;
  // GDD §7: comprar só existe pra quem não tem carta válida na mão. TROCA_MAO
  // nunca bloqueia a compra — o jogador não é obrigado a trocar de mão só
  // para poder comprar (decisão de produto, ver buy-cards.ts no shared).
  const temCartaValida =
    minhaVez &&
    estado.ataqueAcumulado === 0 &&
    mao.some((carta) => carta.acao !== 'TROCA_MAO' && podeJogarCarta(carta));
  const jogadorAtual = estado.jogadores.find((jogador) => jogador.id === estado.vezDe);
  const jogadorLocal = estado.jogadores.find((jogador) => jogador.id === jogadorId);
  const jogadoresRemotos = estado.jogadores.filter((jogador) => jogador.id !== jogadorId);
  const corAtiva = estado.corAtiva ?? 'LARANJA';
  const infoCor = PALETA_CORES[corAtiva] ?? PALETA_CORES.NEUTRO;
  const balaoLocal = jogadorId ? baloesDeFala.get(jogadorId) : undefined;
  // Corta-Frente: quem descartou a carta alvo não pode interceptar a própria
  // jogada (regra #6 do plano); os demais veem o banner com as cartas da
  // própria mão que são idênticas (mesma cor e mesmo número/ação) ao topo.
  const janelaInterceptacao =
    estado.interceptacao && jogadorId && estado.interceptacao.jogadorOrigemId !== jogadorId
      ? estado.interceptacao
      : undefined;
  const cartasElegiveisParaInterceptar = janelaInterceptacao
    ? mao.filter((carta) => saoCartasIdenticas(carta, estado.topo))
    : [];

  // Build card-to-stack-index lookup for rendering
  const cardToStackIndex = new Map<string, number>();
  stacks.forEach((stack, idx) => {
    stack.forEach((id) => cardToStackIndex.set(id, idx));
  });

  // ── Turn-start reconciliation ─────────────────────────────────────────────
  // When our turn starts: cancel singleton stacks; promote valid card in multi-card stacks
  useEffect(() => {
    if (estado.vezDe !== jogadorId) return;
    const reconciliadas = reconcileStacks(stacks, mao);
    const promovidas = reconciliadas.map((stack) =>
      findFirstValidInStack(stack, mao, (carta) => podeJogarCarta(carta)),
    );
    setStacks(promovidas);
    setSendingStack(null);
    batchPendingRef.current = false;
    if (promovidas.length > 0) {
      const primeiroId = promovidas[0]?.[0];
      const carta = primeiroId ? mao.find((c) => c.id === primeiroId) : undefined;
      if (carta && podeJogarCarta(carta)) {
        const face = carta.tipo === 'NUMERADA' ? `${carta.valor}` : (carta.acao ?? '');
        setStackFeedback(`Pilha pronta — primeira carta: ${face} ${carta.cor}.`);
      }
    }
  }, [estado.vezDe, jogadorId]);

  // ── ACK reconciliation ────────────────────────────────────────────────────
  // When mao changes while a stack is "sending": check if sent cards were accepted.
  // Rejection is only signalled via descarteMultiploErro (server:erro); mao change alone
  // does NOT imply rejection because Troca/Gira can change mao while the batch is pending.
  useEffect(() => {
    if (!sendingStack || prevMaoRef.current === mao) return;
    const sentIds = new Set(sendingStack);
    const anySentCardStillInMao = mao.some((c) => sentIds.has(c.id));
    if (!anySentCardStillInMao) {
      // Server accepted: remove the sent stack and reconcile remaining stacks
      setStacks((atuais) =>
        reconcileStacks(
          atuais.filter((s) => s !== sendingStack),
          mao,
        ),
      );
      setSendingStack(null);
      batchPendingRef.current = false;
      setStackFeedback('Jogada aceita!');
    }
    // If sent cards still in mao: do NOT treat as rejection here.
    // Rejection is handled by the descarteMultiploErro effect below.
  }, [mao, sendingStack]);

  // ── Bug-1 fix: server:erro rejection via descarteMultiploErro counter ─────
  // Fires when the socket layer increments descarteMultiploErro after a batch error.
  useEffect(() => {
    if (!descarteMultiploErro) return;
    if (!sendingStack) return;
    // Clear sending state but PRESERVE the stack in stacks
    setSendingStack(null);
    batchPendingRef.current = false;
    setStackFeedback('Jogada rejeitada — pilha preservada. Tente novamente.');
  }, [descarteMultiploErro]);

  // ── Destrava de segurança do estado "enviando" ───────────────────────────
  // `.stack-sending` aplica `pointer-events: none`. Se o aceite não correlacionar
  // e nenhum erro chegar (queda de rede, evento perdido), a pilha ficaria sem
  // resposta para sempre — as cartas "travam". Nunca deixamos a UI presa por
  // falta de resposta: o servidor continua sendo a autoridade da jogada, isto só
  // devolve o controle ao jogador.
  useEffect(() => {
    if (!sendingStack) return undefined;
    const timer = window.setTimeout(() => {
      setSendingStack(null);
      batchPendingRef.current = false;
      setStackFeedback('Sem resposta do servidor. Pilha preservada — tente novamente.');
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [sendingStack]);

  // ── Bug-2 fix: always reconcile stacks on mao change ─────────────────────
  // Handles Troca/Gira and other off-turn events removing cards from stacks.
  useEffect(() => {
    setStacks((atuais) => reconcileStacks(atuais, mao));
  }, [mao]);

  useEffect(() => {
    prevMaoRef.current = mao;
  });

  // ── Stack helpers ─────────────────────────────────────────────────────────

  function findStackAnchorCard(stackIdx: number): Carta | undefined {
    const stack = stacks[stackIdx];
    if (!stack) return undefined;
    return mao.find((c) => c.id === stack[0]);
  }

  function isStackValid(stackIdx: number): boolean {
    const anchor = findStackAnchorCard(stackIdx);
    return anchor !== undefined && podeJogarCarta(anchor);
  }

  function stackStateClass(stackIdx: number): string {
    if (sendingStack !== null) return 'stack-sending';
    if (!minhaVez) return 'stack-prepared';
    return isStackValid(stackIdx) ? 'stack-valid' : 'stack-blocked';
  }

  function executarPilha(stackIdx: number): void {
    if (batchPendingRef.current || sendingStack !== null) {
      setStackFeedback('Aguarde a confirmação da jogada anterior.');
      return;
    }
    const stack = stacks[stackIdx];
    if (!stack || stack.length < 2 || !onPlayMultiple) return;
    if (!isStackValid(stackIdx)) return;
    const cartas = getSelectedMultipleDiscardCards(mao, stack);
    if (cartas.length < 2) return;
    batchPendingRef.current = true;
    setSendingStack(stack);
    setStackFeedback('Enviando jogada…');
    onPlayMultiple(cartas);
  }

  function rotarPilha(stackIdx: number): void {
    setStacks((atuais) => {
      const copia = [...atuais];
      copia[stackIdx] = rotateStack(atuais[stackIdx]!);
      return copia;
    });
    setStackFeedback('Ordem da pilha rotacionada.');
  }

  // ── Off-turn organization ─────────────────────────────────────────────────

  function tocarCartaForaDaVez(carta: Carta): void {
    if (!isEligibleForMultipleDiscard(carta)) return;

    setStacks((atuais) => {
      // Already in a stack → ignore (to toggle, tap stack body instead)
      if (atuais.some((s) => s.includes(carta.id))) return atuais;

      // Find a matching-face stack to extend
      const matchIdx = atuais.findIndex((s) => {
        const anchor = mao.find((c) => c.id === s[0]);
        return anchor !== undefined && temMesmaFace(anchor, carta);
      });

      if (matchIdx >= 0) {
        const copia = [...atuais];
        copia[matchIdx] = appendCardToMultipleDiscardStack(atuais[matchIdx]!, carta, mao);
        const novaLen = copia[matchIdx]!.length;
        setStackFeedback(
          novaLen > (atuais[matchIdx]?.length ?? 0)
            ? `Pilha com ${novaLen} cartas. Arraste para jogar na sua vez.`
            : 'Essa carta não tem a mesma face da pilha.',
        );
        return copia;
      }

      // Create singleton (anchors are only kept if a second card joins before turn)
      setStackFeedback('Pilha armada: toque outra carta de mesma face para preparar.');
      return [...atuais, [carta.id]];
    });
  }

  // ── On-turn card tap ──────────────────────────────────────────────────────

  function tocarCartaNaVez(carta: Carta, primeiraCartaJogavel: boolean): void {
    if (!onPlayMultiple) return;

    const stackIdx = cardToStackIndex.get(carta.id) ?? -1;
    if (stackIdx >= 0 && (stacks[stackIdx]?.length ?? 0) >= 2) {
      // Tapping a card in a multi-card stack → body tap handled by stack onClick (rotation)
      return;
    }

    // Standard single-card selection flow (preserved from original)
    const singletonStackIdx = stacks.findIndex((s) => s.length === 1);

    if (stacks.length === 0 || singletonStackIdx < 0) {
      onSelecionarCarta(carta);
      if (!canSelectMultipleDiscardCard([], carta, mao, primeiraCartaJogavel)) return;
      setStacks((atuais) => [...atuais, [carta.id]]);
      setStackFeedback(
        'Pilha armada: toque outra carta de mesma face ou toque de novo para jogar.',
      );
      return;
    }

    const singleton = stacks[singletonStackIdx]!;
    if (singleton[0] === carta.id) {
      // Second tap on same card → play single card
      setStacks((atuais) => atuais.filter((_, i) => i !== singletonStackIdx));
      setStackFeedback('Jogada comum confirmada.');
      onSelecionarCarta(carta);
      return;
    }

    // Tap different card of same face → extend to 2-card stack
    const proximas = appendCardToMultipleDiscardStack(singleton, carta, mao);
    setStackFeedback(
      proximas === singleton
        ? 'Essa carta não tem a mesma face da pilha.'
        : `Pilha com ${proximas.length} cartas. Arraste para jogar.`,
    );
    setStacks((atuais) => {
      const copia = [...atuais];
      copia[singletonStackIdx] = proximas;
      return copia;
    });
  }

  // ── Pointer handlers ──────────────────────────────────────────────────────

  function iniciarArrasto(
    event: React.PointerEvent<HTMLDivElement>,
    carta: Carta,
    primeiraCartaJogavel: boolean,
  ): void {
    ultimoPonteiroFoiToqueRef.current = event.pointerType === 'touch';

    const stackIdx = cardToStackIndex.get(carta.id) ?? -1;

    // For on-turn stack execute drag
    if (minhaVez && stackIdx >= 0 && stacks[stackIdx]![0] === carta.id) {
      dragAnchorRef.current = {
        carta,
        primeiraCartaJogavel,
        x: event.clientX,
        y: event.clientY,
        stackIndex: stackIdx,
        locked: 'none',
        pointerType: event.pointerType,
      };
      capturarPonteiro(event);
      return;
    }

    // For grouping drag (creating stacks by dragging anchor to target)
    if (
      minhaVez &&
      (stacks.some((s) => s.includes(carta.id)) ||
        canSelectMultipleDiscardCard([], carta, mao, primeiraCartaJogavel))
    ) {
      dragAnchorRef.current = {
        carta,
        primeiraCartaJogavel,
        x: event.clientX,
        y: event.clientY,
        stackIndex: -1,
        locked: 'none',
        pointerType: event.pointerType,
      };
      capturarPonteiro(event);
    }
  }

  function capturarPonteiro(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.pointerType !== 'touch') return;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Eventos sintéticos E2E não representam um ponteiro físico capturável.
    }
  }

  function liberarCaptura(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }

  /**
   * `pointercancel` é comum em touch (o browser assume scroll, gesto do sistema,
   * segundo dedo na tela). Sem tratar, o `pointerup` nunca chega: o estado de
   * arrasto fica preenchido e a captura do ponteiro fica pendurada, deixando as
   * cartas sem responder ao próximo toque.
   */
  function cancelarArrasto(event: React.PointerEvent<HTMLDivElement>): void {
    dragAnchorRef.current = undefined;
    setDropZoneActive(false);
    liberarCaptura(event);
  }

  function moverArrastoDePilha(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragAnchorRef.current;
    if (!drag || drag.stackIndex < 0) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) return;

    if (drag.locked === 'none') {
      if (Math.abs(dy) > Math.abs(dx) * 1.5 && dy < 0) {
        drag.locked = 'vertical';
      } else if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        drag.locked = 'horizontal';
      }
    }

    if (drag.locked === 'vertical' && dy < -40) {
      setDropZoneActive(true);
    } else if (drag.locked !== 'vertical') {
      setDropZoneActive(false);
    }
  }

  function soltarNaCarta(event: React.PointerEvent<HTMLDivElement>, fallbackTarget: Carta): void {
    const drag = dragAnchorRef.current;
    dragAnchorRef.current = undefined;
    liberarCaptura(event);

    // If dropping from an execute-drag, check the drop zone
    if (drag && drag.stackIndex >= 0) {
      setDropZoneActive(false);
      const inZone = (() => {
        if (!dropZoneRef.current) return false;
        const rect = dropZoneRef.current.getBoundingClientRect();
        return (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        );
      })();
      if (inZone && drag.locked === 'vertical' && minhaVez) {
        executarPilha(drag.stackIndex);
      }
      return;
    }

    if (!drag) return;
    if (
      !passouDoLimiarDeArrasto(drag.pointerType, event.clientX - drag.x, event.clientY - drag.y)
    ) {
      return;
    }

    // Houve arrasto de verdade: o clique sintético que o browser dispara em
    // seguida NUNCA pode virar confirmação de jogada. Antes isto só era marcado
    // quando a pilha era montada com sucesso, então arrastar e errar o alvo
    // (soltar no vazio ou sobre carta de outra face) descartava a carta.
    suppressNextClickRef.current = true;

    // Group drag (existing logic)
    const cardIdAtExpandedPointer = Array.from(
      document.querySelectorAll<HTMLElement>('[data-card-id]'),
    ).find((element) => {
      const rect = element.getBoundingClientRect();
      return (
        event.clientX >= rect.left - 32 &&
        event.clientX <= rect.right + 32 &&
        event.clientY >= rect.top - 32 &&
        event.clientY <= rect.bottom + 32
      );
    })?.dataset.cardId;
    const target = mao.find((carta) => carta.id === cardIdAtExpandedPointer) ?? fallbackTarget;
    if (drag.carta.id === target.id) return;

    // A leitura do estado precisa ser funcional: dois arrastos podem ocorrer
    // antes do próximo render, e ler `stacks` do closure perderia o primeiro.
    // O updater é puro (só calcula); o feedback sai fora dele, porque em
    // StrictMode o updater roda duas vezes e efeitos colaterais duplicariam.
    const existingStackIdx = cardToStackIndex.get(drag.carta.id) ?? -1;
    let tamanhoAgrupado = 0;

    setStacks((atuais) => {
      if (existingStackIdx >= 0) {
        const atual = atuais[existingStackIdx];
        if (!atual || !temMesmaFace(drag.carta, target)) return atuais;
        const updated = appendCardToMultipleDiscardStack(atual, target, mao);
        if (updated === atual) return atuais;
        tamanhoAgrupado = updated.length;
        return atuais.map((s, i) => (i === existingStackIdx ? updated : s));
      }
      const proximas = createMultipleDiscardStack(
        drag.carta,
        target,
        mao,
        drag.primeiraCartaJogavel,
      );
      if (proximas.length === 0) return atuais;
      tamanhoAgrupado = proximas.length;
      return [...atuais, proximas];
    });

    setStackFeedback(
      tamanhoAgrupado > 0
        ? `Pilha com ${tamanhoAgrupado} cartas. Arraste para jogar.`
        : // Arrasto válido que não agrupou: avisa o motivo em vez de jogar a carta.
          'Essa carta não tem a mesma face da pilha.',
    );
  }

  // ── Chat effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    const ultimasMensagens = new Map<string, ServerChatEvent>();
    mensagens.forEach((mensagem) => ultimasMensagens.set(mensagem.jogadorId, mensagem));

    ultimasMensagens.forEach((mensagem, jogadorDaMensagemId) => {
      if (mensagensVistasRef.current.has(mensagem)) return;
      mensagensVistasRef.current.add(mensagem);
      const timerAnterior = timersDeBalaoRef.current.get(jogadorDaMensagemId);
      if (timerAnterior !== undefined) window.clearTimeout(timerAnterior);

      setBaloesDeFala((atuais) => {
        const proximos = new Map(atuais);
        proximos.set(jogadorDaMensagemId, { chave: mensagem, texto: mensagem.texto });
        return proximos;
      });

      const timer = window.setTimeout(() => {
        setBaloesDeFala((atuais) => {
          if (atuais.get(jogadorDaMensagemId)?.chave !== mensagem) return atuais;
          const proximos = new Map(atuais);
          proximos.delete(jogadorDaMensagemId);
          return proximos;
        });
        timersDeBalaoRef.current.delete(jogadorDaMensagemId);
      }, DURACAO_BALAO_FALA_MS);
      timersDeBalaoRef.current.set(jogadorDaMensagemId, timer);
    });
  }, [mensagens]);

  useEffect(
    () => () => {
      timersDeBalaoRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  function enviarFalaRapida(texto: string): void {
    onEnviarFalaRapida(texto);
    setFalasRapidasAbertas(false);
  }

  // ── Drag drop zone label ──────────────────────────────────────────────────
  const draggingStackIdx =
    dragAnchorRef.current?.stackIndex !== undefined && dragAnchorRef.current.stackIndex >= 0
      ? dragAnchorRef.current.stackIndex
      : null;
  const dropZoneCardCount = draggingStackIdx !== null ? (stacks[draggingStackIdx]?.length ?? 0) : 0;

  return (
    <div className="table-area online-table-area">
      {/* Drop zone for vertical drag execution */}
      {dropZoneActive && (
        <div
          ref={dropZoneRef}
          className="discard-drop-zone"
          role="status"
          aria-live="assertive"
          aria-label={`Solte aqui para jogar ${dropZoneCardCount} cartas`}
        >
          Solte aqui para jogar {dropZoneCardCount} {dropZoneCardCount === 1 ? 'carta' : 'cartas'}
        </div>
      )}

      <div className="table-status-bar" aria-label="Status da mesa online">
        {estado.silencio.ativo && (
          <p className="online-silence-warning" role="status">
            SILÊNCIO ATIVO · falar custa +2
          </p>
        )}
        <div
          className="status-pill"
          style={{ '--kb-pill-accent': infoCor.hex } as React.CSSProperties}
        >
          <span
            className="status-color-dot"
            style={{ background: infoCor.hex }}
            aria-hidden="true"
          />
          <span className="status-label">Cor</span>
          <strong style={{ color: infoCor.hex }}>{infoCor.nomePt}</strong>
        </div>

        <div className="status-pill">
          <SentidoIcone sentido={estado.sentido} />
          <span className="status-label">Sentido</span>
          <strong>{estado.sentido === 1 ? 'Horário' : 'Anti-horário'}</strong>
        </div>

        {estado.ataqueAcumulado > 0 && (
          <div className="status-pill status-pill-danger" role="status">
            <span aria-hidden="true">⚡</span>
            <strong>Ataque +{estado.ataqueAcumulado}</strong>
          </div>
        )}
      </div>

      <div className="online-play-stage">
        {janelaInterceptacao && (
          <InterceptacaoBanner
            cartaAlvo={estado.topo}
            fechaEm={janelaInterceptacao.fechaEm}
            cartasElegiveis={cartasElegiveisParaInterceptar}
            onInterceptar={(cartaId) =>
              onInterceptar?.(janelaInterceptacao.janelaId, janelaInterceptacao.revisao, cartaId)
            }
          />
        )}
        <div
          className={`player-table player-table-ring player-count-${Math.min(jogadoresRemotos.length, 10)}`}
          aria-label="Jogadores remotos na mesa online"
        >
          {jogadoresRemotos.map((jogador, index) => (
            <AssentoOnline
              key={jogador.id}
              jogador={jogador}
              index={index}
              totalJogadores={jogadoresRemotos.length}
              ativo={jogador.id === estado.vezDe}
              balaoFala={baloesDeFala.get(jogador.id)?.texto}
            />
          ))}
        </div>

        <div className="table-center" aria-label="Núcleo da mesa online">
          <div
            className="deck-slot"
            title={
              !minhaVez
                ? 'Aguardando sua vez'
                : temCartaValida
                  ? 'Você tem uma carta válida na mão'
                  : 'Comprar carta'
            }
          >
            <CartaView
              verso
              contador={`${estado.quantidadeMonteCompra}`}
              jogavel={minhaVez && !temCartaValida}
              {...(!minhaVez
                ? { motivoBloqueio: 'Aguardando o turno.' }
                : temCartaValida
                  ? { motivoBloqueio: 'Você tem uma carta válida na mão — jogue-a.' }
                  : {})}
              onClick={onComprarCarta}
            />
            <span className="pile-label pile-label-deck">MONTE</span>
          </div>

          <div className="discard-slot">
            {estado.ataqueAcumulado > 0 && (
              <div
                className={`attack-badge ${estado.ataqueAcumulado >= 8 ? 'attack-badge-big' : ''}`}
                role="status"
                aria-label={`Ataque acumulado: +${estado.ataqueAcumulado}`}
              >
                +{estado.ataqueAcumulado}
              </div>
            )}
            <CartaView carta={estado.topo} jogavel={false} />
            <span className="pile-label">DESCARTE</span>
          </div>
        </div>

        <div
          className={`turn-summary ${estado.ataqueAcumulado > 0 ? 'danger' : ''}`}
          role="status"
          aria-live="polite"
        >
          <strong>{minhaVez ? 'SUA VEZ' : (jogadorAtual?.nome ?? 'Jogador')}</strong>
          <span>
            {minhaVez
              ? estado.ataqueAcumulado > 0
                ? `Ataque +${estado.ataqueAcumulado}: cubra com +2/+4 ou compre no monte.`
                : 'Toque uma carta para selecionar, toque novamente para confirmar.'
              : `Aguardando ${jogadorAtual?.nome ?? 'o próximo jogador'}.`}
          </span>
        </div>
      </div>

      <section className="online-hand-container" aria-label={`Sua mão: ${mao.length} cartas`}>
        <div className="local-speech-lane" aria-label="Fala do jogador local">
          {balaoLocal && (
            <BalaoDeFala nome={jogadorLocal?.nome ?? 'Você'} texto={balaoLocal.texto} />
          )}
        </div>
        <div className="hand-status" role="status" aria-live="polite">
          <div
            className="hand-local-player"
            aria-label={`Você: ${jogadorLocal?.nome ?? 'Jogador'}`}
          >
            <i aria-hidden="true">{jogadorLocal?.avatar || '👤'}</i>
            <em>{jogadorLocal?.nome ?? 'Você'}</em>
          </div>
          <strong>SUA MÃO</strong>
          <span>{mao.length} cartas</span>
          <div className="quick-chat-control">
            {falasRapidasAbertas && (
              <div
                id="quick-chat-tray"
                className="quick-chat-tray"
                role="group"
                aria-label="Falas rápidas"
              >
                {FALAS_RAPIDAS.map((fala) => (
                  <button key={fala} type="button" onClick={() => enviarFalaRapida(fala)}>
                    {fala}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="quick-chat-trigger"
              aria-expanded={falasRapidasAbertas}
              aria-controls="quick-chat-tray"
              onClick={() => setFalasRapidasAbertas((abertas) => !abertas)}
            >
              Falas rápidas
            </button>
          </div>
        </div>
        <p className="multiple-discard-touch-feedback" role="status" aria-live="polite">
          {stackFeedback}
        </p>
        <div className="hand-cards hand-fan" role="list">
          {mao.map((carta, index) => {
            const primeiraCartaJogavel = podeJogarCarta(carta);
            const podeOrganizarForaDaVez =
              !minhaVez && Boolean(onPlayMultiple) && isEligibleForMultipleDiscard(carta);
            const stackIdx = cardToStackIndex.get(carta.id) ?? -1;
            const inStack = stackIdx >= 0;
            const stack = inStack ? stacks[stackIdx]! : null;
            // Only stacks with 2+ cards render as the inline stack visual; singletons show as selected cards
            const isPilhaPronta = stack !== null && stack.length >= 2;
            const isStackAnchor = isPilhaPronta && stack![0] === carta.id;
            const isSending = sendingStack !== null;
            const cartasSelecionadas = isStackAnchor
              ? getSelectedMultipleDiscardCards(mao, stack!)
              : [];

            // Hide non-anchor cards only in full stacks (2+ cards)
            if (isPilhaPronta && inStack && !isStackAnchor) return null;

            const angle = Math.max(-4, Math.min(4, (index - (mao.length - 1) / 2) * 4));

            return (
              <div
                className={`hand-card-slot ${inStack || selectedCardId === carta.id ? 'selected-slot' : ''}`}
                key={`${carta.id}_${index}`}
                role="listitem"
                data-card-id={carta.id}
                {...(podeOrganizarForaDaVez
                  ? {
                      tabIndex: 0,
                      'aria-label': `Carta ${carta.valor ?? carta.acao ?? ''} ${carta.cor} — organizar pilha; aguarde sua vez para jogar`,
                    }
                  : {})}
                style={{ transform: `rotate(${angle}deg)` }}
                onPointerDown={(event) => iniciarArrasto(event, carta, primeiraCartaJogavel)}
                onPointerMove={moverArrastoDePilha}
                onPointerUp={(event) => soltarNaCarta(event, carta)}
                onPointerCancel={cancelarArrasto}
                onClickCapture={(event) => {
                  const clicouNaPilha =
                    event.target instanceof Element &&
                    event.target.closest('.multiple-discard-inline-stack') !== null;
                  const suppressClick = suppressNextClickRef.current;
                  if (suppressClick && !clicouNaPilha) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                  if (
                    !suppressClick &&
                    !clicouNaPilha &&
                    ultimoPonteiroFoiToqueRef.current &&
                    onPlayMultiple
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (minhaVez) {
                      tocarCartaNaVez(carta, primeiraCartaJogavel);
                    } else {
                      tocarCartaForaDaVez(carta);
                    }
                  }
                  suppressNextClickRef.current = false;
                  ultimoPonteiroFoiToqueRef.current = false;
                }}
                onKeyDownCapture={(event) => {
                  const teclaDeAcao = event.key === 'Enter' || event.key === ' ';
                  const alvoDentroDaPilha =
                    event.target instanceof Element &&
                    event.target.closest('.multiple-discard-inline-stack') !== null;
                  if (
                    teclaDeAcao &&
                    !alvoDentroDaPilha &&
                    ((event.altKey && minhaVez) ||
                      (!minhaVez && isEligibleForMultipleDiscard(carta)))
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    // Alt+Enter: add to stack off-turn, or add to on-turn stack
                    if (minhaVez) {
                      setStacks((atuais) => {
                        if (atuais.length === 0) {
                          return canSelectMultipleDiscardCard([], carta, mao, primeiraCartaJogavel)
                            ? [...atuais, [carta.id]]
                            : atuais;
                        }
                        const lastIdx = atuais.length - 1;
                        const updated = appendCardToMultipleDiscardStack(
                          atuais[lastIdx]!,
                          carta,
                          mao,
                        );
                        if (updated === atuais[lastIdx]) return atuais;
                        const copia = [...atuais];
                        copia[lastIdx] = updated;
                        return copia;
                      });
                    } else {
                      tocarCartaForaDaVez(carta);
                    }
                  }
                }}
              >
                {isStackAnchor && stack ? (
                  <div
                    className={`multiple-discard-inline-stack ${stackStateClass(stackIdx)}`}
                    role="group"
                    aria-label={`Pilha de descarte múltiplo com ${cartasSelecionadas.length} cartas. Ordem: ${cartasSelecionadas
                      .map(
                        (item) =>
                          `${item.tipo === 'NUMERADA' ? item.valor : (item.acao ?? '')} ${item.cor}`,
                      )
                      .join(', ')}${isSending ? ' — enviando' : ''}`}
                    aria-disabled={isSending}
                    onClick={() => {
                      if (isSending) return;
                      rotarPilha(stackIdx);
                    }}
                    style={{ '--stack-count': cartasSelecionadas.length } as React.CSSProperties}
                  >
                    {cartasSelecionadas.map((cartaDaPilha, stackIndex) => (
                      <span
                        key={cartaDaPilha.id}
                        className="multiple-discard-inline-stack-card"
                        data-stack-card-id={cartaDaPilha.id}
                        style={{ '--stack-index': stackIndex } as React.CSSProperties}
                        aria-hidden="true"
                      >
                        <CartaView carta={cartaDaPilha} jogavel={false} />
                      </span>
                    ))}
                    <button
                      type="button"
                      className="stack-rotate-button"
                      disabled={isSending}
                      aria-label={`Rotacionar pilha. Ordem atual: ${cartasSelecionadas
                        .map(
                          (item) =>
                            `${item.tipo === 'NUMERADA' ? item.valor : (item.acao ?? '')} ${item.cor}`,
                        )
                        .join(', ')}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        rotarPilha(stackIdx);
                      }}
                    >
                      Rotacionar pilha
                    </button>
                    {minhaVez && isStackValid(stackIdx) && !isSending && (
                      <button
                        type="button"
                        className="stack-play-button"
                        aria-label={`Jogar ${cartasSelecionadas.length} cartas`}
                        onClick={(event) => {
                          event.stopPropagation();
                          executarPilha(stackIdx);
                        }}
                      >
                        Jogar {cartasSelecionadas.length} cartas
                      </button>
                    )}
                  </div>
                ) : (
                  <CartaView
                    carta={carta}
                    jogavel={minhaVez}
                    selecionada={selectedCardId === carta.id}
                    {...(!minhaVez ? { motivoBloqueio: 'Aguardando o seu turno.' } : {})}
                    onClick={() => minhaVez && onSelecionarCarta(carta)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default MesaOnline;
