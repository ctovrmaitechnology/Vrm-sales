import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AuroraBackground from './AuroraBackground';

const Layout = () => {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('vrm_sidebar_collapsed') === '1'; } catch { return false; }
  });

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('vrm_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div className={`layout-container${collapsed ? ' sidebar-collapsed' : ''}`}>
      <AuroraBackground />
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <main className="main-content">
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;