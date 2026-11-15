import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from '@/App';
import { mantineTheme } from '@/theme';

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

createRoot(root).render(
  <StrictMode>
    <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
