import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import type { Contact } from '@/types/database';
import { useAuthStore } from './authStore';

interface ContactState {
  contacts: Contact[];
  selectedContacts: Set<string>;
  isLoading: boolean;
  searchQuery: string;
  filterTag: string | null;
  totalCount: number;

  fetchContacts: () => Promise<void>;
  createContact: (data: Partial<Contact>) => Promise<{ error: string | null }>;
  deleteContacts: (ids: string[]) => Promise<{ error: string | null }>;
  toggleSelectContact: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSearchQuery: (query: string) => void;
  setFilterTag: (tag: string | null) => void;
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  selectedContacts: new Set(),
  isLoading: false,
  searchQuery: '',
  filterTag: null,
  totalCount: 0,

  fetchContacts: async () => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return;

    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        set({ contacts: data as Contact[], totalCount: data.length });
      } else {
        console.error('Error fetching contacts:', error);
      }
    } finally {
      set({ isLoading: false });
    }
  },

  createContact: async (contactData) => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return { error: 'Sem workspace' };

    try {
      const { error } = await supabase
        .from('contacts')
        .insert({ ...contactData, workspace_id: workspaceId });
      
      if (error) throw error;
      
      await get().fetchContacts();
      return { error: null };
    } catch (err: any) {
      console.error('Insert error:', err);
      return { error: err.message };
    }
  },

  deleteContacts: async (ids) => {
    try {
      const { error } = await supabase.from('contacts').delete().in('id', ids);
      if (error) throw error;
      
      set(state => ({
        contacts: state.contacts.filter(c => !ids.includes(c.id)),
        selectedContacts: new Set()
      }));
      return { error: null };
    } catch (err: any) {
      return { error: err.message };
    }
  },

  toggleSelectContact: (id) => {
    const selected = new Set(get().selectedContacts);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    set({ selectedContacts: selected });
  },

  selectAll: () => {
    set({ selectedContacts: new Set(get().contacts.map(c => c.id)) });
  },

  clearSelection: () => set({ selectedContacts: new Set() }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setFilterTag: (filterTag) => set({ filterTag }),
}));
