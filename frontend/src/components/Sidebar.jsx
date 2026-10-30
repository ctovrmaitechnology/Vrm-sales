import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  MessageCircle,
  Users,
  Mail,
  Building2,
  PhoneCall,
  BarChart3,
  ChevronDown,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { useApp } from './AppContext';

const Sidebar = () => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { theme, toggleTheme } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const logout = () => {
    localStorage.removeItem('vrm_admin');
    localStorage.removeItem('isLoggedIn');
    queryClient.clear();
    navigate('/', { replace: true });
  };

  const navItems = [
    { path: '/app', label: 'Overview', icon: <LayoutDashboard size={20} /> },
    { path: '/app/whatsapp', label: 'WhatsApp Campaign', icon: <MessageCircle size={20} /> },
    { path: '/app/leads', label: 'Leads', icon: <Users size={20} /> },
    { path: '/email', label: 'Email', icon: <Mail size={20} /> },
    { path: '/app/calls', label: 'Calls', icon: <PhoneCall size={20} /> },
    { path: '/app/company', label: 'Company', icon: <Building2 size={20} /> },
    { path: '/app/insights', label: 'Insights', icon: <BarChart3 size={20} /> },
    { path: '/app/users', label: 'Users', icon: <Users size={20} /> },
  ];

  return (
    <aside className="sidebar">
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {/* Sidebar Header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img
              src="/vrmLogo.png"
              alt="VRM Logo"
              style={{
                width: '36px',
                height: '36px',
                objectFit: 'contain'
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.15 }}>
              VRM
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', letterSpacing: '-0.01em' }}>
              Sales Agent
            </span>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
              end={item.path === '/app'}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User Profile & Theme Section at bottom of Sidebar */}
      <div ref={userMenuRef} style={{ padding: '1rem', borderTop: '1px solid rgba(214, 228, 246, 0.9)', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          {/* User Profile Pill */}
          <button
            type="button"
            onClick={() => setUserMenuOpen((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 10px',
              background: '#ffffff',
              border: '1px solid rgba(220, 234, 250, 0.95)',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(180, 205, 235, 0.16)',
              cursor: 'pointer',
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              transition: 'all 0.15s ease',
            }}
            aria-haspopup="true"
            aria-expanded={userMenuOpen}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              A
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0, flex: 1, overflow: 'hidden' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Admin
              </span>
              <span style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Administrator
              </span>
            </div>
            <ChevronDown
              size={15}
              color="#64748b"
              style={{
                transform: userMenuOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease',
                flexShrink: 0,
              }}
            />
          </button>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: '12px',
              background: '#ffffff',
              border: '1px solid rgba(220, 234, 250, 0.95)',
              color: '#64748b',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(180, 205, 235, 0.16)',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>

        {/* Dropdown Menu (Opens upwards from sidebar bottom) */}
        {userMenuOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: '1rem',
              right: '1rem',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.15)',
              padding: '6px',
              zIndex: 100,
            }}
          >
            <button
              type="button"
              onClick={logout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                color: '#ef4444',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <LogOut size={16} />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
