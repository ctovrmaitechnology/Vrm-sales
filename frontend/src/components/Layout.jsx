import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AuroraBackground from './AuroraBackground';

const Layout = () => {
  return (
    <div className="layout-container">
      <AuroraBackground />
      <Sidebar />
      <main className="main-content">
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
