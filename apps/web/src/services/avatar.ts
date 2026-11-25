/** Avatares do jogo: ids de '01' a '12' (desenhos) ou um emoji (bots e salas antigas). */
export const CHAVE_AVATAR = 'kabemjunto.avatar';

export function avatarDesenhado(avatar: string | undefined): string | undefined {
  const id = avatar?.replace(/^avatar-?/, '');
  return id && /^(0[1-9]|1[0-2])$/.test(id) ? id : undefined;
}

/** Endereço do desenho, ou `undefined` quando o avatar é emoji (ou nenhum). */
export function caminhoDoAvatar(avatar: string | undefined): string | undefined {
  const id = avatarDesenhado(avatar);
  return id ? `/assets/svgs/avatars/avatar-${id}.svg` : undefined;
}

/** Texto para quando não há desenho: o emoji recebido, ou uma silhueta. */
export function emojiDoAvatar(avatar: string | undefined): string {
  return !avatar || /^(avatar-?)?\d*$/.test(avatar) ? '👤' : avatar;
}

/** Avatar escolhido no perfil, pronto para o servidor (só ids válidos). */
export function lerAvatarEscolhido(): string | undefined {
  try {
    return avatarDesenhado(window.localStorage.getItem(CHAVE_AVATAR) ?? undefined);
  } catch {
    return undefined;
  }
}
