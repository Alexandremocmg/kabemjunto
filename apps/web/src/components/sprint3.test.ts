import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WifiStatus } from './WifiStatus.js';
import { AvatarComStatus } from './AvatarComStatus.js';
import { Reconectando } from './Reconectando.js';

describe('Sprint 3 Assets & Components (B11, B13, B14)', () => {
  describe('[B14] WifiStatus', () => {
    it('renderiza variante online com cor verde #22C55E', () => {
      const html = renderToStaticMarkup(React.createElement(WifiStatus, { status: 'online' }));
      expect(html).toContain('stroke="#22C55E"');
      expect(html).toContain('Online');
    });

    it('renderiza variante offline com cor cinza #6B7280', () => {
      const html = renderToStaticMarkup(React.createElement(WifiStatus, { status: 'offline' }));
      expect(html).toContain('stroke="#6B7280"');
      expect(html).toContain('Offline');
    });
  });

  describe('[B11] AvatarComStatus', () => {
    it('renderiza avatar com anel verde quando conectado=true', () => {
      const html = renderToStaticMarkup(
        React.createElement(AvatarComStatus, {
          avatarId: 'avatar-01',
          conectado: true,
          nome: 'TestPlayer',
        }),
      );
      expect(html).toContain('conectado');
      expect(html).toContain('#22C55E');
      expect(html).toContain('avatar-01.svg');
    });

    it('renderiza avatar com anel cinza quando status="desconectado"', () => {
      const html = renderToStaticMarkup(
        React.createElement(AvatarComStatus, {
          avatarId: 'avatar-02',
          status: 'desconectado',
          nome: 'DisconnectedPlayer',
        }),
      );
      expect(html).toContain('desconectado');
      expect(html).toContain('#6B7280');
      expect(html).toContain('grayscale');
    });
  });

  describe('[B13] Reconectando', () => {
    it('renderiza modal de reconexão com spinner e texto padrão', () => {
      const html = renderToStaticMarkup(React.createElement(Reconectando));
      expect(html).toContain('Reconectando...');
      expect(html).toContain('#F39C12'); // Laranja ADR-002
    });

    it('exibe o número de tentativas quando fornecido', () => {
      const html = renderToStaticMarkup(
        React.createElement(Reconectando, { tentativa: 2, maxTentativas: 3 }),
      );
      expect(html).toContain('Tentativa 2/3...');
    });
  });
});
