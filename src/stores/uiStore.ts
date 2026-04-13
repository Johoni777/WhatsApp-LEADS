import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  isMobile: boolean;
  activeModal: string | null;
  modalData: Record<string, unknown> | null;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setIsMobile: (mobile: boolean) => void;
  openModal: (modal: string, data?: Record<string, unknown>) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  sidebarCollapsed: false,
  isMobile: window.innerWidth < 768,
  activeModal: null,
  modalData: null,

  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setIsMobile: (isMobile) => set({ isMobile }),
  openModal: (activeModal, modalData = null as any) => set({ activeModal, modalData }),
  closeModal: () => set({ activeModal: null, modalData: null }),
}));
