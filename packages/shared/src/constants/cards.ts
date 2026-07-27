import { Carta, Cor } from '../types';

export const CORES_JOGO: Cor[] = ['LARANJA', 'AZUL', 'VERDE', 'PRETO'];

export const PALETA_CORES: Record<
  Cor,
  {
    hex: string;
    hsl: string;
    bgLight: string;
    border: string;
    simboloAcessivel: string;
    nomePt: string;
  }
> = {
  LARANJA: {
    hex: '#F39C12',
    hsl: 'hsl(37, 90%, 51%)',
    bgLight: '#FDF2E9',
    border: '#D68910',
    simboloAcessivel: '●',
    nomePt: 'Laranja',
  },
  AZUL: {
    hex: '#3498DB',
    hsl: 'hsl(204, 70%, 53%)',
    bgLight: '#EBF5FB',
    border: '#2980B9',
    simboloAcessivel: '◆',
    nomePt: 'Azul',
  },
  VERDE: {
    hex: '#27AE60',
    hsl: 'hsl(145, 63%, 42%)',
    bgLight: '#EAFAF1',
    border: '#1E8449',
    simboloAcessivel: '▲',
    nomePt: 'Verde',
  },
  PRETO: {
    hex: '#2C3E50',
    hsl: 'hsl(210, 29%, 24%)',
    bgLight: '#EAECEE',
    border: '#1A252F',
    simboloAcessivel: '★',
    nomePt: 'Preto',
  },
  NEUTRO: {
    hex: '#8E44AD',
    hsl: 'hsl(282, 44%, 47%)',
    bgLight: '#F4ECF7',
    border: '#6C3483',
    simboloAcessivel: '✦',
    nomePt: 'Coringa / Neutra',
  },
};

