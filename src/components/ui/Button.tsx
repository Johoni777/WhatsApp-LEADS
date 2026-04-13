import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading,
  loading,
  icon,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const isCurrentlyLoading = isLoading || loading;
  const baseStyles = 'relative inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-900';
  
  const variants = {
    primary: 'btn-primary focus:ring-white',
    secondary: 'btn-secondary focus:ring-surface-600',
    ghost: 'text-text-300 hover:text-white hover:bg-white/[0.04] rounded-xl focus:ring-surface-700',
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl border border-red-500/20 focus:ring-red-500',
  };

  const sizes = {
    sm: 'h-9 px-3 text-xs',
    md: 'h-10 md:h-11 px-4 md:px-5 text-sm',
    lg: 'h-11 md:h-13 px-5 md:px-8 text-sm md:text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isCurrentlyLoading || disabled}
      {...props}
    >
      {isCurrentlyLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      <span className="truncate">{children}</span>
      
      {/* Glow effect for primary button */}
      {variant === 'primary' && !disabled && !isCurrentlyLoading && (
        <div className="absolute inset-0 -z-10 rounded-xl blur-lg bg-white/20 opacity-0 hover:opacity-100 transition-opacity duration-500" />
      )}
    </button>
  );
}
