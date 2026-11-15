import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { parseHostConfig } from './config.ts';
import { MinigamePreview } from './minigame/MinigamePreview.tsx';
// Mitgelieferte Schrift (OFL-1.1): gleiche Optik auf allen Geräten und stabile Screenshots.
import '@fontsource-variable/nunito/wght.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root fehlt in index.html');
}

const config = parseHostConfig(window.location.search);

createRoot(root).render(
  <StrictMode>
    {config.local && config.minigame !== null ? (
      <MinigamePreview
        id={config.minigame}
        players={config.players}
        seed={config.seed}
        test={config.test}
      />
    ) : (
      <App config={config} />
    )}
  </StrictMode>,
);
