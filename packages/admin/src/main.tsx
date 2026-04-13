import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './locales';
import './styles.css';
import { AdminApp } from './AdminApp';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
