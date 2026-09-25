import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './ui/themes/medieval.css';
import './styles/global.css';
import './styles/ui.css';
import { App } from './ui/App';

document.documentElement.dataset.era = 'medieval';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
