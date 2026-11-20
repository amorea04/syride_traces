import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from '@/App';
import { cssVariablesResolver, mantineTheme } from '@/theme';
import '@/theme/global.css';
import { registerServiceWorker } from '@/pwa';
import { preloadRoute } from '@/router';
import { preloadAppData } from '@/data/DataProvider';

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

preloadAppData();
preloadRoute(window.location.pathname);

createRoot(root).render(
  <StrictMode>
    <MantineProvider
      theme={mantineTheme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
    >
      {/* Sans transition : avec des pages en React.lazy, la navigation resterait « en attente » (ancienne page, ancienne
          adresse côté React) jusqu'au chargement du chunk, et un filtre modifié entre-temps s'écrirait sur la mauvaise route. */}
      <BrowserRouter basename={import.meta.env.BASE_URL} useTransitions={false}>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);

registerServiceWorker();
