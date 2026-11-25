export interface PosicaoSemanal {
  posicao: number;
  apelido: string;
  total: number;
  eu: boolean;
}

export interface CategoriaSemanal {
  top: PosicaoSemanal[];
  minhaPosicao?: number;
  meuTotal: number;
  nestaPartida: number;
}

/** Projeção privada para um participante, sem credenciais ou identificadores de navegador. */
export interface RankingSemanal {
  semana: string;
  tamanhoMesa: number;
  contou: boolean;
  vitorias: CategoriaSemanal;
  partidas: CategoriaSemanal;
  reflexos: CategoriaSemanal;
}
