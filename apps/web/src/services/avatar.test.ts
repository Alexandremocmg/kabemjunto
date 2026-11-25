// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { caminhoDoAvatar, emojiDoAvatar, lerAvatarEscolhido } from './avatar';

/** O Node novo esconde a localStorage do jsdom. */
function guardar(): Storage {
  const valores = new Map<string, string>();
  return {
    get length() {
      return valores.size;
    },
    clear: () => valores.clear(),
    getItem: (chave) => valores.get(chave) ?? null,
    key: (i) => [...valores.keys()][i] ?? null,
    removeItem: (chave) => valores.delete(chave),
    setItem: (chave, valor) => valores.set(chave, valor),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', guardar());
});

it('desenha só os avatares de 01 a 12', () => {
  expect(caminhoDoAvatar('01')).toBe('/assets/svgs/avatars/avatar-01.svg');
  expect(caminhoDoAvatar('avatar-12')).toBe('/assets/svgs/avatars/avatar-12.svg');
  for (const ruim of ['00', '13', '1', '', '../x', '⭐', undefined])
    expect(caminhoDoAvatar(ruim)).toBeUndefined();
});

it('mantém emojis de bots e salas antigas', () => {
  expect(emojiDoAvatar('🤖')).toBe('🤖');
  expect(emojiDoAvatar('⭐')).toBe('⭐');
  for (const semEmoji of ['', '07', '99', undefined]) expect(emojiDoAvatar(semEmoji)).toBe('👤');
});

it('só envia a escolha válida', () => {
  expect(lerAvatarEscolhido()).toBeUndefined();
  localStorage.setItem('kabemjunto.avatar', '07');
  expect(lerAvatarEscolhido()).toBe('07');
  localStorage.setItem('kabemjunto.avatar', '<script>');
  expect(lerAvatarEscolhido()).toBeUndefined();
});
