import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import type { Campaign } from '@/types/database';
import { useAuthStore } from './authStore';

interface CampaignState {
  campaigns: Campaign[];
  isLoading: boolean;

  fetchCampaigns: () => Promise<void>;
  createCampaign: (data: Partial<Campaign>) => Promise<{ error: string | null }>;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  isLoading: false,

  fetchCampaigns: async () => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return;

    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        set({ campaigns: data as Campaign[] });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  createCampaign: async (data) => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return { error: 'Sem workspace' };

    try {
      const { error } = await supabase
        .from('campaigns')
        .insert({ ...data, workspace_id: workspaceId });
        
      if (error) throw error;
      await get().fetchCampaigns();
      return { error: null };
    } catch (err: any) {
      return { error: err.message };
    }
  }
}));
