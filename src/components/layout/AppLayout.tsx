import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-screen bg-surface-900 mesh-bg overflow-hidden relative">
      {/* Decorative Blur Orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-neon-green/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-neon-purple/5 blur-[120px] pointer-events-none" />

      {/* Sidebar Layout */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-surface-900/50 backdrop-blur-3xl z-0 relative">
        <div className="absolute left-0 inset-y-0 w-[1px] bg-gradient-to-b from-white/[0.08] to-transparent" />
        <Outlet />
      </main>
    </div>
  );
}
