import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/dark-theme.css';
import { installAuthFetch } from './utils/auth';

import './styles/global.css';
import './styles/table-layout.css';
import './old-email-components/index.css';

installAuthFetch();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);