import { InputHTMLAttributes, ReactNode, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-semibold text-text-300 mb-1.5 ml-1 select-none">
            {label}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-400 group-focus-within:text-neon-green transition-colors pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              glass-input w-full h-11 px-4 
              ${icon ? 'pl-10' : ''}
              ${error ? '!border-red-500/50 focus:!ring-red-500/20' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1.5 ml-1 text-xs text-red-400 font-medium animate-fade-in">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
