import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import { useAuthStore } from './authStore';

export interface WhatsAppTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: TemplateComponent[];
}

export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
  example?: { body_text?: string[][] };
}

export interface BulkChunkResult {
  sent: number;
  failed: number;
  next_offset: number;
  has_more: boolean;
  error?: string;
  errors?: Record<string, string>;
}

interface TemplateState {
  templates: WhatsAppTemplate[];
  isLoading: boolean;
  isSending: boolean;
  bulkProgress: { sent: number; failed: number; total: number } | null;

  fetchTemplates: () => Promise<void>;
  sendTemplate: (templateName: string, language: string, to: string, components?: unknown[]) => Promise<{ success: boolean; error?: string }>;
  sendBulkTemplate: (templateName: string, language: string, contacts: string[], components?: unknown[]) => Promise<{ sent: number; failed: number }>;
  sendBulkTemplateChunk: (
    templateName: string,
    language: string,
    contacts: string[],
    offset: number,
    limit: number,
    components?: unknown[]
  ) => Promise<BulkChunkResult>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  isLoading: false,
  isSending: false,
  bulkProgress: null,

  fetchTemplates: async () => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return;

    set({ isLoading: true });
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-templates', {
        body: { action: 'list', workspace_id: workspaceId }
      });

      if (error) {
        console.error('Failed to fetch templates:', error);
        return;
      }

      if (data?.templates) {
        set({ templates: data.templates });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  sendTemplate: async (templateName, language, to, components) => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return { success: false, error: 'No workspace' };

    set({ isSending: true });
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-templates', {
        body: {
          action: 'send',
          workspace_id: workspaceId,
          template_name: templateName,
          template_language: language,
          to,
          template_components: components,
        }
      });

      if (error) return { success: false, error: error.message };
      if (data?.error) return { success: false, error: data.error };
      return { success: true };
    } finally {
      set({ isSending: false });
    }
  },

  sendBulkTemplate: async (templateName, language, contacts, components) => {
    set({ isSending: true, bulkProgress: { sent: 0, failed: 0, total: contacts.length } });
    try {
      const r = await get().sendBulkTemplateChunk(
        templateName,
        language,
        contacts,
        0,
        contacts.length,
        components
      );
      set({ bulkProgress: { sent: r.sent, failed: r.failed, total: contacts.length } });
      return { sent: r.sent, failed: r.failed };
    } finally {
      set({ isSending: false });
    }
  },

  sendBulkTemplateChunk: async (templateName, language, contacts, offset, limit, components) => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) {
      return {
        sent: 0,
        failed: 0,
        next_offset: offset,
        has_more: false,
        error: 'No workspace',
      };
    }

    const { data, error } = await supabase.functions.invoke('whatsapp-templates', {
      body: {
        action: 'send_bulk',
        workspace_id: workspaceId,
        template_name: templateName,
        template_language: language,
        contacts,
        offset,
        limit,
        template_components: components,
      }
    });

    if (error) {
      return {
        sent: 0,
        failed: 0,
        next_offset: offset,
        has_more: offset < contacts.length,
        error: error.message,
      };
    }

    const sent = data?.sent ?? 0;
    const failed = data?.failed ?? 0;
    const next_offset = data?.next_offset ?? offset;
    const has_more = Boolean(data?.has_more);
    const errors = data?.errors;

    return { sent, failed, next_offset, has_more, errors };
  },
}));
