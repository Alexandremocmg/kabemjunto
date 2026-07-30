import { describe, expect, it } from 'vitest';
import { descreverZeroMais } from './zeroPlusFeedback';

describe('descreverZeroMais', () => {
  it('informa neutralização quando o ataque veio da starter', () => {
    expect(
      descreverZeroMais(
        {
          historico: [
            {
              tipo: 'ATAQUE_ACUMULADO',
              timestamp: 1,
              novo: 2,
              stack: ['MAIS_DOIS'],
              origem: 'STARTER',
            },
          ],
        },
        'Ana',
      ),
    ).toEqual({
      titulo: '0+! Ataque neutralizado!',
      detalhe: 'Ana encerrou o ataque iniciado pela carta da mesa.',
    });
  });

  it('informa reflexo quando existe último atacante humano', () => {
    expect(
      descreverZeroMais(
        {
          historico: [
            {
              tipo: 'ATAQUE_ACUMULADO',
              timestamp: 1,
              novo: 4,
              stack: ['MAIS_QUATRO'],
              origem: 'j2',
            },
          ],
        },
        'Ana',
      ),
    ).toEqual({
      titulo: '0+! Ataque refletido!',
      detalhe: 'Ana devolveu o ataque para o último atacante.',
    });
  });
});
