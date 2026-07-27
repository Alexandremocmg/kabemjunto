import React, { useEffect, useState } from 'react';
import { Cor, EstadoPartida, Jogador, Carta } from '@kabemjunto/shared/types';
import type { NivelBot } from '@kabemjunto/shared';
import { validarJogada, comprar, criarPartida, jogarCarta, turnoBot } from './services/gameEngine';
import { Lobby } from './components/Lobby';
import { HUDJogador } from './components/HUDJogador';
import { MesaDeJogo } from './components/MesaDeJogo';
import { MaoDoJogador } from './components/MaoDoJogador';
import { ModalEscolhaCor } from './components/ModalEscolhaCor';
import { RegraDoSilencioBanner } from './components/RegraDoSilencioBanner';
import { PainelVitoria } from './components/PainelVitoria';
import { TutorialModal } from './components/TutorialModal';
import { audioService } from './services/audioService';
import { EventoPartidaOverlay } from './components/EventoPartidaOverlay';

type Feedback = {
  tipo: 'info' | 'erro' | 'sucesso';
  texto: string;
};

type EventoVisual = {
  id: string;
  tipo: 'SILENCIO' | 'ATAQUE' | 'ZERO_MAIS' | 'COMPRA';
  titulo: string;
  detalhe: string;
};

