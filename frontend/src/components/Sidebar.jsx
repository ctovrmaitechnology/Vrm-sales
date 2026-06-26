import React from 'react';
import { NavLink } from 'react-router-dom';
import { Globe2, LayoutDashboard, MessageCircle, Mail, Users } from 'lucide-react';
import Linkedin from './LinkedinIcon';

const Sidebar = () => {
  const navItems = [
    { path: '/app', label: 'Overview', icon: <LayoutDashboard size={20} /> },
    { path: '/app/linkedin', label: 'LinkedIn', icon: <Linkedin size={20} /> },
    { path: '/app/whatsapp', label: 'WhatsApp', icon: <MessageCircle size={20} /> },
    { path: '/app/leads', label: 'Leads', icon: <Users size={20} /> },
    { path: '/app/facebook', label: 'Facebook', icon: <Globe2 size={20} /> },
    { path: '/email', label: 'Email', icon: <Mail size={20} /> },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img
            src="/vrmLogo.png"
            alt="VRM Logo"
            style={{
              width: '34px',
              height: '34px',
              objectFit: 'contain'
            }}
          />
        </div>

        <span className="sidebar-title">VRM Sales Agent</span>
      </div>

      <nav className="sidebar-nav">
        <div
          style={{
            marginBottom: '1rem',
            padding: '0 1.5rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase'
          }}
        >
          Main Menu
        </div>

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
    </aside>
  );
};

export default Sidebar;