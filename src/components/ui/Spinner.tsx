import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export function Spinner({ size = 'md', className = '', label }: SpinnerProps) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <Loader2 className={`${sizes[size]} animate-spin text-accent-green`} />
      {label && <p className="text-sm text-dark-300">{label}</p>}
    </div>
  );
}

export function FullPageSpinner({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-dark-900">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-dark-600 border-t-accent-green animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full gradient-primary opacity-20 animate-pulse-soft" />
          </div>
        </div>
        <p className="text-dark-300 text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}
