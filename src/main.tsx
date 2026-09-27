import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './ui/themes/medieval.css';
import './ui/themes/eras.css';
import './styles/global.css';
import './styles/ui.css';
import { App } from './ui/App';
import { installErrorHandlers } from './ui/errors';

document.documentElement.dataset.era = 'medieval';
installErrorHandlers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
