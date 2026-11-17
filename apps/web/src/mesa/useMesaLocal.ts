/**
 * Controlador LOCAL da mesa: o motor puro roda no navegador e os bots ocupam
 * o lugar do socket. Entrega o mesmo contrato do modo online
 * (`ControladorMesa`), então a mesa não tem código próprio para "local".
 *
 * Toda regra continua em `@kabemjunto/shared`; aqui só há orquestração:
 * quando o bot joga, quando a janela de Corta-Frente abre e fecha.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Carta, EstadoPartida } from '@kabemjunto/shared';
import {
  abrirJanelaDeInterceptacao,
  comprar,
  criarPartida,
  expirarJanelaDeInterceptacao,
  interceptar,
  isEligibleForInterception,
  jogarCarta,
  jogarMultiplasCartas,
  saoCartasIdenticas,
  turnoBot,
} from '../services/gameEngine';
import { paraEstadoPublico } from './estadoPublico';
import type { AvisoMesa, ControladorMesa, OpcoesDeJogada } from './tipos';

const CHAVE_ESTADO = 'kabemjunto.estado';
/** Tempo que o jogador tem para cortar a frente de um bot. */
export const JANELA_INTERCEPTACAO_MS = 4000;
/** Pausa antes de cada jogada de bot: dá tempo de ver a carta anterior pousar. */
export const PAUSA_DO_BOT_MS = 900;

function lerEstadoSalvo(): EstadoPartida | null {
  try {
    const salvo = window.sessionStorage.getItem(CHAVE_ESTADO);
    return salvo ? (JSON.parse(salvo) as EstadoPartida) : null;
  } catch {
    window.sessionStorage.removeItem(CHAVE_ESTADO);
    return null;
  }
}

/** O jogador local é o primeiro humano da partida; todos os outros são conduzidos pelo bot. */
export function idDoJogadorLocal(estado: EstadoPartida): string | undefined {
  return (estado.jogadores.find((jogador) => !jogador.isBot) ?? estado.jogadores[0])?.id;
}

/**
 * Descarte que ainda pode ser interceptado pelo jogador local, se houver.
 *
 * No modo local só o humano corta a frente (os bots não interceptam), então a
 * janela só abre quando ela pode ter efeito: a carta do topo acabou de ser
 * jogada por outro jogador e o humano tem uma carta idêntica. Abrir a janela
 * sem interceptador possível só faria a partida esperar à toa.
 */
export function descarteInterceptavel(
  estado: EstadoPartida,
  jogadorLocalId: string,
): { cartaAlvoId: string; jogadorOrigemId: string } | undefined {
  if (estado.finalizada || estado.interceptacao) return undefined;
  const topo = estado.monteDescarte[estado.monteDescarte.length - 1];
  if (!topo || !isEligibleForInterception(topo)) return undefined;

  // Procura a jogada que pôs o topo na mesa; para se a janela dela já foi
  // tratada ou se alguém já comprou depois (o momento passou).
  for (let i = estado.historico.length - 1; i >= 0; i -= 1) {
    const evento = estado.historico[i]!;
    if (
      evento.tipo === 'INTERCEPTACAO_ABERTA' ||
      evento.tipo === 'INTERCEPTACAO_EXPIRADA' ||
      evento.tipo === 'CARTA_COMPRADA' ||
      evento.tipo === 'MONTE_ESGOTADO'
    ) {
      return undefined;
    }
    if (evento.tipo !== 'CARTA_JOGADA') continue;
    if (evento.cartaId !== topo.id || evento.jogadorId === jogadorLocalId) return undefined;
    const maoLocal = estado.jogadores.find((jogador) => jogador.id === jogadorLocalId)?.mao ?? [];
    return maoLocal.some((carta) => saoCartasIdenticas(carta, topo))
      ? { cartaAlvoId: topo.id, jogadorOrigemId: evento.jogadorId }
      : undefined;
  }
  return undefined;
}

export interface MesaLocal {
  controlador: ControladorMesa | undefined;
  iniciar: (totalJogadores: number, nomeDoJogador: string) => void;
  encerrar: () => void;
}

