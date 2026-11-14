import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { parseHostConfig } from './config.ts';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root fehlt in index.html');
}

const config = parseHostConfig(window.location.search);

createRoot(root).render(
  <StrictMode>
    <App config={config} />
  </StrictMode>,
);
