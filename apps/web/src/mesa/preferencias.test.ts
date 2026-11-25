// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lerPreferenciaPeso } from './preferencias';

/** Armazenamento em memória: o `localStorage` do jsdom some em algumas versões do Node. */
function armazenamentoEmMemoria(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (chave) => dados.get(chave) ?? null,
    key: (indice) => [...dados.keys()][indice] ?? null,
    removeItem: (chave) => void dados.delete(chave),
    setItem: (chave, valor) => void dados.set(chave, String(valor)),
  };
}

/** Armazenamento que recusa tudo, como no modo privado de alguns navegadores. */
function armazenamentoBloqueado(): Storage {
  const bloquear = (): never => {
    throw new Error('bloqueado');
  };
  return {
    get length(): number {
      return bloquear();
    },
    clear: bloquear,
    getItem: bloquear,
    key: bloquear,
    removeItem: bloquear,
    setItem: bloquear,
  };
}

function instalar(armazenamento: Storage): void {
  Object.defineProperty(window, 'localStorage', { value: armazenamento, configurable: true });
}

function abrir(busca: string): void {
  window.history.replaceState(null, '', `/${busca}`);
}

beforeEach(() => {
  instalar(armazenamentoEmMemoria());
  abrir('');
});

afterEach(() => {
  abrir('');
});

describe('lerPreferenciaPeso', () => {
  it('vem desligado por padrão', () => {
    expect(lerPreferenciaPeso()).toBe(false);
  });

  it('?peso=1 liga e fica guardado para as próximas visitas', () => {
    abrir('?peso=1');
    expect(lerPreferenciaPeso()).toBe(true);
    abrir('');
    expect(lerPreferenciaPeso()).toBe(true);
  });

  it('?peso=0 desliga e apaga o que estava guardado', () => {
    window.localStorage.setItem('kabemjunto.peso', '1');
    abrir('?peso=0');
    expect(lerPreferenciaPeso()).toBe(false);
    abrir('');
    expect(lerPreferenciaPeso()).toBe(false);
    expect(window.localStorage.getItem('kabemjunto.peso')).toBeNull();
  });

  it('ignora valores desconhecidos e usa o que está guardado', () => {
    window.localStorage.setItem('kabemjunto.peso', '1');
    abrir('?peso=talvez');
    expect(lerPreferenciaPeso()).toBe(true);
  });

  it('sem armazenamento disponível, vale só a URL e não quebra', () => {
    instalar(armazenamentoBloqueado());
    abrir('?peso=1');
    expect(lerPreferenciaPeso()).toBe(true);
    abrir('');
    expect(lerPreferenciaPeso()).toBe(false);
  });
});
