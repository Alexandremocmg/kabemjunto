/**
 * Métricas de uso anônimas (ver docs/METRICAS.md).
 *
 * Tudo aqui é NO-OP sem `VITE_POSTHOG_API_KEY`, com a telemetria desligada, com
 * Do Not Track / Global Privacy Control, ou com opt-out. Nesses casos nada é
 * enviado e nada é gravado no aparelho.
 *
 * A lista de eventos é FECHADA: `limparEvento` só deixa passar o que está em
 * `CONTRATO`, com os valores previstos. Nenhuma propriedade aceita texto livre,
 * então nome, chat, sala, token, ids e cartas não têm por onde sair.
 */
import { getTelemetryConfig, logCustom } from '@kabemjunto/shared';

const CHAVE_OPT_OUT = 'kabemjunto.metricas.optout';
const CHAVE_ULTIMA_VISITA = 'kabemjunto.metricas.ultimaVisita';
/** sessionStorage: partidas já contadas nesta aba. Nunca sai do aparelho. */
const CHAVE_PARTIDAS = 'kabemjunto.metricas.partidas';
const MAXIMO_DE_PARTIDAS = 30;

const MODOS = ['local', 'online', 'rapida'] as const;
const RESULTADOS = ['vitoria', 'derrota', 'abandono'] as const;
const DURACOES = ['<2min', '2-5min', '5-10min', '10-20min', '20min+'] as const;
const QUEDAS = ['<5s', '5-30s', '30s-2min', '2min+'] as const;
const DIAS = ['0', '1', '2-6', '7+'] as const;
const MOTIVOS_BUSCA = ['falha', 'tempo'] as const;
/** Valores possíveis de um inteiro entre `min` e `max`, inclusive. */
const inteiros = (min: number, max: number): number[] =>
  Array.from({ length: max - min + 1 }, (_, i) => min + i);

export type ModoDePartida = (typeof MODOS)[number];
export type ResultadoDePartida = (typeof RESULTADOS)[number];
export type MotivoDaBuscaVirarLocal = (typeof MOTIVOS_BUSCA)[number];

/** Propriedades de cada evento. Todas são obrigatórias. */
export type PropriedadesDosEventos = {
  PARTIDA_INICIADA: { modo: ModoDePartida; totalJogadores: number; bots: number };
  PARTIDA_TERMINADA: {
    modo: ModoDePartida;
    resultado: ResultadoDePartida;
    duracao: (typeof DURACOES)[number];
  };
  PARTIDA_ABANDONADA: { modo: ModoDePartida; duracao: (typeof DURACOES)[number] };
  BUSCA_RAPIDA_CANCELADA: Record<string, never>;
  BUSCA_RAPIDA_VIROU_LOCAL: { motivo: MotivoDaBuscaVirarLocal };
  REVANCHE_PEDIDA: { modo: ModoDePartida };
  RETORNO: { diasDesdeUltima: (typeof DIAS)[number] };
  RECONECTADO: { duracao: (typeof QUEDAS)[number] };
};
export type NomeDeEvento = keyof PropriedadesDosEventos;

/** Lista fechada: evento -> propriedade -> valores aceitos. */
const CONTRATO: Record<NomeDeEvento, Record<string, ReadonlyArray<string | number>>> = {
  PARTIDA_INICIADA: { modo: MODOS, totalJogadores: inteiros(2, 10), bots: inteiros(0, 9) },
  PARTIDA_TERMINADA: { modo: MODOS, resultado: RESULTADOS, duracao: DURACOES },
  PARTIDA_ABANDONADA: { modo: MODOS, duracao: DURACOES },
  BUSCA_RAPIDA_CANCELADA: {},
  BUSCA_RAPIDA_VIROU_LOCAL: { motivo: MOTIVOS_BUSCA },
  REVANCHE_PEDIDA: { modo: MODOS },
  RETORNO: { diasDesdeUltima: DIAS },
  RECONECTADO: { duracao: QUEDAS },
};

export const EVENTOS = Object.keys(CONTRATO) as ReadonlyArray<NomeDeEvento>;

/**
 * Filtro final, usado pelo sink: devolve só as propriedades previstas, ou
 * `undefined` se o evento não é da lista ou se algum valor foge do previsto.
 * Também barra os eventos do motor (que trazem cartas e ids), inclusive o
 * `PARTIDA_INICIADA` dele, que tem o mesmo nome e outras propriedades.
 */
export function limparEvento(
  tipo: string,
  propriedades: Readonly<Record<string, unknown>>,
): Record<string, string | number> | undefined {
  if (!Object.hasOwn(CONTRATO, tipo)) return undefined;
  const limpas: Record<string, string | number> = {};
  for (const [nome, aceitos] of Object.entries(CONTRATO[tipo as NomeDeEvento])) {
    const valor = aceitos.find((aceito) => aceito === propriedades[nome]);
    if (valor === undefined) return undefined;
    limpas[nome] = valor;
  }
  return limpas;
}

