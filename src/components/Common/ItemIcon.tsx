import React, { useState } from 'react';
import { getItemIcon } from '../../utils/iconHelper';

export interface ItemIconProps {
  name: string;
  icon?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showBorder?: boolean;
  className?: string;
  alt?: string;
  title?: string;
}

const SIZE_MAP = {
  xs: 'w-5 h-5 min-w-[20px] rounded-md p-0.5',
  sm: 'w-6 h-6 min-w-[24px] rounded-lg p-0.5',
  md: 'w-8 h-8 min-w-[32px] rounded-xl p-1',
  lg: 'w-10 h-10 min-w-[40px] rounded-xl p-1.5',
  xl: 'w-12 h-12 min-w-[48px] rounded-2xl p-1.5'
};

export const ItemIcon: React.FC<ItemIconProps> = ({
  name,
  icon,
  size = 'sm',
  showBorder = true,
  className = '',
  alt,
  title
}) => {
  const [hasError, setHasError] = useState(false);
  const iconUrl = getItemIcon(name, icon);

  if (!iconUrl || hasError) {
    return null;
  }

  const sizeClass = SIZE_MAP[size] || SIZE_MAP.sm;
  const borderClass = showBorder
    ? 'bg-[#0b1419]/90 border border-[#223945] shadow-sm'
    : '';

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden select-none ${sizeClass} ${borderClass} ${className}`}
      title={title || name}
    >
      <img
        src={iconUrl}
        alt={alt || name}
        onError={() => setHasError(true)}
        className="w-full h-full object-contain pixelated pointer-events-none drop-shadow-sm"
        style={{ imageRendering: 'pixelated' }}
        loading="lazy"
      />
    </span>
  );
};
