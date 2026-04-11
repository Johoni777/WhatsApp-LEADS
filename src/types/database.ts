// ===== DATABASE TYPES =====

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
}

export interface WhatsAppAccount {
  id: string;
  workspace_id: string;
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  display_name: string | null;
  status: 'active' | 'inactive' | 'error';
  created_at: string;
}

export interface Contact {
  id: string;
  workspace_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  tags: string[];
  custom_fields: Record<string, string>;
  source: 'manual' | 'google_sheets' | 'csv' | 'api';
  created_at: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  contact_id: string;
  whatsapp_account_id: string | null;
  status: 'active' | 'archived' | 'blocked';
  last_message_at: string | null;
  unread_count: number;
  assigned_to: string | null;
  is_ai_active: boolean;
  created_at: string;
  // Joined
  contact?: Contact;
  last_message?: Message;
}

export interface Message {
  id: string;
  conversation_id: string;
  workspace_id: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'template' | 'sticker' | 'location';
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  wamid: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error_details: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  template_name: string;
  template_language: string;
  template_components: TemplateComponent[];
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed';
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CampaignLog {
  id: string;
  campaign_id: string;
  contact_id: string;
  workspace_id: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  wamid: string | null;
  error_details: Record<string, unknown> | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  // Joined
  contact?: Contact;
}

export interface AgentSettings {
  id: string;
  workspace_id: string;
  system_prompt: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  fallback_message: string;
  created_at: string;
}

export interface MediaFile {
  id: string;
  workspace_id: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  public_url: string | null;
  created_at: string;
}

// ===== TEMPLATE TYPES =====

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url' | 'phone_number';
  index?: string;
  parameters: TemplateParameter[];
}

export interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'video' | 'document' | 'payload';
  text?: string;
  payload?: string;
  image?: { link: string };
  video?: { link: string };
  document?: { link: string; filename?: string };
}

// ===== API RESPONSE TYPES =====

export interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}
