// ===== CONSTANTS =====

export const APP_NAME = 'ZapFlow';
export const APP_DESCRIPTION = 'WhatsApp Business SaaS';

// WhatsApp API
export const WHATSAPP_API_VERSION = 'v22.0';
export const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

// Rate limits
export const MAX_MESSAGES_PER_SECOND = 80;
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_BASE_MS = 1000;

// Google Sheets
export const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
export const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4';

// Gemini
export const GEMINI_MODEL_DEFAULT = 'gemini-2.0-flash';

// UI
export const MESSAGES_PER_PAGE = 50;
export const CONVERSATIONS_PER_PAGE = 30;
export const CONTACTS_PER_PAGE = 50;

// Message status icons mapping
export const MESSAGE_STATUS_MAP = {
  pending: { icon: 'clock', label: 'Pendente', class: 'status-sent' },
  sent: { icon: 'check', label: 'Enviado', class: 'status-sent' },
  delivered: { icon: 'check-check', label: 'Entregue', class: 'status-delivered' },
  read: { icon: 'check-check', label: 'Lido', class: 'status-read' },
  failed: { icon: 'x', label: 'Erro', class: 'status-error' },
} as const;

// Campaign statuses
export const CAMPAIGN_STATUS_MAP = {
  draft: { label: 'Rascunho', color: 'bg-dark-400', textColor: 'text-dark-200' },
  scheduled: { label: 'Agendado', color: 'bg-accent-blue/20', textColor: 'text-accent-blue' },
  running: { label: 'Enviando', color: 'bg-accent-green/20', textColor: 'text-accent-green' },
  paused: { label: 'Pausado', color: 'bg-accent-orange/20', textColor: 'text-accent-orange' },
  completed: { label: 'Concluído', color: 'bg-whatsapp-primary/20', textColor: 'text-whatsapp-primary' },
  failed: { label: 'Falhou', color: 'bg-accent-red/20', textColor: 'text-accent-red' },
} as const;

// Navigation items
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', path: '/' },
  { id: 'chat', label: 'Atendimento', icon: 'MessageCircle', path: '/chat' },
  { id: 'campaigns', label: 'Campanhas', icon: 'Megaphone', path: '/campaigns' },
  { id: 'contacts', label: 'Contatos', icon: 'Users', path: '/contacts' },
  { id: 'agent', label: 'Agente IA', icon: 'Bot', path: '/agent' },
  { id: 'settings', label: 'Configurações', icon: 'Settings', path: '/settings' },
] as const;