// ─── Permissão ─────────────────────────────────────────────────────

/** Chave do projeto, ou `undefined` (o valor de exemplo do .env.example não conta). */
export function chaveDeMetricas(): string | undefined {
  const chave = (import.meta.env['VITE_POSTHOG_API_KEY'] as string | undefined)?.trim();
  return chave && !chave.includes('your_project_token') ? chave : undefined;
}

let optOutNestaPagina = false;

/** Preferência da pessoa. Se não der para ler o armazenamento, vale o lado seguro: não medir. */
export function lerOptOut(): boolean {
  if (optOutNestaPagina) return true;
  try {
    return window.localStorage.getItem(CHAVE_OPT_OUT) === '1';
  } catch {
    return true;
  }
}

/** Liga/desliga o opt-out. Ao ligar, apaga o que as métricas guardavam no aparelho. */
export function definirOptOut(optOut: boolean): void {
  optOutNestaPagina = optOut;
  try {
    if (optOut) {
      window.localStorage.setItem(CHAVE_OPT_OUT, '1');
      window.localStorage.removeItem(CHAVE_ULTIMA_VISITA);
    } else {
      window.localStorage.removeItem(CHAVE_OPT_OUT);
    }
  } catch {
    // Armazenamento bloqueado: a escolha vale só até recarregar (e sem leitura não se mede).
  }
  if (!optOut) return;
  partidas = undefined;
  try {
    window.sessionStorage.removeItem(CHAVE_PARTIDAS);
  } catch {
    // Nada guardado que dê para apagar.
  }
}

function navegadorPedePrivacidade(): boolean {
  const nav = window.navigator as Navigator & { globalPrivacyControl?: boolean };
  const dnt = nav.doNotTrack ?? (window as Window & { doNotTrack?: string | null }).doNotTrack;
  return dnt === '1' || dnt === 'yes' || nav.globalPrivacyControl === true;
}

/** Tudo certo para enviar? Conferido a cada evento, então o opt-out vale na hora. */
export function metricasPermitidas(): boolean {
  return (
    typeof window !== 'undefined' &&
    chaveDeMetricas() !== undefined &&
    !navegadorPedePrivacidade() &&
    !lerOptOut()
  );
}

const ativas = (): boolean => getTelemetryConfig().enabled && metricasPermitidas();

function emitir<E extends NomeDeEvento>(evento: E, propriedades: PropriedadesDosEventos[E]): void {
  logCustom(evento, propriedades);
}

// ─── Faixas ────────────────────────────────────────────────────────

const MINUTO = 60_000;

export function faixaDeDuracao(ms: number): (typeof DURACOES)[number] {
  if (ms < 2 * MINUTO) return '<2min';
  if (ms < 5 * MINUTO) return '2-5min';
  if (ms < 10 * MINUTO) return '5-10min';
  return ms < 20 * MINUTO ? '10-20min' : '20min+';
}

export function faixaDeQueda(ms: number): (typeof QUEDAS)[number] {
  if (ms < 5_000) return '<5s';
  if (ms < 30_000) return '5-30s';
  return ms < 2 * MINUTO ? '30s-2min' : '2min+';
}

export function faixaDeDias(dias: number): (typeof DIAS)[number] {
  if (dias < 1) return '0';
  if (dias < 2) return '1';
  return dias < 7 ? '2-6' : '7+';
}

// ─── Partidas (dedupe por partidaId) ───────────────────────────────

interface RegistroDePartida {
  modo: ModoDePartida;
  inicio: number;
  /** Já contou término ou abandono (um exclui o outro). */
  fim?: boolean;
  revanche?: boolean;
}

/** Cópia em memória: segura o dedupe quando a sessionStorage não está disponível. */
let partidas: Map<string, RegistroDePartida> | undefined;

function lerPartidas(): Map<string, RegistroDePartida> {
  if (partidas) return partidas;
  partidas = new Map();
  try {
    const salvo: unknown = JSON.parse(window.sessionStorage.getItem(CHAVE_PARTIDAS) ?? '{}');
    for (const [id, registro] of Object.entries(salvo as Record<string, RegistroDePartida>)) {
      if (MODOS.includes(registro.modo) && typeof registro.inicio === 'number') {
        partidas.set(id, registro);
      }
    }
  } catch {
    // Sem armazenamento (ou conteúdo inválido): vale só a memória.
  }
  return partidas;
}

