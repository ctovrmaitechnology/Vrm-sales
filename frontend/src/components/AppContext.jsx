import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('vrm_theme') || 'light';
  });

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    localStorage.setItem('vrm_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <AppContext.Provider value={{ searchQuery, setSearchQuery, theme, toggleTheme }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
