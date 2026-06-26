import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useApp } from './AppContext';

const Navbar = () => {
  const location = useLocation();
  const { theme, toggleTheme } = useApp();
  
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/app' || path === '/') return 'Dashboard Overview';
    if (path.includes('/linkedin')) return 'LinkedIn Automation';
    if (path.includes('/whatsapp')) return 'WhatsApp Campaigns';
    if (path.includes('/leads')) return 'Leads';
    if (path.includes('/email/upload')) return 'Upload Leads';
    if (path.includes('/email')) return 'Email Outreach';
    return 'Dashboard';
  };

  return (
    <header className="navbar">
      <div className="navbar-left">
        <h2 className="section-title" style={{ marginBottom: 0 }}>{getPageTitle()}</h2>
      </div>
      
      <div className="navbar-right">
        <button onClick={toggleTheme} className="nav-icon-btn" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        
        <div className="user-profile">
          <div className="user-info" style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
            <span className="user-name">Admin</span>
          </div>
          <div className="avatar">A</div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
