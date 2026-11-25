const FORMATO_GRUPO = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULTIMO_GRUPO = 'kabemjunto.ranking.ultimo-grupo';

export function normalizarGrupo(valor: string): string | undefined {
  const limpo = valor.trim().toLowerCase();
  return FORMATO_GRUPO.test(limpo) ? limpo : undefined;
}

export function grupoDoConvite(fragmento: string): string | undefined {
  return normalizarGrupo(new URLSearchParams(fragmento.replace(/^#/, '')).get('grupo') ?? '');
}

export function ultimoGrupo(): string | undefined {
  try {
    return normalizarGrupo(localStorage.getItem(ULTIMO_GRUPO) ?? '');
  } catch {
    return undefined;
  }
}

export function lembrarGrupo(grupo: string): void {
  try {
    localStorage.setItem(ULTIMO_GRUPO, grupo);
  } catch {
    // Ainda é possível copiar manualmente o código do grupo.
  }
}

/** Cada grupo tem uma credencial aleatória própria. O servidor só guarda seu hash. */
export function credencialDoRanking(grupo: string): string | undefined {
  try {
    const chave = `kabemjunto.ranking.membro.${grupo}`;
    const atual = normalizarGrupo(localStorage.getItem(chave) ?? '');
    if (atual) return atual;
    const nova = globalThis.crypto?.randomUUID?.();
    if (nova) localStorage.setItem(chave, nova);
    return nova;
  } catch {
    return undefined;
  }
}
