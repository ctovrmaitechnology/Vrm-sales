import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { installAuthFetch } from './utils/auth';

import './styles/global.css';
import './old-email-components/index.css';

installAuthFetch();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);