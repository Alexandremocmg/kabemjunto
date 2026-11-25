import type {
  Carta,
  Cor,
  EstadoPartidaPublico,
  PlacarSessao,
  RankingSemanal,
  ResumoPartida,
} from '@kabemjunto/shared';
import type { RevancheRecebida } from '../services/socketClient';

/** Cores que podem virar "cor ativa" (o NEUTRO nunca fica ativo na mesa). */
export type CorJogavel = Exclude<Cor, 'NEUTRO'>;

export const CORES_JOGAVEIS: ReadonlyArray<CorJogavel> = ['LARANJA', 'AZUL', 'VERDE', 'PRETO'];

export interface OpcoesDeJogada {
  cor?: CorJogavel;
  alvoTrocaId?: string;
}

export interface AvisoMesa {
  /** Muda a cada aviso novo, mesmo que o texto se repita. */
  id: number;
  tipo: 'erro' | 'info' | 'sucesso';
  texto: string;
}

/**
 * Contrato único entre a mesa e quem decide o jogo.
 *
 * A mesa só conhece o estado PÚBLICO e a mão do jogador local, e só envia
 * intenções. No modo online quem responde é o servidor (Socket.IO); no modo
 * local é o motor puro rodando no navegador, com bots no lugar do socket. A
 * mesa não sabe qual dos dois está do outro lado.
 */
export interface ControladorMesa {
  modo: 'local' | 'online';
  estado: EstadoPartidaPublico;
  mao: ReadonlyArray<Carta>;
  jogadorId: string;
  aviso?: AvisoMesa | undefined;
  jogar: (cartaId: string, opcoes?: OpcoesDeJogada) => void;
  jogarMultiplas: (cartaIds: ReadonlyArray<string>) => void;
  comprar: () => void;
  /** Corta-Frente: pede a interceptação da janela ativa com uma carta idêntica. */
  interceptar: (cartaId: string) => void;
  /** Prêmios e placar; online pode chegar depois do fim (ou não chegar). */
  fim?: { resumo: ResumoPartida; placar?: PlacarSessao; ranking?: RankingSemanal } | undefined;
  revanche?: RevancheRecebida | undefined;
  /** Online: falso enquanto a conexão não volta. */
  conectado?: boolean;
  /** Muda a cada reconexão. */
  conexao?: number;
  /** Online: a pessoa voltou a jogar no lugar do bot. */
  retomarControle?: () => void;
}
