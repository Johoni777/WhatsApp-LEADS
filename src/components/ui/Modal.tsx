import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      document.body.style.overflow = 'hidden';
    } else {
      const t = setTimeout(() => setIsRendered(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(t);
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isRendered) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center p-0 sm:items-center sm:p-6">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-surface-900/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Modal Container */}
      <div 
        className={`
          relative w-full ${sizes[size]} max-h-[92vh] sm:max-h-[calc(100vh-48px)]
          glass-panel border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]
          transition-all duration-300 transform 
          rounded-t-3xl sm:rounded-2xl
          ${isOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'}
        `}
      >
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 md:p-6 border-b border-white/[0.04]">
          <h2 className="min-w-0 text-base md:text-lg font-display font-bold text-white truncate">{title}</h2>
          <button 
            onClick={onClose}
            className="p-2 text-text-400 hover:text-white bg-surface-800 hover:bg-surface-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 max-h-[calc(92vh-132px)] sm:max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 p-4 md:p-6 border-t border-white/[0.04] bg-surface-800/30 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