export const App: React.FC = () => {
  const [estado, setEstado] = useState<EstadoPartida | null>(null);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const [modalCorOpen, setModalCorOpen] = useState<boolean>(false);
  const [cartaIndexPendente, setCartaIndexPendente] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [eventQueue, setEventQueue] = useState<EventoVisual[]>([]);
  const [eventHistory, setEventHistory] = useState<EventoVisual[]>([]);
  const [activeEvent, setActiveEvent] = useState<EventoVisual | null>(null);
  const [penaltyFlight, setPenaltyFlight] = useState<{ id: string; quantidade: number } | null>(
    null,
  );

  // F8: carta que deve tremer (clicou em inválida)
  const [shakeCartaKey, setShakeCartaKey] = useState<string | null>(null);
  // F7: carta que está voando pro descarte
  const [flyingCarta, setFlyingCarta] = useState<{ key: string; carta: Carta } | null>(null);

  const mostrarFeedback = (novoFeedback: Feedback) => {
    setFeedback(novoFeedback);
  };

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!penaltyFlight) return undefined;
    const timer = window.setTimeout(() => setPenaltyFlight(null), 650);
    return () => window.clearTimeout(timer);
  }, [penaltyFlight]);

  useEffect(() => {
    if (activeEvent || eventQueue.length === 0) return undefined;
    const [nextEvent, ...remaining] = eventQueue;
    if (!nextEvent) return undefined;
    setEventQueue(remaining);
    setActiveEvent(nextEvent);
    const timer = window.setTimeout(() => setActiveEvent(null), 1800);
    return () => window.clearTimeout(timer);
  }, [activeEvent, eventQueue]);

  // Limpa o shake depois da duração
  useEffect(() => {
    if (!shakeCartaKey) return undefined;
    const timer = window.setTimeout(() => setShakeCartaKey(null), 400);
    return () => window.clearTimeout(timer);
  }, [shakeCartaKey]);

  // Limpa o flying depois da duração
  useEffect(() => {
    if (!flyingCarta) return undefined;
    const timer = window.setTimeout(() => setFlyingCarta(null), 350);
    return () => window.clearTimeout(timer);
  }, [flyingCarta]);

  useEffect(() => {
    if (!estado || estado.finalizada) return undefined;

    const jogadorAtual = estado.jogadores.find((j: Jogador) => j.id === estado.vezDe);
    if (jogadorAtual?.isBot) {
      mostrarFeedback({ tipo: 'info', texto: `${jogadorAtual.nome} esta pensando...` });
      const timer = window.setTimeout(() => {
        setEstado((prev: EstadoPartida | null) => (prev ? turnoBot(prev) : null));
      }, 750);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [estado]);

  const handleIniciarJogo = (
    modo: 'HOTSEAT' | 'BOTS',
    totalJogadores: number,
    nomes: string[],
    _dificuldadeBot: NivelBot[] = [],
  ) => {
    const novaPartida = criarPartida(modo, totalJogadores, nomes);
    setEstado(novaPartida);
  };

  const registrarTransicao = (
    antes: EstadoPartida,
    depois: EstadoPartida,
    carta: Carta,
    nome: string,
  ) => {
    const eventos: EventoVisual[] = [];
    const id = `${Date.now()}-${carta.id}`;
    if (carta.acao === 'SILENCIO') {
      eventos.push({
        id: `${id}-silencio`,
        tipo: 'SILENCIO',
        titulo: '🤫 SILÊNCIO!',
        detalhe: 'Ninguém pode falar até a próxima carta.',
      });
    }
    if (carta.acao === 'ZERO_MAIS' && antes.ataqueAcumulado > 0) {
      eventos.push({
        id: `${id}-zero`,
        tipo: 'ZERO_MAIS',
        titulo: '0+! Ataque refletido!',
        detalhe: `${nome} devolveu o ataque para o último atacante.`,
      });
    }
    if (depois.ataqueAcumulado > antes.ataqueAcumulado) {
      eventos.push({
        id: `${id}-ataque`,
        tipo: 'ATAQUE',
        titulo: `+${depois.ataqueAcumulado}! Ataque acumulado`,
        detalhe: `${nome} colocou uma carta de ataque na mesa.`,
      });
    }
    if (eventos.length > 0) {
      setEventQueue((atual) => [...atual, ...eventos]);
      setEventHistory((atual) => [...atual, ...eventos].slice(-5));
    }
  };

  const handleSelecionarCarta = (index: number) => {
    if (selectedCardIndex === index) {
      handleJogarCarta(index);
      return;
    }
    setSelectedCardIndex(index);
  };

  const handleJogarCarta = (index: number) => {
    setSelectedCardIndex(null);
    if (!estado) return;

    const jogadorAtual = estado.jogadores.find((j: Jogador) => j.id === estado.vezDe);
    if (!jogadorAtual) return;

    const carta = jogadorAtual.mao[index];
    if (!carta) return;

    // Validação antecipada para feedback visual
    const validacao = validarJogada(estado, carta, jogadorAtual.id);
    if (!validacao.valida) {
      // F8: dispara shake na carta
      setShakeCartaKey(`${carta.id}-${Date.now()}`);
      audioService.play('descarte'); // toca um som de erro genérico (sem som específico)
    }

    if (
      carta.tipo === 'NEUTRA' ||
      carta.acao === 'MAIS_QUATRO' ||
      carta.acao === 'CORINGA_SIMPLES'
    ) {
      setCartaIndexPendente(index);
      setModalCorOpen(true);
      return;
    }

    try {
      // F7: dispara fly-to-discard
      setFlyingCarta({ key: `${carta.id}-${Date.now()}`, carta });
      const novoState = jogarCarta(estado, index);
      registrarTransicao(estado, novoState, carta, jogadorAtual.nome);
      setEstado(novoState);
      mostrarFeedback({
        tipo: 'sucesso',
        texto: `${jogadorAtual.nome} jogou ${carta.efeito_texto_curto}.`,
      });
    } catch (err) {
      mostrarFeedback({
        tipo: 'erro',
        texto: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleConfirmarCor = (cor: Exclude<Cor, 'NEUTRO'>) => {
    if (!estado || cartaIndexPendente === null) return;
    const jogadorAtual = estado.jogadores.find((j: Jogador) => j.id === estado.vezDe);
    const carta = jogadorAtual?.mao[cartaIndexPendente];
    if (carta) {
      setFlyingCarta({ key: `${carta.id}-${Date.now()}`, carta });
    }

    try {
      const novoState = jogarCarta(estado, cartaIndexPendente, cor);
      if (carta) registrarTransicao(estado, novoState, carta, jogadorAtual?.nome ?? 'Jogador');
      setEstado(novoState);
      mostrarFeedback({
        tipo: 'sucesso',
        texto: `Cor ativa alterada para ${cor.toLowerCase()}.`,
      });
    } catch (err) {
      mostrarFeedback({
        tipo: 'erro',
        texto: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setModalCorOpen(false);
      setCartaIndexPendente(null);
    }
  };

  const handleComprar = () => {
    if (!estado) return;
    const jogadorAtual = estado.jogadores.find((j: Jogador) => j.id === estado.vezDe);
    try {
      const novoState = comprar(estado);
      const quantidade = estado.ataqueAcumulado > 0 ? estado.ataqueAcumulado : 1;
      const eventoCompra: EventoVisual = {
        id: `compra-${Date.now()}`,
        tipo: 'COMPRA',
        titulo: `Compra +${quantidade}`,
        detalhe: `${jogadorAtual?.nome ?? 'Jogador'} recebeu ${quantidade} carta${quantidade === 1 ? '' : 's'}.`,
      };
      setEventQueue((atual) => [...atual, eventoCompra]);
      setEventHistory((atual) => [...atual, eventoCompra].slice(-5));
      setPenaltyFlight({ id: eventoCompra.id, quantidade });
      setEstado(novoState);
    } catch (err) {
      mostrarFeedback({
        tipo: 'erro',
        texto: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleQuebrarSilencio = () => {
    if (!estado || !estado.silencio?.ativo) return;
    audioService.play('silencio_quebrado');
    mostrarFeedback({
      tipo: 'erro',
      texto: 'Denuncia registrada: fala durante o silencio vale +2.',
    });
  };

  if (!estado) {
    return <Lobby onIniciarJogo={handleIniciarJogo} />;
  }

  return (
    <div className="game-layout">
      <HUDJogador
        estado={estado}
        onOpenTutorial={() => setShowTutorial(true)}
        onQuebrarSilencio={handleQuebrarSilencio}
      />

      {estado.silencio?.ativo && <RegraDoSilencioBanner />}

      <MesaDeJogo estado={estado} onComprarCarta={handleComprar} />

      <MaoDoJogador
        estado={estado}
        onSelecionarCarta={handleSelecionarCarta}
        selectedIndex={selectedCardIndex}
        {...(shakeCartaKey !== null ? { shakeCartaKey } : {})}
      />

      <EventoPartidaOverlay evento={activeEvent} />

      {eventHistory.length > 0 && (
        <aside className="event-history" aria-label="Eventos recentes">
          <span className="event-history-title">EVENTOS</span>
          {eventHistory
            .slice(-3)
            .reverse()
            .map((evento) => (
              <div key={evento.id} className="event-history-item">
                <strong>{evento.titulo}</strong>
                <span>{evento.detalhe}</span>
              </div>
            ))}
        </aside>
      )}

      {penaltyFlight && (
        <div className="penalty-flight" aria-hidden="true">
          {Array.from({ length: Math.min(penaltyFlight.quantidade, 6) }, (_, index) => (
            <span
              key={`${penaltyFlight.id}-${index}`}
              style={{ '--flight-delay': `${index * 55}ms` } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* F7: carta voando pro descarte */}
      {flyingCarta && (
        <div
          key={flyingCarta.key}
          className="fly-to-discard"
          style={{
            position: 'fixed',
            left: '50%',
            top: '60%',
            width: 130,
            height: 185,
            zIndex: 1000,
            borderRadius: 12,
            background:
              flyingCarta.carta.cor === 'NEUTRO'
                ? 'linear-gradient(135deg, #ff007a 0%, #7928ca 50%, #00dfd8 100%)'
                : `var(--color-${flyingCarta.carta.cor.toLowerCase()})`,
            border: '3.5px solid #fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 900,
            fontSize: 48,
            fontFamily: 'var(--font-title)',
          }}
        >
          {flyingCarta.carta.valor ?? flyingCarta.carta.acao}
        </div>
      )}

      {feedback && (
        <div className={`toast-feedback ${feedback.tipo}`} role="status" aria-live="polite">
          {feedback.texto}
        </div>
      )}

      {modalCorOpen && <ModalEscolhaCor onEscolherCor={handleConfirmarCor} />}

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

      {estado.finalizada && <PainelVitoria estado={estado} onReiniciar={() => setEstado(null)} />}
    </div>
  );
};

export default App;
