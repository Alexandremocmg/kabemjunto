/**
 * Partida local (contra bots) na mesa 3D. A partida é criada pelo menu
 * (`iniciarPartidaLocal`); sem partida, volta ao menu.
 * Carregado sob demanda (`React.lazy`) para o Three.js ficar fora do bundle
 * inicial do menu.
 */
import { useEffect, useState } from 'react';
import { revanchePedida } from '../services/metricas';
import { Mesa3D } from './Mesa3D';
import { useMesaLocal } from './useMesaLocal';

interface MesaLocal3DProps {
  onVoltarAoMenu: () => void;
  renderizacao: '3d' | '2d';
}

export default function MesaLocal3D({ onVoltarAoMenu, renderizacao }: MesaLocal3DProps) {
  const { controlador, iniciar, encerrar } = useMesaLocal();
  // Cada partida monta uma cena nova: os ids das cartas se repetem entre partidas.
  const [numeroDaPartida, setNumeroDaPartida] = useState(0);

  useEffect(() => {
    if (!controlador) onVoltarAoMenu();
  }, [controlador, onVoltarAoMenu]);

  if (!controlador) return null;

  const jogarNovamente = () => {
    const eu = controlador.estado.jogadores.find((jogador) => jogador.id === controlador.jogadorId);
    revanchePedida(controlador.estado.partidaId);
    setNumeroDaPartida((numero) => numero + 1);
    iniciar(controlador.estado.jogadores.length, eu?.nome ?? 'Você');
  };

  return (
    <Mesa3D
      key={`${numeroDaPartida}-${controlador.estado.partidaId}`}
      controlador={controlador}
      onSair={encerrar}
      onJogarNovamente={jogarNovamente}
      renderizacao={renderizacao}
    />
  );
}
