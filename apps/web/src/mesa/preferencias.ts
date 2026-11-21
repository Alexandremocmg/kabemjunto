/** Mesa 3D ou 2D: `?mesa=2d|3d` na URL vence; senão vale `kabemjunto.mesa` no aparelho. */
export type PreferenciaMesa = '3d' | '2d';

const CHAVE_PREFERENCIA = 'kabemjunto.mesa';

export function lerPreferenciaMesa(): PreferenciaMesa {
  const daUrl = new URLSearchParams(window.location.search).get('mesa');
  if (daUrl === '2d' || daUrl === '3d') return daUrl;
  try {
    return window.localStorage.getItem(CHAVE_PREFERENCIA) === '2d' ? '2d' : '3d';
  } catch {
    return '3d';
  }
}

/** Testa WebGL sem segurar o contexto (ele é liberado na hora). */
export function suportaWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const contexto = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!contexto) return false;
    contexto.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function prefereMovimentoReduzido(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
