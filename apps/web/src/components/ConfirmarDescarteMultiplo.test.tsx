import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfirmarDescarteMultiplo, getFocusTrapTarget } from './ConfirmarDescarteMultiplo';
import type { Carta } from '@kabemjunto/shared/types';

const cartas: ReadonlyArray<Carta> = [
  {
    id: '8-AZUL',
    tipo: 'NUMERADA',
    cor: 'AZUL',
    valor: 8,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: '8',
    efeito_texto_longo: 'Carta numérica',
  },
  {
    id: 'SKIP-AZUL-1',
    tipo: 'ACAO',
    cor: 'AZUL',
    acao: 'SKIP',
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: 'Pula',
    efeito_texto_longo: 'Pula o próximo jogador',
  },
];

describe('ConfirmarDescarteMultiplo', () => {
  it('apresenta as cartas selecionadas e uma confirmação acessível', () => {
    const html = renderToStaticMarkup(
      <ConfirmarDescarteMultiplo cartas={cartas} onCancel={() => {}} onPlayMultiple={() => {}} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Confirmação de descarte múltiplo');
    expect(html).toContain('2 cartas selecionadas');
    expect(html).toContain('Carta 8 AZUL');
    expect(html).toContain('Pula');
    expect(html).toContain('Confirmar descarte de 2 cartas');
    expect(html).toContain('autofocus=""');
  });

  it('mantém o foco dentro do diálogo ao navegar além das extremidades', () => {
    expect(getFocusTrapTarget(1, 2, false)).toBe(0);
    expect(getFocusTrapTarget(0, 2, true)).toBe(1);
    expect(getFocusTrapTarget(0, 2, false)).toBeUndefined();
    expect(getFocusTrapTarget(-1, 0, false)).toBeUndefined();
  });
});
