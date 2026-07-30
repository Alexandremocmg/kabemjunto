import { describe, expect, it } from 'vitest';
import type { Carta, EstadoPartidaPublico } from '@kabemjunto/shared';
import { validarJogadaPublica } from './validarJogadaPublica';

const seteAzul: Carta = {
  id: 'sete-azul',
  tipo: 'NUMERADA',
  cor: 'AZUL',
  valor: 7,
  raridade: 'COMUM',
  colecao: 'base-v1',
  efeito_texto_curto: '7',
  efeito_texto_longo: 'Carta numérica',
};

const estado: EstadoPartidaPublico = {
  partidaId: 'partida',
  salaId: 'sala',
  jogadores: [],
  topo: seteAzul,
  quantidadeMonteCompra: 20,
  vezDe: 'jogador',
  sentido: 1,
  corAtiva: 'AZUL',
  ataqueAcumulado: 0,
  ataqueStack: [],
  silencio: { ativo: false, jogadoresQuebraram: [] },
  finalizada: false,
};

function carta(overrides: Partial<Carta>): Carta {
  return { ...seteAzul, id: 'teste', ...overrides };
}

describe('validarJogadaPublica', () => {
  it('valida turno, fim da partida, cor ativa e mesma face sem reconstruir EstadoPartida', () => {
    expect(validarJogadaPublica(estado, seteAzul, 'outro').valida).toBe(false);
    expect(validarJogadaPublica({ ...estado, finalizada: true }, seteAzul, 'jogador').valida).toBe(
      false,
    );
    expect(validarJogadaPublica(estado, carta({ cor: 'AZUL', valor: 8 }), 'jogador').valida).toBe(
      true,
    );
    expect(validarJogadaPublica(estado, carta({ cor: 'VERDE', valor: 7 }), 'jogador').valida).toBe(
      true,
    );
  });

  it('aplica a defesa assimétrica do ataque usando apenas a projeção pública', () => {
    const maisQuatro: Carta = {
      id: 'mais-quatro',
      tipo: 'NEUTRA',
      cor: 'NEUTRO',
      acao: 'MAIS_QUATRO',
      raridade: 'COMUM',
      colecao: 'base-v1',
      efeito_texto_curto: '+4',
      efeito_texto_longo: 'Carta +4',
    };
    const maisDois: Carta = {
      id: 'mais-dois',
      tipo: 'ACAO',
      cor: 'AZUL',
      acao: 'MAIS_DOIS',
      raridade: 'COMUM',
      colecao: 'base-v1',
      efeito_texto_curto: '+2',
      efeito_texto_longo: 'Carta +2',
    };
    const sobAtaque = { ...estado, topo: maisQuatro, ataqueAcumulado: 4 };

    expect(validarJogadaPublica(sobAtaque, maisDois, 'jogador').valida).toBe(false);
    expect(validarJogadaPublica(sobAtaque, maisQuatro, 'jogador').valida).toBe(true);
  });
});
