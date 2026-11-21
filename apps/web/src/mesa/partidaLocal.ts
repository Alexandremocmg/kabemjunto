/**
 * A partida local vive na sessionStorage: é o que permite recarregar a página
 * e voltar ao mesmo ponto, e trocar entre a mesa 3D e a 2D sem perder nada.
 */
import { criarPartida } from '../services/gameEngine';

export const CHAVE_PARTIDA_LOCAL = 'kabemjunto.estado';

export function temPartidaLocal(): boolean {
  try {
    return window.sessionStorage.getItem(CHAVE_PARTIDA_LOCAL) !== null;
  } catch {
    return false;
  }
}

/** Cria uma partida contra bots e a deixa salva para a mesa abrir. */
export function iniciarPartidaLocal(totalJogadores: number, nomeDoJogador: string): void {
  const nomes = [nomeDoJogador.trim() || 'Você'];
  for (let i = 1; i < totalJogadores; i += 1) nomes.push(`Bot ${i}`);
  const estado = criarPartida('BOTS', totalJogadores, nomes);
  window.sessionStorage.setItem(CHAVE_PARTIDA_LOCAL, JSON.stringify(estado));
}
