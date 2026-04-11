import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ChatPage } from '@/pages/ChatPage';
import { CampaignsPage } from '@/pages/CampaignsPage';
import { ContactsPage } from '@/pages/ContactsPage';
import { AgentPage } from '@/pages/AgentPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { useAuthStore } from '@/stores/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      retry: 2,
    },
  },
});

// For demo purposes, bypass auth
const DEMO_MODE = false;

function DemoProtectedRoute({ children }: { children: React.ReactNode }) {
  if (DEMO_MODE) return <>{children}</>;
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { initialize } = useAuthStore();

  useEffect(() => {
    if (!DEMO_MODE) {
      initialize();
    }
  }, [initialize]);

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppInitializer>
          <Routes>
            {/* Auth routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected routes */}
            <Route
              element={
                <DemoProtectedRoute>
                  <AppLayout />
                </DemoProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/agent" element={<AgentPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppInitializer>
      </BrowserRouter>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1F2C34',
            color: '#E9EDEF',
            border: '1px solid rgba(134, 150, 160, 0.1)',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#00A884', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#EA4335', secondary: '#fff' },
          },
        }}
      />
    </QueryClientProvider>
  );
}

export default App;
