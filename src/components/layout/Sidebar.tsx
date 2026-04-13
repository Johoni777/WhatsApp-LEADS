import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, MessageCircle, Megaphone, 
  Users, Bot, Settings, LogOut, X
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import { Avatar } from '@/components/ui/Avatar';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Chat', href: '/chat', icon: MessageCircle, badgeKey: 'unread' as const },
  { name: 'Campanhas', href: '/campaigns', icon: Megaphone },
  { name: 'Contatos', href: '/contacts', icon: Users },
  { name: 'Agente IA', href: '/agent', icon: Bot },
];

export function Sidebar() {
  const location = useLocation();
  const { user, workspace, logout } = useAuthStore();
  const conversations = useChatStore((s) => s.conversations);
  const { isMobile, sidebarOpen, setSidebarOpen } = useUIStore();
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const handleNavigate = (href: string) => {
    if (isMobile) {
      setSidebarOpen(false);
    }
    window.dispatchEvent(new CustomEvent('app-navigate', { detail: { href } }));
  };

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-30 flex h-screen w-[280px] shrink-0 flex-col border-r border-white/[0.04]
        bg-surface-800/85 backdrop-blur-3xl pt-4 pb-4 transition-transform duration-300 ease-out
        ${isMobile ? (sidebarOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
        md:static md:z-10 md:bg-surface-800/30
      `}
    >
      
      {/* Decorative top glow */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Brand */}
      <div className="px-4 md:px-6 mb-6 md:mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)] shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#0A0A0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-display tracking-tight text-white leading-none truncate">ZapFlow</h1>
            <p className="text-[10px] text-text-400 font-medium uppercase tracking-widest mt-1">Platform</p>
          </div>
        </div>
        {isMobile && (
          <button
            aria-label="Fechar menu"
            onClick={() => setSidebarOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-800 text-text-300 transition-colors hover:bg-surface-700 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 md:px-4 space-y-1 overflow-y-auto">
        <div className="text-[10px] uppercase font-bold text-text-400 tracking-wider mb-2 ml-2 mt-4">Menu</div>
        
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          
          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={() => handleNavigate(item.href)}
              className={`
                group flex items-center justify-between px-3 h-10 rounded-xl text-sm font-medium transition-all duration-200
                ${isActive 
                  ? 'bg-white/10 text-white' 
                  : 'text-text-300 hover:bg-white/[0.04] hover:text-text-100'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-[18px] h-[18px] transition-colors ${isActive ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'text-text-400 group-hover:text-text-200'}`} />
                {item.name}
              </div>
              
              {item.badgeKey === 'unread' && totalUnread > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-white text-surface-900' : 'bg-surface-700 text-text-300'}`}>
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </Link>
          );
        })}

        <div className="text-[10px] uppercase font-bold text-text-400 tracking-wider mb-2 ml-2 mt-8">Organization</div>
        
        <Link
          to="/settings"
          onClick={() => handleNavigate('/settings')}
          className={`
            group flex items-center justify-between px-3 h-10 rounded-xl text-sm font-medium transition-all duration-200
            ${location.pathname === '/settings'
              ? 'bg-white/10 text-white' 
              : 'text-text-300 hover:bg-white/[0.04] hover:text-text-100'
            }
          `}
        >
          <div className="flex items-center gap-3">
            <Settings className="w-[18px] h-[18px] text-text-400 group-hover:text-text-200" />
            Configurações
          </div>
        </Link>

      </nav>

      {/* User Profile Card */}
      <div className="px-3 md:px-4 mt-auto pt-4">
        <div className="p-3 rounded-2xl glass-card flex items-center gap-3 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-neon-green/0 via-neon-green/5 to-neon-purple/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <Avatar name={user?.user_metadata?.name || 'User'} size="sm" />
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {workspace?.name || 'Workspace'}
            </p>
            <p className="text-[10px] text-text-400 truncate">
              {user?.email || 'admin@zapflow.app'}
            </p>
          </div>
          
          <button 
            onClick={() => {
              if (isMobile) setSidebarOpen(false);
              logout();
            }}
            className="p-1.5 rounded-lg text-text-400 hover:text-white hover:bg-white/10 transition-colors z-10"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
