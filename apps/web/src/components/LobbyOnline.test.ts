import { expect, describe, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LobbyOnline } from './LobbyOnline';

describe('LobbyOnline', () => {
  it('associa a mensagem de erro aos campos do formulario', () => {
    const html = renderToStaticMarkup(
      createElement(LobbyOnline, { erro: 'Nao foi possivel entrar na sala.', onEntrar: () => {} }),
    );

    expect(html).toContain('autoComplete="nickname"');
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('novalidate');
  });
});
