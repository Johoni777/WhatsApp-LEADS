import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import type { Contact, ContactGroup } from '@/types/database';
import { useAuthStore } from './authStore';

interface ContactState {
  contacts: Contact[];
  groups: ContactGroup[];
  selectedContacts: Set<string>;
  isLoading: boolean;
  searchQuery: string;
  filterTag: string | null;
  totalCount: number;

  fetchContacts: () => Promise<void>;
  fetchGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<{ error: string | null }>;
  updateGroup: (id: string, name: string) => Promise<{ error: string | null }>;
  deleteGroup: (id: string) => Promise<{ error: string | null }>;
  createContact: (data: Partial<Contact>) => Promise<{ error: string | null }>;
  updateContact: (
    id: string,
    data: Partial<Pick<Contact, 'name' | 'phone' | 'email' | 'tags'>>
  ) => Promise<{ error: string | null }>;
  deleteContacts: (ids: string[]) => Promise<{ error: string | null }>;
  toggleSelectContact: (id: string) => void;
  selectAll: () => void;
  selectAllFiltered: (ids: string[]) => void;
  clearSelection: () => void;
  bulkAddTag: (ids: string[], tag: string) => Promise<{ error: string | null }>;
  bulkSetAI: (contactIds: string[], active: boolean) => Promise<{ error: string | null }>;
  setSearchQuery: (query: string) => void;
  setFilterTag: (tag: string | null) => void;
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  groups: [],
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
      let allContacts: Contact[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .range(from, from + step - 1);

        if (error) {
          console.error('Error fetching contacts:', error);
          break;
        }

        if (data) {
          allContacts = [...allContacts, ...(data as Contact[])];
          if (data.length < step) {
            hasMore = false;
          } else {
            from += step;
          }
        } else {
          hasMore = false;
        }
      }

      set({ contacts: allContacts, totalCount: allContacts.length });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchGroups: async () => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from('contact_groups')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true });

    if (!error && data) {
      set({ groups: data as ContactGroup[] });
    } else {
      console.error('Error fetching contact groups:', error);
    }
  },

  createGroup: async (name) => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return { error: 'Sem workspace' };
    const clean = name.trim();
    if (!clean) return { error: 'Nome vazio' };

    try {
      const { error } = await supabase
        .from('contact_groups')
        .insert({ workspace_id: workspaceId, name: clean });
      if (error) throw error;
      await get().fetchGroups();
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Erro ao criar pasta' };
    }
  },

  updateGroup: async (id, name) => {
    const clean = name.trim();
    if (!clean) return { error: 'Nome vazio' };

    try {
      const { error } = await supabase
        .from('contact_groups')
        .update({ name: clean })
        .eq('id', id);
      if (error) throw error;
      await get().fetchGroups();
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Erro ao atualizar pasta' };
    }
  },

  deleteGroup: async (id) => {
    try {
      // Primeiro, atualizamos os contatos dessa pasta para null (sem pasta)
      await supabase
        .from('contacts')
        .update({ group_id: null })
        .eq('group_id', id);

      const { error } = await supabase
        .from('contact_groups')
        .delete()
        .eq('id', id);
      if (error) throw error;
      
      await get().fetchGroups();
      await get().fetchContacts(); // Atualizar contatos para refletir a mudança
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Erro ao deletar pasta' };
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

  updateContact: async (id, data) => {
    try {
      const { error } = await supabase.from('contacts').update(data).eq('id', id);
      if (error) throw error;
      await get().fetchContacts();
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Erro ao atualizar' };
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

  selectAllFiltered: (ids) => {
    set({ selectedContacts: new Set(ids) });
  },

  bulkAddTag: async (ids, tag) => {
    const t = tag.trim();
    if (!t) return { error: 'Tag vazia' };
    if (ids.length === 0) return { error: 'Nenhum contato' };

    try {
      for (const id of ids) {
        const c = get().contacts.find(x => x.id === id);
        if (!c) continue;
        const nextTags = [...new Set([...(c.tags || []), t])];
        const { error } = await supabase.from('contacts').update({ tags: nextTags }).eq('id', id);
        if (error) throw error;
      }
      await get().fetchContacts();
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Erro nas tags' };
    }
  },

  bulkSetAI: async (contactIds, active) => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return { error: 'Sem workspace' };
    if (contactIds.length === 0) return { error: 'Nenhum contato' };

    try {
      const { data: convs, error: qErr } = await supabase
        .from('conversations')
        .select('id, contact_id')
        .eq('workspace_id', workspaceId)
        .in('contact_id', contactIds);

      if (qErr) throw qErr;

      const withConv = new Set((convs || []).map((c) => c.contact_id));
      const missing = contactIds.filter((id) => !withConv.has(id));

      if (convs?.length) {
        const { error: uErr } = await supabase
          .from('conversations')
          .update({ is_ai_active: active })
          .in(
            'id',
            convs.map((c) => c.id)
          );
        if (uErr) throw uErr;
      }

      for (const contactId of missing) {
        const { error: iErr } = await supabase.from('conversations').insert({
          workspace_id: workspaceId,
          contact_id: contactId,
          is_ai_active: active,
          status: 'active',
        });
        if (iErr) throw iErr;
      }

      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Erro ao atualizar IA' };
    }
  },

  clearSelection: () => set({ selectedContacts: new Set() }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setFilterTag: (filterTag) => set({ filterTag }),
}));
