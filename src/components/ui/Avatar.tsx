import { getInitials, stringToColor } from '@/utils/formatters';

interface AvatarProps {
  name: string | null | undefined;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  className?: string;
}

const sizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

export function Avatar({ name, src, size = 'md', online, className = '' }: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = stringToColor(name || 'unknown');

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          className={`${sizes[size]} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold text-white`}
          style={{ backgroundColor: bgColor }}
        >
          {initials}
        </div>
      )}
      {online !== undefined && (
        <span className={`
          absolute bottom-0 right-0 block rounded-full ring-2 ring-dark-800
          ${online ? 'bg-accent-green' : 'bg-dark-400'}
          ${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}
        `}>
          {online && (
            <span className="absolute inset-0 rounded-full bg-accent-green animate-ping opacity-30" />
          )}
        </span>
      )}
    </div>
  );
}
