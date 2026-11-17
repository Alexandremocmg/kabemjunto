/**
 * Partida online na mesa 3D. Carregado sob demanda (`React.lazy`).
 *
 * Usa a mesma `Mesa3D` do modo local; quem decide o jogo aqui é o servidor.
 * O menu da partida (sala, jogadores e chat) e a reconexão continuam no App.
 */
import type { ReactNode } from 'react';
import type { useGameSocket } from '../services/socketClient';
import { Mesa3D } from './Mesa3D';
import { useBaloesDeFala } from './useBaloesDeFala';
import { useMesaOnline } from './useMesaOnline';

export const FALAS_RAPIDAS = [
  'Boa jogada!',
  'Sua vez!',
  'Vou comprar.',
  'Calma aí!',
  'Vamos lá!',
  'GG!',
] as const;

interface MesaOnline3DProps {
  online: ReturnType<typeof useGameSocket>;
  /** Botões extras no HUD (o App passa o do menu da partida). */
  acoesHud: ReactNode;
  onUsar2D: () => void;
}

export default function MesaOnline3D({ online, acoesHud, onUsar2D }: MesaOnline3DProps) {
  const controlador = useMesaOnline(online);
  const baloes = useBaloesDeFala(online.state.mensagens);
  if (!controlador) return null;

  return (
    <Mesa3D
      key={controlador.estado.partidaId}
      controlador={controlador}
      onSair={online.abandonarPartida}
      onJogarNovamente={online.sair}
      onUsar2D={onUsar2D}
      acoesHud={acoesHud}
      baloes={baloes}
      falasRapidas={{ opcoes: FALAS_RAPIDAS, onEnviar: online.enviarChat }}
    />
  );
}
