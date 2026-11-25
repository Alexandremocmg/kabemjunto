import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  calcularEstatisticas,
  type CategoriaSemanal,
  type EstadoPartida,
  type RankingSemanal,
} from '@kabemjunto/shared';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const contagem = z.number().int().nonnegative();
const tamanho = z.number().int().min(2).max(10);
const grupo = z.string().regex(uuidV4);

export const rankingDaSalaSchema = z.object({
  grupo,
  membros: z.record(z.string(), hash),
  partidaComBot: z.string().optional(),
  resultado: z
    .object({ partidaId: z.string(), semana: data, contou: z.boolean(), tamanhoMesa: tamanho })
    .optional(),
});
export type RankingDaSala = z.infer<typeof rankingDaSalaSchema>;

const competidorSchema = z.object({
  chave: hash,
  apelido: z.string().min(1).max(24),
  partidas: contagem,
  reflexos: contagem,
  vitoriasPorMesa: z.record(z.string().regex(/^(?:[2-9]|10)$/), contagem),
});
type Competidor = z.infer<typeof competidorSchema>;

export const placaresSemanaisSchema = z.array(
  z.object({ grupo, semana: data, competidores: z.array(competidorSchema) }),
);
export type PlacaresSemanais = z.infer<typeof placaresSemanaisSchema>;

export function codigoRankingValido(valor: unknown): valor is string {
  return typeof valor === 'string' && uuidV4.test(valor);
}

export function chaveMembro(grupo: string, credencial: string): string {
  return createHash('sha256').update(`${grupo}:${credencial.toLowerCase()}`).digest('hex');
}

const formatoCivil = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function segundaFeira(instante: number): Date {
  const partes = formatoCivil.formatToParts(new Date(instante));
  const campo = (nome: string) => Number(partes.find((parte) => parte.type === nome)?.value);
  const dia = new Date(Date.UTC(campo('year'), campo('month') - 1, campo('day')));
  dia.setUTCDate(dia.getUTCDate() - ((dia.getUTCDay() + 6) % 7));
  return dia;
}

function membro(ranking: RankingDaSala, jogadorId: string): string | undefined {
  return Object.hasOwn(ranking.membros, jogadorId) ? ranking.membros[jogadorId] : undefined;
}

export function registrarRanking(
  placares: PlacaresSemanais,
  ranking: RankingDaSala,
  estado: EstadoPartida,
  agora: number,
): { ranking: RankingDaSala; placares: PlacaresSemanais } {
  const inicio = segundaFeira(agora);
  const semana = inicio.toISOString().slice(0, 10);
  const tamanhoMesa = estado.jogadores.length;
  const contou =
    estado.finalizada &&
    Boolean(estado.vencedor) &&
    ranking.partidaComBot !== estado.partidaId &&
    tamanhoMesa >= 2 &&
    estado.jogadores.every((jogador) => !jogador.isBot && membro(ranking, jogador.id)) &&
    new Set(estado.jogadores.map((jogador) => membro(ranking, jogador.id))).size === tamanhoMesa;
  const atualizado = {
    ...ranking,
    resultado: { partidaId: estado.partidaId, semana, tamanhoMesa, contou },
  };
  if (!contou) return { ranking: atualizado, placares };

  const alvo = placares.find((item) => item.grupo === ranking.grupo && item.semana === semana);
  const competidores = new Map(alvo?.competidores.map((item) => [item.chave, item]));
  const estatisticas = calcularEstatisticas(estado);
  for (const jogador of estado.jogadores) {
    const chave = membro(ranking, jogador.id)!;
    const anterior = competidores.get(chave);
    const mesa = String(tamanhoMesa);
    const vitoriasPorMesa = { ...anterior?.vitoriasPorMesa };
    if (estado.vencedor === jogador.id) {
      vitoriasPorMesa[mesa] = (vitoriasPorMesa[mesa] ?? 0) + 1;
    }
    competidores.set(chave, {
      chave,
      apelido: jogador.nome,
      partidas: (anterior?.partidas ?? 0) + 1,
      reflexos:
        (anterior?.reflexos ?? 0) +
        (estatisticas.find((item) => item.jogadorId === jogador.id)?.reflexosFeitos ?? 0),
      vitoriasPorMesa,
    });
  }
  inicio.setUTCDate(inicio.getUTCDate() - 7);
  const semanaAnterior = inicio.toISOString().slice(0, 10);
  return {
    ranking: atualizado,
    placares: [
      ...placares.filter((item) => item !== alvo && item.semana >= semanaAnterior),
      { grupo: ranking.grupo, semana, competidores: [...competidores.values()] },
    ],
  };
}

export function rankingDoJogador(
  placares: PlacaresSemanais,
  ranking: RankingDaSala,
  estado: EstadoPartida,
  jogadorId: string,
  reflexosDaPartida: number,
): RankingSemanal | undefined {
  const { resultado } = ranking;
  const chave = membro(ranking, jogadorId);
  if (!chave || resultado?.partidaId !== estado.partidaId) return undefined;
  const { semana, tamanhoMesa, contou } = resultado;
  const competidores =
    placares.find((item) => item.grupo === ranking.grupo && item.semana === semana)?.competidores ??
    [];

  function categoria(valor: (item: Competidor) => number, pontos: number): CategoriaSemanal {
    let posicao = 0;
    const linhas = competidores
      .map((item) => ({ apelido: item.apelido, total: valor(item), eu: item.chave === chave }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total || a.apelido.localeCompare(b.apelido, 'pt-BR'))
      .map((item, indice, lista) => {
        if (lista[indice - 1]?.total !== item.total) posicao = indice + 1;
        return { ...item, posicao };
      });
    const minha = linhas.find((item) => item.eu);
    return {
      top: linhas.slice(0, 10),
      ...(minha ? { minhaPosicao: minha.posicao } : {}),
      meuTotal: minha?.total ?? 0,
      nestaPartida: contou ? pontos : 0,
    };
  }
  return {
    semana,
    tamanhoMesa,
    contou,
    vitorias: categoria(
      (item) => item.vitoriasPorMesa[String(tamanhoMesa)] ?? 0,
      Number(estado.vencedor === jogadorId),
    ),
    partidas: categoria((item) => item.partidas, 1),
    reflexos: categoria((item) => item.reflexos, reflexosDaPartida),
  };
}
