import { useEffect, useMemo } from 'react';
import { Menu, X } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useUIStore } from '@/stores/uiStore';

export function AppLayout() {
  const location = useLocation();
  const { isMobile, sidebarOpen, setSidebarOpen, setIsMobile } = useUIStore();

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(false);
      }
    };

    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setIsMobile, setSidebarOpen]);

  const pageTitle = useMemo(() => {
    switch (location.pathname) {
      case '/':
        return 'Dashboard';
      case '/chat':
        return 'Chat';
      case '/campaigns':
        return 'Campanhas';
      case '/contacts':
        return 'Contatos';
      case '/agent':
        return 'Agente IA';
      case '/settings':
        return 'Configuracoes';
      default:
        return 'ZapFlow';
    }
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] bg-surface-900 mesh-bg overflow-hidden relative">
      {/* Decorative Blur Orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-neon-green/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-neon-purple/5 blur-[120px] pointer-events-none" />

      {/* Sidebar Layout */}
      <Sidebar />

      {isMobile && sidebarOpen && (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-20 bg-surface-900/70 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 h-[100dvh] overflow-hidden bg-surface-900/50 backdrop-blur-3xl z-0 relative">
        <div className="absolute left-0 inset-y-0 w-[1px] bg-gradient-to-b from-white/[0.08] to-transparent" />
        {isMobile && (
          <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/[0.04] bg-surface-900/85 px-4 backdrop-blur-xl md:hidden">
            <div className="flex items-center gap-3 min-w-0">
              <button
                aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-800 text-text-200 transition-colors hover:bg-surface-700"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{pageTitle}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-text-400">ZapFlow</p>
              </div>
            </div>
          </header>
        )}
        <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
