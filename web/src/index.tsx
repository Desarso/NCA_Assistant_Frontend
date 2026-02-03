import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { registerServiceWorker } from './lib/pwa';
import { ThemeProvider } from './lib/theme-provider';

// Register service worker for PWA functionality
registerServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>
  </StrictMode>
);
