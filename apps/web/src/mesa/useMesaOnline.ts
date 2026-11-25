/**
 * Controlador ONLINE da mesa: um adaptador fino sobre `useGameSocket`.
 *
 * O cliente só envia intenções (`client:jogar`, `client:comprar`,
 * `client:interceptar`, ...) e mostra o estado que o servidor devolve. Nada
 * aqui valida ou decide jogada, e o contrato de eventos não muda.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { observarPartida } from '../services/metricas';
import type { useGameSocket } from '../services/socketClient';
import type { AvisoMesa, ControladorMesa } from './tipos';

type JogoOnline = ReturnType<typeof useGameSocket>;

export function useMesaOnline(online: JogoOnline): ControladorMesa | undefined {
  const [aviso, setAviso] = useState<AvisoMesa>();
  const sequencia = useRef(0);
  const { cartaRejeitada, conexao, erro, erroCodigo, estado, fim, mao, revanche, status } =
    online.state;
  const { retomarControle } = online;
  const codigoConvite = online.emSalaRapida ? undefined : online.salaId;
  const { comprarCarta, interceptar, jogadorId, jogarCarta, jogarMultiplasCartas } = online;

  const modo = online.state.rapida ? 'rapida' : 'online';
  useEffect(() => {
    if (estado && jogadorId) observarPartida(estado, modo, jogadorId);
  }, [estado, jogadorId, modo]);

  // Recusas do servidor viram aviso da mesa (e a carta volta para a mão).
  useEffect(() => {
    const texto = cartaRejeitada
      ? cartaRejeitada.replace(/^[^:]+:\s*/, '')
      : erro && erroCodigo !== 'SALA_INEXISTENTE'
        ? erro
        : undefined;
    if (!texto) return;
    sequencia.current += 1;
    setAviso({ id: sequencia.current, tipo: 'erro', texto });
  }, [cartaRejeitada, erro, erroCodigo]);

  return useMemo<ControladorMesa | undefined>(() => {
    if (!estado || !jogadorId) return undefined;
    return {
      modo: 'online',
      estado,
      mao,
      jogadorId,
      aviso,
      jogar: (cartaId, opcoes) => jogarCarta(cartaId, opcoes?.cor, opcoes?.alvoTrocaId),
      jogarMultiplas: jogarMultiplasCartas,
      fim,
      revanche,
      conexao,
      conectado: status === 'connected',
      codigoConvite,
      retomarControle,
      comprar: comprarCarta,
      interceptar: (cartaId) => {
        const janela = estado.interceptacao;
        if (janela) interceptar(janela.janelaId, janela.revisao, cartaId);
      },
    };
  }, [
    aviso,
    codigoConvite,
    comprarCarta,
    conexao,
    estado,
    fim,
    interceptar,
    jogadorId,
    jogarCarta,
    jogarMultiplasCartas,
    mao,
    retomarControle,
    revanche,
    status,
  ]);
}
