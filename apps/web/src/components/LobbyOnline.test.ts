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

  it('mostra logo, leque de cartas decorativo e os dois caminhos', () => {
    const html = renderToStaticMarkup(
      createElement(LobbyOnline, { onEntrar: () => {}, onJogarContraBots: () => {} }),
    );

    expect(html).toContain('alt="Kabemjunto"');
    // O leque é só enfeite: escondido de leitores de tela e com alt vazio.
    expect(html).toContain('class="menu-leque" aria-hidden="true"');
    expect(html.match(/menu-leque-carta/g)).toHaveLength(5);

    const bots = html.indexOf('Jogar contra bots');
    const amigos = html.indexOf('Jogar com amigos');
    expect(bots).toBeGreaterThan(-1);
    expect(amigos).toBeGreaterThan(bots);
    expect(html).toContain('Jogar agora');
    expect(html).toContain('Criar sala');
    expect(html).toContain('aria-label="Entrar em sala"');
  });

  it('oferece de 2 a 6 jogadores e deixa 7 a 10 atrás de um botão', () => {
    const html = renderToStaticMarkup(
      createElement(LobbyOnline, { onEntrar: () => {}, onJogarContraBots: () => {} }),
    );

    for (const total of [2, 3, 4, 5, 6]) expect(html).toContain(`value="${total}"`);
    expect(html).not.toContain('value="7"');
    expect(html).toContain('aria-label="Mais jogadores, de 7 a 10"');
    // 4 jogadores vem marcado por padrão.
    expect(html).toMatch(/value="4"[^>]*checked|checked[^>]*value="4"/);
  });

  it('sem a opção de bots, o menu mostra só o caminho online', () => {
    const html = renderToStaticMarkup(createElement(LobbyOnline, { onEntrar: () => {} }));

    expect(html).not.toContain('Jogar contra bots');
    expect(html).toContain('Jogar com amigos');
  });
});
