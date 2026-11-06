import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, ChevronDown, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from './AppContext';

const HeaderUserMenu = () => {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
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

  return (
    <div ref={menuRef} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
      {/* Dark / Light Mode Toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: '10px',
          background: '#ffffff',
          border: '1px solid rgba(220, 234, 250, 0.95)',
          color: '#64748b',
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          transition: 'all 0.15s ease',
        }}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>

      {/* User Profile Pill */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px 4px 6px',
            background: '#ffffff',
            border: '1px solid rgba(220, 234, 250, 0.95)',
            borderRadius: '10px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            cursor: 'pointer',
            userSelect: 'none',
            outline: 'none',
          }}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            A
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, textAlign: 'left' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#0f172a' }}>Admin</span>
            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Administrator</span>
          </div>
          <ChevronDown
            size={14}
            color="#64748b"
            style={{
              marginLeft: '2px',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </button>

        {open && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              padding: '6px',
              minWidth: '150px',
              zIndex: 50,
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
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: '#ef4444',
                fontSize: '0.825rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <LogOut size={15} />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HeaderUserMenu;