export function useMesaLocal(): MesaLocal {
  const [estado, setEstado] = useState<EstadoPartida | null>(lerEstadoSalvo);
  const [aviso, setAviso] = useState<AvisoMesa>();
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const sequenciaAviso = useRef(0);

  const avisar = useCallback((tipo: AvisoMesa['tipo'], texto: string) => {
    sequenciaAviso.current += 1;
    setAviso({ id: sequenciaAviso.current, tipo, texto });
  }, []);

  const jogadorId = estado ? idDoJogadorLocal(estado) : undefined;

  useEffect(() => {
    if (estado) window.sessionStorage.setItem(CHAVE_ESTADO, JSON.stringify(estado));
    else window.sessionStorage.removeItem(CHAVE_ESTADO);
  }, [estado]);

  // Vez de um bot: joga depois de uma pausa curta.
  useEffect(() => {
    if (!estado || !jogadorId || estado.finalizada || estado.interceptacao) return undefined;
    if (estado.vezDe === jogadorId) return undefined;
    if (descarteInterceptavel(estado, jogadorId)) return undefined;
    const timer = window.setTimeout(() => {
      if (estadoRef.current !== estado) return;
      try {
        setEstado(turnoBot(estado).estado);
      } catch (erro) {
        avisar('erro', erro instanceof Error ? erro.message : String(erro));
      }
    }, PAUSA_DO_BOT_MS);
    return () => window.clearTimeout(timer);
  }, [avisar, estado, jogadorId]);

  // Corta-Frente: abre a janela quando o jogador local pode interceptar.
  useEffect(() => {
    if (!estado || !jogadorId) return;
    const alvo = descarteInterceptavel(estado, jogadorId);
    if (!alvo) return;
    setEstado(
      abrirJanelaDeInterceptacao(estado, {
        ...alvo,
        janelaId: `janela-${Date.now()}-${alvo.cartaAlvoId}`,
        fechaEm: Date.now() + JANELA_INTERCEPTACAO_MS,
        proximaVezId: estado.vezDe,
      }),
    );
  }, [estado, jogadorId]);

  // Corta-Frente: a janela expira sozinha.
  const janela = estado?.interceptacao;
  useEffect(() => {
    if (!janela) return undefined;
    const timer = window.setTimeout(
      () => {
        const atual = estadoRef.current;
        if (atual?.interceptacao?.janelaId !== janela.janelaId) return;
        setEstado(expirarJanelaDeInterceptacao(atual, janela.janelaId));
      },
      Math.max(0, janela.fechaEm - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [janela]);

  const executar = useCallback(
    (acao: (atual: EstadoPartida, mao: ReadonlyArray<Carta>) => EstadoPartida | undefined) => {
      const atual = estadoRef.current;
      const id = atual ? idDoJogadorLocal(atual) : undefined;
      if (!atual || !id) return;
      const mao = atual.jogadores.find((jogador) => jogador.id === id)?.mao ?? [];
      try {
        const proximo = acao(atual, mao);
        if (proximo) setEstado(proximo);
      } catch (erro) {
        avisar('erro', erro instanceof Error ? erro.message : String(erro));
      }
    },
    [avisar],
  );

  const jogar = useCallback(
    (cartaId: string, opcoes?: OpcoesDeJogada) =>
      executar((atual, mao) => {
        if (atual.vezDe !== idDoJogadorLocal(atual)) throw new Error('Aguarde a sua vez.');
        const indice = mao.findIndex((carta) => carta.id === cartaId);
        if (indice < 0) return undefined;
        return jogarCarta(atual, indice, opcoes?.cor, opcoes?.alvoTrocaId);
      }),
    [executar],
  );

  const jogarMultiplas = useCallback(
    (cartaIds: ReadonlyArray<string>) =>
      executar((atual) => {
        if (atual.vezDe !== idDoJogadorLocal(atual)) throw new Error('Aguarde a sua vez.');
        return jogarMultiplasCartas(atual, cartaIds);
      }),
    [executar],
  );

  const comprarCarta = useCallback(
    () =>
      executar((atual) => {
        if (atual.vezDe !== idDoJogadorLocal(atual)) throw new Error('Aguarde a sua vez.');
        const resultado = comprar(atual);
        if (resultado.turnoMantido) {
          avisar('info', 'A carta comprada é jogável: você continua na vez.');
        }
        return resultado.estado;
      }),
    [avisar, executar],
  );

  const interceptarCarta = useCallback(
    (cartaId: string) =>
      executar((atual) => {
        const id = idDoJogadorLocal(atual);
        if (!atual.interceptacao || !id) return undefined;
        return interceptar(atual, {
          janelaId: atual.interceptacao.janelaId,
          cartaId,
          jogadorId: id,
        });
      }),
    [executar],
  );

  const iniciar = useCallback((totalJogadores: number, nomeDoJogador: string) => {
    const nomes = [nomeDoJogador.trim() || 'Você'];
    for (let i = 1; i < totalJogadores; i += 1) nomes.push(`Bot ${i}`);
    setAviso(undefined);
    setEstado(criarPartida('BOTS', totalJogadores, nomes));
  }, []);

  const encerrar = useCallback(() => {
    setAviso(undefined);
    setEstado(null);
  }, []);

  const controlador = useMemo<ControladorMesa | undefined>(() => {
    if (!estado || !jogadorId) return undefined;
    const publico = paraEstadoPublico(estado);
    if (!publico) return undefined;
    return {
      modo: 'local',
      estado: publico,
      mao: estado.jogadores.find((jogador) => jogador.id === jogadorId)?.mao ?? [],
      jogadorId,
      aviso,
      jogar,
      jogarMultiplas,
      comprar: comprarCarta,
      interceptar: interceptarCarta,
    };
  }, [aviso, comprarCarta, estado, interceptarCarta, jogadorId, jogar, jogarMultiplas]);

  return { controlador, iniciar, encerrar };
}
