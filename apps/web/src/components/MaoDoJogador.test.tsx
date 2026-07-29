import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Carta, EstadoPartida } from '@kabemjunto/shared/types';
import { MaoDoJogador } from './MaoDoJogador';

const cartas: ReadonlyArray<Carta> = [
  {
    id: 'sete-azul',
    tipo: 'NUMERADA',
    cor: 'AZUL',
    valor: 7,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: '7',
    efeito_texto_longo: 'Carta numérica',
  },
  {
    id: 'sete-verde',
    tipo: 'NUMERADA',
    cor: 'VERDE',
    valor: 7,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: '7',
    efeito_texto_longo: 'Carta numérica',
  },
];

const estado = {
  partidaId: 'partida',
  salaId: 'sala',
  jogadores: [
    {
      id: 'jogador',
      nome: 'Você',
      mao: cartas,
      isBot: false,
      conectado: true,
      disseUno: false,
      avatar: '👤',
      pontos: 0,
    },
  ],
  monteCompra: [],
  monteDescarte: [cartas[0]],
  vezDe: 'jogador',
  sentido: 1,
  corAtiva: 'AZUL',
  ataqueAcumulado: 0,
  ataqueStack: [],
  silencio: { ativo: false, jogadoresQuebraram: [] },
  historico: [],
  finalizada: false,
} as EstadoPartida;

describe('MaoDoJogador — pilha por gesto', () => {
  it('remove os controles permanentes e oferece a alternativa de teclado sem modal', () => {
    const html = renderToStaticMarkup(
      <MaoDoJogador estado={estado} onSelecionarCarta={() => {}} onPlayMultiple={() => {}} />,
    );

    expect(html).not.toContain('Descarte múltiplo');
    expect(html).not.toContain('Revisar descarte múltiplo');
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain('Alt+Enter');
    expect(html).toContain('hand-fan');
  });
});
