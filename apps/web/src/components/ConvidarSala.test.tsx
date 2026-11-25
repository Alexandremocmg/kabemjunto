// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ConvidarSala } from './ConvidarSala';

it('compartilha o link com o código da sala; sem share, copia', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const caixa = document.createElement('div');
  const root = createRoot(caixa);
  act(() => root.render(<ConvidarSala salaId="ABC234" />));
  const clicar = () => act(async () => caixa.querySelector('button')!.click());
  const share = vi.fn((_dados: ShareData) => Promise.resolve());
  const writeText = vi.fn((_texto: string) => Promise.resolve());
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  await clicar();
  expect(share.mock.calls[0]![0].url).toMatch(/\?sala=ABC234$/);
  expect(share.mock.calls[0]![0]).not.toHaveProperty('files');
  expect(caixa.textContent).toContain('Convite enviado.');

  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  await clicar();
  expect(writeText.mock.calls[0]![0]).toContain('?sala=ABC234');
  expect(caixa.textContent).toContain('Link do convite copiado.');
  act(() => root.unmount());
});
