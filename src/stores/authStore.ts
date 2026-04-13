import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import type { Workspace } from '@/types/database';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  register: (email: string, password: string, workspaceName: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  setWorkspace: (workspace: Workspace) => void;
  loadWorkspaces: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  workspace: null,
  workspaces: [],
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        set({ user: session.user, session });
        await get().loadWorkspaces();
      }
    } catch (err) {
      console.error('Auth init error:', err);
    } finally {
      set({ isInitialized: true });

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        set({ user: session?.user ?? null, session });
        if (session?.user) {
          await get().loadWorkspaces();
        } else {
          set({ workspace: null, workspaces: [] });
        }
      });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return { error: null };
    } catch {
      return { error: 'Erro ao fazer login' };
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email, password, workspaceName) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { workspace_name: workspaceName },
        },
      });
      if (error) return { error: error.message };
      if (!data.user) return { error: 'Erro ao criar conta' };

      return { error: null };
    } catch {
      return { error: 'Erro ao registrar' };
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, workspace: null, workspaces: [] });
  },

  setWorkspace: (workspace) => {
    set({ workspace });
    localStorage.setItem('active_workspace', workspace.id);
  },

  loadWorkspaces: async () => {
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id, workspaces(*)')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '');

    if (data) {
      const workspaces = data
        .map((m: Record<string, unknown>) => m.workspaces as Workspace)
        .filter(Boolean);
      
      const savedId = localStorage.getItem('active_workspace');
      const active = workspaces.find(w => w.id === savedId) || workspaces[0];
      
      set({ workspaces, workspace: active || null });
    }
  },
}));
