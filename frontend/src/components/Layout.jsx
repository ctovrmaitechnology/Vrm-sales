import React, { useState, useRef, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AuroraBackground from './AuroraBackground';

// Sidebar is always auto-hide: an icon rail that opens over the page while the cursor is on it.
const Layout = () => {
  const [hovered, setHovered] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  // small delays so the sidebar does not flicker when the mouse just passes over it
  const enter = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setHovered(true), 90); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setHovered(false), 160); };

  const classes = ['layout-container', 'sidebar-unpinned'];
  if (!hovered) classes.push('sidebar-collapsed');

  return (
    <div className={classes.join(' ')}>
      <AuroraBackground />
      <div style={{ display: 'contents' }} onMouseEnter={enter} onMouseLeave={leave}>
        <Sidebar collapsed />
      </div>
      <main className="main-content">
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;