import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/Layout';

import Login from './pages/login';
import Home from './pages/Home';
import LinkedIn from './pages/LinkedIn';
import WhatsApp from './pages/WhatsApp';
import Leads from './pages/Leads';
import Facebook from './pages/Facebook';

import Dashboard from './old-email-components/Dashboard';
import UploadLeads from './old-email-components/UploadLeads';
import { AppProvider } from './components/AppContext';

const ProtectedRoute = ({ children }) => {
  const admin = localStorage.getItem('vrm_admin');
  if (!admin) {
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  return (
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
          </Route>

          {/* EMAIL DASHBOARD */}
          <Route path="/email" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="upload" element={<UploadLeads />} />
          </Route>

        </Routes>

      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
