import type { JogadorPublico } from '@kabemjunto/shared';

/** Texto curto de por que um bot joga neste assento (undefined = a própria pessoa joga). */
export function situacaoDoBot(
  jogador: Pick<JogadorPublico, 'controladoPorBot' | 'motivoBot'>,
): string | undefined {
  if (!jogador.controladoPorBot) return undefined;
  switch (jogador.motivoBot) {
    case 'SAIU':
      return 'saiu · bot joga';
    case 'CAIU':
      return 'caiu · bot joga';
    case 'INATIVO':
      return 'ausente · bot joga';
    default:
      return 'bot joga';
  }
}
