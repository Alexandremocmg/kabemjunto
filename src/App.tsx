import React, { useEffect, useState } from 'react';
import { Cor, EstadoPartida, Jogador } from '@shared/types';
import type { NivelBot } from '@shared';
import { comprar, criarPartida, jogarCarta, turnoBot } from './services/gameEngine';
import { Lobby } from './components/Lobby';
import { HUDJogador } from './components/HUDJogador';
import { MesaDeJogo } from './components/MesaDeJogo';
import { MaoDoJogador } from './components/MaoDoJogador';
import { ModalEscolhaCor } from './components/ModalEscolhaCor';
import { RegraDoSilencioBanner } from './components/RegraDoSilencioBanner';
import { PainelVitoria } from './components/PainelVitoria';
import { TutorialModal } from './components/TutorialModal';
import { audioService } from './services/audioService';

type Feedback = {
  tipo: 'info' | 'erro' | 'sucesso';
  texto: string;
};

export const App: React.FC = () => {
  const [estado, setEstado] = useState<EstadoPartida | null>(null);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const [modalCorOpen, setModalCorOpen] = useState<boolean>(false);
  const [cartaIndexPendente, setCartaIndexPendente] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const mostrarFeedback = (novoFeedback: Feedback) => {
    setFeedback(novoFeedback);
  };

  useEffect(() => {
    if (!feedback) return undefined;

    const timer = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

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
    mostrarFeedback({
      tipo: 'sucesso',
      texto: `Mesa iniciada com ${totalJogadores} jogadores.`,
    });
  };

  const handleJogarCarta = (index: number) => {
    if (!estado) return;

    const jogadorAtual = estado.jogadores.find((j: Jogador) => j.id === estado.vezDe);
    if (!jogadorAtual) return;

    const carta = jogadorAtual.mao[index];
    if (!carta) return;

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
      const novoState = jogarCarta(estado, index);
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

    try {
      const novoState = jogarCarta(estado, cartaIndexPendente, cor);
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

    try {
      const novoState = comprar(estado);
      setEstado(novoState);
      const jogadorAtual = estado.jogadores.find((j: Jogador) => j.id === estado.vezDe);
      mostrarFeedback({
        tipo: 'info',
        texto:
          estado.ataqueAcumulado > 0
            ? `${jogadorAtual?.nome ?? 'Jogador'} pagou +${estado.ataqueAcumulado}.`
            : `${jogadorAtual?.nome ?? 'Jogador'} comprou uma carta.`,
      });
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

      <MaoDoJogador estado={estado} onJogarCarta={handleJogarCarta} />

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
