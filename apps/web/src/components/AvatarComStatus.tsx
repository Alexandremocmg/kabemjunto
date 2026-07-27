import React from 'react';

export interface AvatarComStatusProps {
  avatarId?: string;
  avatarUrl?: string;
  conectado?: boolean;
  status?: 'conectado' | 'desconectado';
  size?: number;
  nome?: string;
  className?: string;
}

export const AvatarComStatus: React.FC<AvatarComStatusProps> = ({
  avatarId,
  avatarUrl,
  conectado,
  status,
  size = 48,
  nome = 'Jogador',
  className = '',
}) => {
  // Aceita prop booleana `conectado` ou prop string `status`
  const isConnected = status !== undefined ? status === 'conectado' : conectado !== false;
  const statusColor = isConnected ? '#22C55E' : '#6B7280';
  const statusLabel = isConnected ? 'Conectado' : 'Desconectado';

  // Se avatarId for ex: 'avatar-01' ou '01', resolve o caminho SVG
  const normalizedId = avatarId?.replace(/^avatar-?/, '');
  const svgPath =
    avatarUrl ??
    (normalizedId ? `/assets/svgs/avatars/avatar-${normalizedId.padStart(2, '0')}.svg` : undefined);

  return (
    <div
      className={`avatar-com-status ${isConnected ? 'conectado' : 'desconectado'} ${className}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        padding: '3px',
        border: `3px solid ${statusColor}`,
        boxShadow: isConnected
          ? `0 0 10px rgba(34, 197, 94, 0.4)`
          : `0 0 6px rgba(107, 114, 128, 0.2)`,
        transition: 'all 0.3s ease',
        background: 'rgba(15, 23, 42, 0.8)',
      }}
      title={`${nome} (${statusLabel})`}
      role="img"
      aria-label={`Avatar de ${nome}, ${statusLabel}`}
    >
      {svgPath ? (
        <img
          src={svgPath}
          alt={nome}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
            filter: isConnected ? 'none' : 'grayscale(70%) opacity(0.85)',
          }}
          onError={(e) => {
            // Fallback pra emoji se SVG não carregar
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      ) : (
        <span style={{ fontSize: `${size * 0.5}px`, userSelect: 'none' }}>👤</span>
      )}

      {/* Anel / Ponto de Status */}
      <span
        style={{
          position: 'absolute',
          bottom: '-2px',
          right: '-2px',
          width: `${Math.max(12, size * 0.28)}px`,
          height: `${Math.max(12, size * 0.28)}px`,
          borderRadius: '50%',
          backgroundColor: statusColor,
          border: '2px solid #0F172A',
          boxShadow: isConnected ? '0 0 8px #22C55E' : 'none',
        }}
        aria-hidden="true"
      />
    </div>
  );
};

export default AvatarComStatus;
