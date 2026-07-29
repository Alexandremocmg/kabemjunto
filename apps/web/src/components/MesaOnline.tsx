import React, { useEffect, useRef, useState } from 'react';
import type {
  Carta,
  EstadoPartidaPublico,
  JogadorPublico,
  ServerChatEvent,
} from '@kabemjunto/shared';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import { CartaView } from './CartaView';
import { ConfirmarDescarteMultiplo } from './ConfirmarDescarteMultiplo';
import {
  canSelectMultipleDiscardCard,
  getSelectedMultipleDiscardCards,
  temMesmaFace,
  toggleMultipleDiscardSelection,
} from './multipleDiscard';

interface MesaOnlineProps {
  estado: EstadoPartidaPublico;
  mao: ReadonlyArray<Carta>;
  mensagens: ReadonlyArray<ServerChatEvent>;
  jogadorId?: string | undefined;
  selectedCardId?: string | undefined;
  onSelecionarCarta: (carta: Carta) => void;
  /** Optional UI bridge for a future authoritative batch-play contract. */
  onPlayMultiple?: (cartas: ReadonlyArray<Carta>) => void;
  onComprarCarta: () => void;
  onEnviarFalaRapida: (texto: string) => void;
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

function isNormallyPlayableOnline(estado: EstadoPartidaPublico, carta: Carta): boolean {
  if (estado.ataqueAcumulado > 0) return carta.acao === 'MAIS_DOIS';
  return (
    carta.cor === 'NEUTRO' || carta.cor === estado.corAtiva || temMesmaFace(carta, estado.topo)
  );
}

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
}) => {
  const [falasRapidasAbertas, setFalasRapidasAbertas] = useState(false);
  const [descarteMultiploAtivo, setDescarteMultiploAtivo] = useState(false);
  const [confirmandoDescarteMultiplo, setConfirmandoDescarteMultiplo] = useState(false);
  const [cartasSelecionadasParaDescarte, setCartasSelecionadasParaDescarte] = useState<
    ReadonlyArray<string>
  >([]);
  const revisarDescarteMultiploRef = useRef<HTMLButtonElement>(null);
  const [baloesDeFala, setBaloesDeFala] = useState<ReadonlyMap<string, BalaoFala>>(new Map());
  const mensagensVistasRef = useRef(new WeakSet<ServerChatEvent>());
  const timersDeBalaoRef = useRef(new Map<string, number>());
  const minhaVez = estado.vezDe === jogadorId;
  const jogadorAtual = estado.jogadores.find((jogador) => jogador.id === estado.vezDe);
  const jogadorLocal = estado.jogadores.find((jogador) => jogador.id === jogadorId);
  const jogadoresRemotos = estado.jogadores.filter((jogador) => jogador.id !== jogadorId);
  const corAtiva = estado.corAtiva ?? 'LARANJA';
  const infoCor = PALETA_CORES[corAtiva] ?? PALETA_CORES.NEUTRO;
  const cartasSelecionadas = getSelectedMultipleDiscardCards(mao, cartasSelecionadasParaDescarte);
  const balaoLocal = jogadorId ? baloesDeFala.get(jogadorId) : undefined;

  function alternarDescarteMultiplo(): void {
    setDescarteMultiploAtivo((ativo) => !ativo);
    setConfirmandoDescarteMultiplo(false);
    setCartasSelecionadasParaDescarte([]);
  }

  function selecionarCartaDaMao(carta: Carta, primeiraCartaJogavel: boolean): void {
    if (!descarteMultiploAtivo) {
      onSelecionarCarta(carta);
      return;
    }
    setCartasSelecionadasParaDescarte((selecionadas) => {
      if (!canSelectMultipleDiscardCard(selecionadas, carta, mao, primeiraCartaJogavel)) {
        return selecionadas;
      }
      return toggleMultipleDiscardSelection(selecionadas, carta, mao);
    });
  }

  function concluirDescarteMultiplo(cartas: ReadonlyArray<Carta>): void {
    onPlayMultiple?.(cartas);
    setConfirmandoDescarteMultiplo(false);
    setDescarteMultiploAtivo(false);
    setCartasSelecionadasParaDescarte([]);
  }

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

  return (
    <div className="table-area online-table-area">
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
          <div className="deck-slot" title={minhaVez ? 'Comprar carta' : 'Aguardando sua vez'}>
            <CartaView
              verso
              contador={`${estado.quantidadeMonteCompra}`}
              jogavel={minhaVez}
              {...(!minhaVez ? { motivoBloqueio: 'Aguardando o turno.' } : {})}
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
          <div className="multiple-discard-controls">
            <button
              type="button"
              className="button button-secondary"
              aria-pressed={descarteMultiploAtivo}
              disabled={!minhaVez}
              onClick={alternarDescarteMultiplo}
            >
              {descarteMultiploAtivo ? 'Cancelar descarte múltiplo' : 'Descarte múltiplo'}
            </button>
            {descarteMultiploAtivo && (
              <>
                <span role="status">
                  {cartasSelecionadas.length} carta{cartasSelecionadas.length === 1 ? '' : 's'}{' '}
                  selecionada{cartasSelecionadas.length === 1 ? '' : 's'}
                </span>
                <button
                  ref={revisarDescarteMultiploRef}
                  type="button"
                  className="button button-primary"
                  disabled={cartasSelecionadas.length < 2}
                  onClick={() => setConfirmandoDescarteMultiplo(true)}
                >
                  Revisar descarte múltiplo
                </button>
              </>
            )}
          </div>
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
        <div className="hand-cards hand-fan" role="list">
          {mao.map((carta, index) => {
            const primeiraCartaJogavel = isNormallyPlayableOnline(estado, carta);
            const podeSelecionarNoDescarteMultiplo = canSelectMultipleDiscardCard(
              cartasSelecionadasParaDescarte,
              carta,
              mao,
              primeiraCartaJogavel,
            );
            const cartaJogavel =
              minhaVez && (descarteMultiploAtivo ? podeSelecionarNoDescarteMultiplo : true);

            return (
              <div
                className={`hand-card-slot ${
                  (
                    descarteMultiploAtivo
                      ? cartasSelecionadasParaDescarte.includes(carta.id)
                      : selectedCardId === carta.id
                  )
                    ? 'selected-slot'
                    : ''
                }`}
                key={`${carta.id}_${index}`}
                role="listitem"
                style={{
                  transform: `rotate(${Math.max(-12, Math.min(12, (index - (mao.length - 1) / 2) * 4))}deg)`,
                }}
              >
                <CartaView
                  carta={carta}
                  jogavel={cartaJogavel}
                  selecionada={
                    descarteMultiploAtivo
                      ? cartasSelecionadasParaDescarte.includes(carta.id)
                      : selectedCardId === carta.id
                  }
                  {...(!minhaVez ? { motivoBloqueio: 'Aguardando o seu turno.' } : {})}
                  onClick={() => cartaJogavel && selecionarCartaDaMao(carta, primeiraCartaJogavel)}
                />
              </div>
            );
          })}
        </div>
      </section>
      {confirmandoDescarteMultiplo && (
        <ConfirmarDescarteMultiplo
          cartas={cartasSelecionadas}
          onCancel={() => setConfirmandoDescarteMultiplo(false)}
          triggerRef={revisarDescarteMultiploRef}
          {...(onPlayMultiple ? { onPlayMultiple: concluirDescarteMultiplo } : {})}
        />
      )}
    </div>
  );
};

export default MesaOnline;
