import { useCallback, useState } from 'react';
import {
  MessageCircle, Users, Send, CheckCheck,
  Eye, ArrowUpRight, Megaphone, Activity, Bot
} from 'lucide-react';
import { formatNumber } from '@/utils/formatters';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Link } from 'react-router-dom';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';

export function DashboardPage() {
  const { workspace } = useAuthStore();
  const [stats, setStats] = useState({
    sent: 0,
    delivered: 0,
    read: 0,
    contacts: 0
  });

  const loadStats = useCallback(async () => {
    if (!workspace) return;

    const { count: contactsCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id);

    const { data: messages } = await supabase
      .from('messages')
      .select('status')
      .eq('workspace_id', workspace.id)
      .eq('direction', 'outbound');

    let sent = 0, delivered = 0, read = 0;
    if (messages) {
      messages.forEach(m => {
        if (m.status === 'sent' || m.status === 'delivered' || m.status === 'read') sent++;
        if (m.status === 'delivered' || m.status === 'read') delivered++;
        if (m.status === 'read') read++;
      });
    }

    setStats({
      sent: sent || 0,
      delivered: delivered || 0,
      read: read || 0,
      contacts: contactsCount || 0
    });
  }, [workspace]);

  useRefreshOnFocus(loadStats, '/');

  const statCards = [
    { label: 'Mensagens Enviadas', value: stats.sent, change: 12.5, icon: Send, color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/20' },
    { label: 'Entregues', value: stats.delivered, change: 8.2, icon: CheckCheck, color: 'text-neon-teal', bg: 'bg-neon-teal/10', border: 'border-neon-teal/20' },
    { label: 'Lidas', value: stats.read, change: -2.1, icon: Eye, color: 'text-neon-purple', bg: 'bg-neon-purple/10', border: 'border-neon-purple/20' },
    { label: 'Contatos Base', value: stats.contacts, change: 15.7, icon: Users, color: 'text-neon-blue', bg: 'bg-neon-blue/10', border: 'border-neon-blue/20' },
  ];

  return (
    <div className="page-shell page-stack animate-fade-in relative">
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-neon-green/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between relative z-10">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle">Visão geral do workspace: {workspace?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 relative z-10">
        {statCards.map((stat, i) => (
          <div key={stat.label} className="glass-panel p-6 relative overflow-hidden group">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.03] to-transparent group-hover:translate-x-full duration-1000 transition-transform" />
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${stat.bg} ${stat.border} ${stat.color} shadow-inner`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-display font-bold text-white tracking-tight">{formatNumber(stat.value)}</p>
              <p className="text-sm text-text-400 mt-1 font-medium">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6 relative z-10">
        <div className="lg:col-span-2 glass-panel p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-surface-700 text-text-200"><Activity className="w-5 h-5" /></div>
            <h2 className="text-lg font-display font-bold text-white">Atividade</h2>
          </div>
          <div className="h-[200px] flex items-center justify-center text-text-400 text-sm">
             Gráfico de engajamento será gerado após tráfego de mensagens na API Meta.
          </div>
        </div>

        <div className="glass-panel p-6 flex flex-col h-full">
          <h2 className="text-lg font-display font-bold text-white mb-6">Ações Rápidas</h2>
          <div className="space-y-3 flex-1 flex flex-col justify-center">
            <Link to="/campaigns" className="group relative w-full flex items-center gap-4 p-4 rounded-xl bg-surface-800/50 hover:bg-surface-700 border border-white/[0.04] transition-all overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-neon-green/10 text-neon-green flex items-center justify-center shrink-0 border border-neon-green/20"><Megaphone className="w-5 h-5" /></div>
              <div><p className="text-sm font-semibold text-white">Lançar Campanha</p><p className="text-xs text-text-400 mt-0.5">Disparo em massa</p></div>
            </Link>
            <Link to="/contacts" className="group relative w-full flex items-center gap-4 p-4 rounded-xl bg-surface-800/50 hover:bg-surface-700 border border-white/[0.04] transition-all overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-neon-blue/10 text-neon-blue flex items-center justify-center shrink-0 border border-neon-blue/20"><Users className="w-5 h-5" /></div>
              <div><p className="text-sm font-semibold text-white">Nova Lista</p><p className="text-xs text-text-400 mt-0.5">Gerenciar leads</p></div>
            </Link>
            <Link to="/agent" className="group relative w-full flex items-center gap-4 p-4 rounded-xl bg-surface-800/50 hover:bg-surface-700 border border-white/[0.04] transition-all overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-neon-purple/10 text-neon-purple flex items-center justify-center shrink-0 border border-neon-purple/20"><Bot className="w-5 h-5" /></div>
              <div><p className="text-sm font-semibold text-white">Agente IA</p><p className="text-xs text-text-400 mt-0.5">Respostas automatizadas</p></div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
