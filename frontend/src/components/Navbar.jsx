import React from 'react';
import { Sun, Moon, ChevronDown } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useApp } from './AppContext';

const Navbar = () => {
  const location = useLocation();
  const { theme, toggleTheme } = useApp();

  return (
    <header className="navbar">
      <div className="navbar-left" />

      <div className="navbar-right">
        {/* Dark / Light Mode Toggle */}
        <button
          onClick={toggleTheme}
          className="nav-icon-btn"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {/* User Profile */}
        <div className="user-profile">
          <div className="avatar">A</div>
          <div className="user-info">
            <span className="user-name">Admin</span>
            <span className="user-role">Administrator</span>
          </div>
          <ChevronDown size={14} color="#64748b" style={{ marginLeft: '4px' }} />
        </div>
      </div>
    </header>
  );
};

export default Navbar;
