import React, { useState, useEffect } from 'react';
import { Cor, EstadoPartida, Jogador } from '@shared/types';
import type { NivelBot } from '@shared';
import { criarPartida, jogarCarta, comprar, turnoBot } from './services/gameEngine';
import { Lobby } from './components/Lobby';
import { HUDJogador } from './components/HUDJogador';
import { MesaDeJogo } from './components/MesaDeJogo';
import { MaoDoJogador } from './components/MaoDoJogador';
import { ModalEscolhaCor } from './components/ModalEscolhaCor';
import { RegraDoSilencioBanner } from './components/RegraDoSilencioBanner';
import { PainelVitoria } from './components/PainelVitoria';
import { TutorialModal } from './components/TutorialModal';
import { audioService } from './services/audioService';

export const App: React.FC = () => {
  const [estado, setEstado] = useState<EstadoPartida | null>(null);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const [modalCorOpen, setModalCorOpen] = useState<boolean>(false);
  const [cartaIndexPendente, setCartaIndexPendente] = useState<number | null>(null);

  // Auto-Turno de Bots com delay de UX (750ms)
  useEffect(() => {
    if (!estado || estado.finalizada) return;

    const jogadorAtual = estado.jogadores.find((j: Jogador) => j.id === estado.vezDe);
    if (jogadorAtual && jogadorAtual.isBot) {
      const timer = setTimeout(() => {
        setEstado((prev: EstadoPartida | null) => (prev ? turnoBot(prev) : null));
      }, 750);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [estado]);

  const handleIniciarJogo = (
    modo: 'HOTSEAT' | 'BOTS',
    totalJogadores: number,
    nomes: string[],
    _dificuldadeBot: NivelBot[] = [],
  ) => {
    // _dificuldadeBot: reservado para Sprint 2 (bot configurável)
    // Por enquanto o bot sempre joga com nível MÉDIO.
    const novaPartida = criarPartida(modo, totalJogadores, nomes);
    setEstado(novaPartida);
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
    } else {
      try {
        const novoState = jogarCarta(estado, index);
        setEstado(novoState);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleConfirmarCor = (cor: Exclude<Cor, 'NEUTRO'>) => {
    if (!estado || cartaIndexPendente === null) return;
    try {
      const novoState = jogarCarta(estado, cartaIndexPendente, cor);
      setEstado(novoState);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
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
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleQuebrarSilencio = () => {
    if (!estado || !estado.silencio?.ativo) return;
    audioService.play('silencio_quebrado');
    alert(`🤫 DENÚNCIA DE FALA! A infração da Regra do Silêncio foi registrada!`);
  };

  if (!estado) {
    return <Lobby onIniciarJogo={handleIniciarJogo} />;
  }

  return (
    <div className="game-layout">
      {/* Header HUD */}
      <HUDJogador
        estado={estado}
        onOpenTutorial={() => setShowTutorial(true)}
        onQuebrarSilencio={handleQuebrarSilencio}
      />

      {/* Banner da Regra do Silêncio 7 */}
      {estado.silencio?.ativo && <RegraDoSilencioBanner />}

      {/* Mesa Virtual de Cartas */}
      <MesaDeJogo estado={estado} onComprarCarta={handleComprar} />

      {/* Mão do Jogador Atual */}
      <MaoDoJogador estado={estado} onJogarCarta={handleJogarCarta} />

      {/* Modais e Overlays */}
      {modalCorOpen && <ModalEscolhaCor onEscolherCor={handleConfirmarCor} />}

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

      {estado.finalizada && <PainelVitoria estado={estado} onReiniciar={() => setEstado(null)} />}
    </div>
  );
};