function guardarPartida(partidaId: string, registro: RegistroDePartida): void {
  const todas = lerPartidas();
  todas.set(partidaId, registro);
  for (const antiga of todas.keys()) {
    if (todas.size <= MAXIMO_DE_PARTIDAS) break;
    todas.delete(antiga);
  }
  try {
    window.sessionStorage.setItem(CHAVE_PARTIDAS, JSON.stringify(Object.fromEntries(todas)));
  } catch {
    // Fica só na memória.
  }
}

export interface PartidaObservada {
  partidaId: string;
  jogadores: ReadonlyArray<{ isBot: boolean }>;
  finalizada: boolean;
  vencedor?: string;
}

/**
 * Chamada a cada mudança de estado: emite PARTIDA_INICIADA na primeira vez que
 * vê a partida e PARTIDA_TERMINADA quando ela acaba. Repetir é inofensivo.
 * Partida que já aparece terminada (ex.: recarregar na tela final) não conta.
 */
export function observarPartida(
  partida: PartidaObservada,
  modo: ModoDePartida,
  jogadorId: string,
): void {
  if (!ativas()) return;
  const registro = lerPartidas().get(partida.partidaId);
  if (!registro) {
    if (partida.finalizada) return;
    guardarPartida(partida.partidaId, { modo, inicio: Date.now() });
    emitir('PARTIDA_INICIADA', {
      modo,
      totalJogadores: partida.jogadores.length,
      bots: partida.jogadores.filter((jogador) => jogador.isBot).length,
    });
    return;
  }
  if (!partida.finalizada || registro.fim) return;
  guardarPartida(partida.partidaId, { ...registro, fim: true });
  emitir('PARTIDA_TERMINADA', {
    modo: registro.modo,
    // Sem vencedor, a partida foi encerrada pela saída de outra pessoa.
    resultado:
      partida.vencedor === undefined
        ? 'abandono'
        : partida.vencedor === jogadorId
          ? 'vitoria'
          : 'derrota',
    duracao: faixaDeDuracao(Date.now() - registro.inicio),
  });
}

/** A pessoa saiu de uma partida em andamento. Depois do fim não conta. */
export function partidaAbandonada(partidaId: string): void {
  if (!ativas()) return;
  const registro = lerPartidas().get(partidaId);
  if (!registro || registro.fim) return;
  guardarPartida(partidaId, { ...registro, fim: true });
  emitir('PARTIDA_ABANDONADA', {
    modo: registro.modo,
    duracao: faixaDeDuracao(Date.now() - registro.inicio),
  });
}

/** A pessoa pediu revanche desta partida (conta uma vez por partida). */
export function revanchePedida(partidaId: string): void {
  if (!ativas()) return;
  const registro = lerPartidas().get(partidaId);
  if (!registro || registro.revanche) return;
  guardarPartida(partidaId, { ...registro, revanche: true });
  emitir('REVANCHE_PEDIDA', { modo: registro.modo });
}

// ─── Busca rápida e conexão ────────────────────────────────────────

export function buscaRapidaCancelada(): void {
  if (ativas()) emitir('BUSCA_RAPIDA_CANCELADA', {});
}

export function buscaRapidaVirouLocal(motivo: MotivoDaBuscaVirarLocal): void {
  if (ativas()) emitir('BUSCA_RAPIDA_VIROU_LOCAL', { motivo });
}

export function reconectado(quedaMs: number): void {
  if (ativas()) emitir('RECONECTADO', { duracao: faixaDeQueda(quedaMs) });
}

// ─── Retorno ───────────────────────────────────────────────────────

function diaLocal(data: Date): string {
  const doisDigitos = (n: number): string => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/**
 * Primeira abertura do dia neste aparelho. Guarda só a data (AAAA-MM-DD), sem
 * identificador. '0' = sem visita anterior conhecida. Se a data não puder ser
 * guardada, não emite: cada abertura pareceria uma primeira visita.
 */
export function registrarRetorno(agora: Date = new Date()): void {
  if (!ativas()) return;
  const hoje = diaLocal(agora);
  let dias = 0;
  try {
    const ultima = window.localStorage.getItem(CHAVE_ULTIMA_VISITA);
    if (ultima === hoje) return;
    window.localStorage.setItem(CHAVE_ULTIMA_VISITA, hoje);
    if (ultima && /^\d{4}-\d{2}-\d{2}$/.test(ultima)) {
      // Datas sem hora viram meia-noite UTC: a diferença é sempre em dias inteiros.
      dias = Math.round((Date.parse(hoje) - Date.parse(ultima)) / (24 * 60 * MINUTO)) || 0;
    }
  } catch {
    return;
  }
  emitir('RETORNO', { diasDesdeUltima: faixaDeDias(dias) });
}
