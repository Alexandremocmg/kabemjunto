/**
 * Modo local com a mesa 3D: menu (Lobby atual) → partida contra bots.
 * Carregado sob demanda (`React.lazy`) para o Three.js ficar fora do bundle
 * inicial do menu.
 */
import { useState, type ReactNode } from 'react';
import { Lobby } from '../components/Lobby';
import { Mesa3D } from './Mesa3D';
import { useMesaLocal } from './useMesaLocal';

interface MesaLocal3DProps {
  /** Alternador Local/Online, mostrado só fora da partida. */
  alternadorDeModo: ReactNode;
  onUsar2D: () => void;
}

export default function MesaLocal3D({ alternadorDeModo, onUsar2D }: MesaLocal3DProps) {
  const { controlador, iniciar, encerrar } = useMesaLocal();
  const [configuracao, setConfiguracao] = useState({ total: 4, nome: 'Você' });
  // Cada partida monta uma cena nova: os ids das cartas se repetem entre partidas.
  const [numeroDaPartida, setNumeroDaPartida] = useState(0);

  const comecar = (total: number, nome: string) => {
    setConfiguracao({ total, nome });
    setNumeroDaPartida((numero) => numero + 1);
    iniciar(total, nome);
  };

  if (!controlador) {
    return (
      <>
        {alternadorDeModo}
        <Lobby onIniciarJogo={(_modo, total, nomes) => comecar(total, nomes[0] ?? 'Você')} />
      </>
    );
  }

  return (
    <Mesa3D
      key={`${numeroDaPartida}-${controlador.estado.partidaId}`}
      controlador={controlador}
      onSair={encerrar}
      onJogarNovamente={() => comecar(configuracao.total, configuracao.nome)}
      onUsar2D={onUsar2D}
    />
  );
}
