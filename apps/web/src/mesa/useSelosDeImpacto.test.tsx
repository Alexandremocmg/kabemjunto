// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Carta, EstadoPartidaPublico } from '@kabemjunto/shared';
import type { Impacto } from './impactos';
import { DURACAO_SELO_MS, useSelosDeImpacto, type Selo } from './useSelosDeImpacto';

const maisDois = (id: string): Carta => ({
  id,
  tipo: 'ACAO',
  cor: 'AZUL',
  acao: 'MAIS_DOIS',
  raridade: 'COMUM',
  colecao: 'base-v1',
  efeito_texto_curto: id,
  efeito_texto_longo: id,
});

/** Cada passo acumula +2 mirando sempre b1 (só interessa a fila do mesmo jogador). */
function passo(n: number, partidaId = 'p'): EstadoPartidaPublico {
  return {
    partidaId,
    salaId: 's',
    jogadores: ['eu', 'b1'].map((id) => ({
      id,
      nome: id,
      quantidadeCartas: 5,
      isBot: false,
      conectado: true,
      disseUno: false,
      avatar: '',
      pontos: 0,
    })),
    topo: maisDois(`t${n}`),
    quantidadeMonteCompra: 20,
    vezDe: 'b1',
    sentido: 1,
    corAtiva: 'AZUL',
    ataqueAcumulado: n * 2,
    ataqueStack: [],
    silencio: { ativo: false, jogadoresQuebraram: [] },
    finalizada: false,
  };
}

let raiz: Root;
let selos: ReadonlyMap<string, Selo>;
const aoMostrar = vi.fn<[Impacto], void>();

function Teste(props: { anterior?: EstadoPartidaPublico; atual: EstadoPartidaPublico }) {
  selos = useSelosDeImpacto(props.anterior, props.atual, 'eu', aoMostrar);
  return null;
}

const desenhar = (atual: EstadoPartidaPublico, anterior?: EstadoPartidaPublico) =>
  act(() =>
    raiz.render(
      <StrictMode>
        <Teste atual={atual} {...(anterior ? { anterior } : {})} />
      </StrictMode>,
    ),
  );
const avancar = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const visivel = () => selos.get('b1')?.impacto.quantidade;

beforeEach(() => {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
  vi.useFakeTimers();
  aoMostrar.mockClear();
  raiz = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => raiz.unmount());
  vi.useRealTimers();
});

describe('useSelosDeImpacto', () => {
  it('mostra um por vez, guarda fila curta e some no fim', () => {
    desenhar(passo(0));
    for (let n = 1; n <= 4; n += 1) desenhar(passo(n), passo(n - 1));
    expect(visivel()).toBe(2);
    expect(aoMostrar).toHaveBeenCalledTimes(1);
    avancar(DURACAO_SELO_MS);
    expect(visivel()).toBe(6); // o +4 caiu da fila (máximo 2 esperando)
    avancar(DURACAO_SELO_MS);
    expect(visivel()).toBe(8);
    avancar(DURACAO_SELO_MS);
    expect(selos.size).toBe(0);
    expect(aoMostrar).toHaveBeenCalledTimes(3);
  });

  it('trocar de partida limpa selos e fila', () => {
    desenhar(passo(0));
    desenhar(passo(1), passo(0));
    desenhar(passo(2), passo(1));
    desenhar(passo(0, 'outra'), passo(2));
    expect(selos.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('desmontar não deixa timer solto', () => {
    desenhar(passo(0));
    desenhar(passo(1), passo(0));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => raiz.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});