export function gerarBaralho108(): Carta[] {
  const baralho: Carta[] = [];

  // 1. Cartas Coloridas (25 por cor = 100 cartas)
  CORES_JOGO.forEach((cor) => {
    if (cor === 'NEUTRO') return;
    const nomeCor = PALETA_CORES[cor].nomePt;

    // Número 0 (1 por cor)
    baralho.push({
      id: `${cor}_NUM_0_1`,
      cor,
      tipo: 'NUMERADA',
      valor: 0,
      raridade: 'COMUM',
      colecao: 'base-v1',
      efeito_texto_curto: `0 ${nomeCor}`,
      efeito_texto_longo: `Carta número 0 da cor ${nomeCor}.`,
    });

    // Números 1 a 6, 8, 9 (2 por cor)
    const numerosComuns = [1, 2, 3, 4, 5, 6, 8, 9];
    numerosComuns.forEach((num) => {
      for (let i = 1; i <= 2; i++) {
        baralho.push({
          id: `${cor}_NUM_${num}_${i}`,
          cor,
          tipo: 'NUMERADA',
          valor: num,
          raridade: 'COMUM',
          colecao: 'base-v1',
          efeito_texto_curto: `${num} ${nomeCor}`,
          efeito_texto_longo: `Carta número ${num} da cor ${nomeCor}.`,
        });
      }
    });

    // Carta 7 - Regra do Silêncio (2 por cor)
    for (let i = 1; i <= 2; i++) {
      baralho.push({
        id: `${cor}_7_${i}`,
        cor,
        tipo: 'NUMERADA',
        valor: 7,
        acao: 'SILENCIO',
        raridade: 'INCOMUM',
        colecao: 'base-v1',
        efeito_texto_curto: `7 ${nomeCor} (Silêncio)`,
        efeito_texto_longo: `Ativa a Regra do Silêncio! Todos em silêncio até a próxima carta não-7. Quem falar compra +2!`,
      });
    }

    // Ação: SKIP (2 por cor)
    for (let i = 1; i <= 2; i++) {
      baralho.push({
        id: `${cor}_SKIP_${i}`,
        cor,
        tipo: 'ACAO',
        acao: 'SKIP',
        raridade: 'COMUM',
        colecao: 'base-v1',
        efeito_texto_curto: `Pula ${nomeCor}`,
        efeito_texto_longo: `Pula a vez do próximo jogador.`,
      });
    }

    // Ação: REVERSE (2 por cor)
    for (let i = 1; i <= 2; i++) {
      baralho.push({
        id: `${cor}_REV_${i}`,
        cor,
        tipo: 'ACAO',
        acao: 'REVERSE',
        raridade: 'COMUM',
        colecao: 'base-v1',
        efeito_texto_curto: `Inverte ${nomeCor}`,
        efeito_texto_longo: `Inverte a ordem dos turnos.`,
      });
    }

    // Ação: MAIS_DOIS (2 por cor)
    for (let i = 1; i <= 2; i++) {
      baralho.push({
        id: `${cor}_PLUS2_${i}`,
        cor,
        tipo: 'ACAO',
        acao: 'MAIS_DOIS',
        raridade: 'INCOMUM',
        colecao: 'base-v1',
        efeito_texto_curto: `+2 ${nomeCor}`,
        efeito_texto_longo: `Próximo jogador compra 2 cartas e perde o turno. Empilhável!`,
      });
    }
  });

  // 2. Cartas Neutras (8 cartas total)

  // MAIS_QUATRO (+4 Coringa) - 4 cartas
  for (let i = 1; i <= 4; i++) {
    baralho.push({
      id: `NEUTRA_WILD4_${i}`,
      cor: 'NEUTRO',
      tipo: 'NEUTRA',
      acao: 'MAIS_QUATRO',
      raridade: 'RARA',
      colecao: 'base-v1',
      efeito_texto_curto: `+4 Coringa`,
      efeito_texto_longo: `Próximo jogador compra 4 cartas e perde a vez. Você escolhe a nova cor ativada. Empilhável!`,
    });
  }

  // TROCA_MAO - 1 carta
  baralho.push({
    id: `NEUTRA_SWAPHAND_1`,
    cor: 'NEUTRO',
    tipo: 'NEUTRA',
    acao: 'TROCA_MAO',
    raridade: 'RARA',
    colecao: 'base-v1',
    efeito_texto_curto: `Troca Mão`,
    efeito_texto_longo: `Escolha um jogador e troque toda a sua mão com a dele!`,
  });

  // GIRA_MAO - 1 carta
  baralho.push({
    id: `NEUTRA_HANDSPIN_1`,
    cor: 'NEUTRO',
    tipo: 'NEUTRA',
    acao: 'GIRA_MAO',
    raridade: 'RARA',
    colecao: 'base-v1',
    efeito_texto_curto: `Gira Mão`,
    efeito_texto_longo: `Todos os jogadores passam suas mãos para o vizinho na direção do jogo.`,
  });

  // ZERO_MAIS - 1 carta ÚNICA
  baralho.push({
    id: `NEUTRA_ZEROPLUS_1`,
    cor: 'NEUTRO',
    tipo: 'NEUTRA',
    acao: 'ZERO_MAIS',
    raridade: 'UNICA',
    colecao: 'base-v1',
    efeito_texto_curto: `0+ (Zero Mais)`,
    efeito_texto_longo: `MOMENTO VIRAL! Reflete todo o ataque acumulado de volta ao último atacante e encerra a pilha!`,
  });

  // CORINGA_SIMPLES - 1 carta
  baralho.push({
    id: `NEUTRA_WILD_1`,
    cor: 'NEUTRO',
    tipo: 'NEUTRA',
    acao: 'CORINGA_SIMPLES',
    raridade: 'INCOMUM',
    colecao: 'base-v1',
    efeito_texto_curto: `Coringa Simples`,
    efeito_texto_longo: `Altera a cor ativa do jogo para a cor de sua escolha.`,
  });

  return baralho;
}

export const BARALHO_COMPLETO_108 = gerarBaralho108();
