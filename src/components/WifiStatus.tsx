import React from 'react';

export interface WifiStatusProps {
  status: 'online' | 'offline';
  size?: number;
  className?: string;
}

export const WifiStatus: React.FC<WifiStatusProps> = ({ status, size = 24, className = '' }) => {
  const isOnline = status === 'online';
  const color = isOnline ? '#22C55E' : '#6B7280';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`wifi-status-icon wifi-status-${status} ${className}`}
      aria-label={`Status da conexão: ${isOnline ? 'Online' : 'Offline'}`}
      role="img"
    >
      {isOnline ? (
        <>
          <path d="M12 20h.01" />
          <path d="M8.5 16.429a5 5 0 0 1 7 0" />
          <path d="M5 12.857a10 10 0 0 1 14 0" />
          <path d="M1.5 9.286a15 15 0 0 1 21 0" />
        </>
      ) : (
        <>
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.857" />
          <path d="M5 12.857a10 10 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A15 15 0 0 1 22.5 9.286" />
          <path d="M1.5 9.286a15 15 0 0 1 5.43-3.15" />
          <path d="M8.5 16.429a5 5 0 0 1 3.5-1.429" />
          <path d="M12 20h.01" />
        </>
      )}
    </svg>
  );
};

export default WifiStatus;
