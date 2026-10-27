import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Layout from './components/Layout';

import Login from './pages/login';
import Home from './pages/Home';
import LinkedIn from './pages/LinkedIn';
import WhatsApp from './pages/WhatsApp';
import Leads from './pages/Leads';
import Facebook from './pages/Facebook';
import Company from './pages/Company';
import Users from './pages/Users';

import Dashboard from './old-email-components/Dashboard';
import UploadLeads from './old-email-components/UploadLeads';
import { AppProvider } from './components/AppContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute = ({ children }) => {
  const admin = localStorage.getItem('vrm_admin');
  if (!admin) {
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <BrowserRouter>

          <Routes>

            {/* LOGIN PAGE */}
            <Route path="/" element={<Login />} />

            {/* MAIN APP */}
            <Route path="/app" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Home />} />
              <Route path="linkedin" element={<LinkedIn />} />
              <Route path="whatsapp" element={<WhatsApp />} />
              <Route path="leads" element={<Leads />} />
              <Route path="facebook" element={<Facebook />} />
              <Route path="company" element={<Company />} />
              <Route path="users" element={<Users />} />
            </Route>

            {/* EMAIL DASHBOARD */}
            <Route path="/email" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="upload" element={<UploadLeads />} />
            </Route>

          </Routes>

        </BrowserRouter>
      </AppProvider>
    </QueryClientProvider>
  );
}

export default App;
