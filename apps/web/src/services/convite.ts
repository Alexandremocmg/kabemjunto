/** Link de convite: `?sala=CÓDIGO` só preenche o campo do menu; ninguém entra sozinho. */
const FORMATO = /^[A-Z0-9]{4,6}$/;

export const FRASE_DESAFIO = ['Quero ver você', 'devolver meu +4', 'com um 0+.'] as const;

export function codigoDoConvite(busca: string): string | undefined {
  const codigo = new URLSearchParams(busca).get('sala')?.trim().toUpperCase();
  return codigo && FORMATO.test(codigo) ? codigo : undefined;
}

/** Endereço do jogo, com o código se houver. Nunca leva o resto da URL atual. */
export function linkDoJogo(
  codigo: string | undefined,
  base: string = new URL(import.meta.env.BASE_URL, window.location.origin).href,
): string {
  const url = new URL(base);
  if (codigo && FORMATO.test(codigo)) url.searchParams.set('sala', codigo);
  return url.href;
}
