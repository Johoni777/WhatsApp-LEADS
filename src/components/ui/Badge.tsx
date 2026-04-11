import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function Badge({ children, variant = 'default', size = 'md', dot = false }: BadgeProps) {
  const variants = {
    default: 'bg-surface-800 text-text-200 border-white/[0.06]',
    success: 'bg-neon-green/10 text-neon-green border-neon-green/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]',
    warning: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]',
    info: 'bg-neon-blue/10 text-neon-blue border-neon-blue/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]',
    purple: 'bg-neon-purple/10 text-neon-purple border-neon-purple/20 shadow-[0_0_10px_rgba(139,92,246,0.1)]',
  };

  const dotColors = {
    default: 'bg-text-400',
    success: 'bg-neon-green shadow-[0_0_8px_rgba(16,185,129,0.8)]',
    warning: 'bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.8)]',
    danger: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
    info: 'bg-neon-blue shadow-[0_0_8px_rgba(59,130,246,0.8)]',
    purple: 'bg-neon-purple shadow-[0_0_8px_rgba(139,92,246,0.8)]',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold rounded-md border backdrop-blur-sm ${variants[variant]} ${sizes[size]}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} ${variant === 'success' || variant === 'warning' ? 'animate-pulse' : ''}`} />
      )}
      {children}
    </span>
  );
}
