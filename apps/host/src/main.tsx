import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { parseHostConfig } from './config.ts';
import { configureSound, unlockOnFirstGesture } from './fx/audio.ts';
import { LocalMinigameFlow } from './minigame/LocalMinigameFlow.tsx';
import { MinigamePreview } from './minigame/MinigamePreview.tsx';
import { startRefreshProbe } from './nature/refreshRate.ts';
// Mitgelieferte Schrift (OFL-1.1): gleiche Optik auf allen Geräten und stabile Screenshots.
import '@fontsource-variable/nunito/wght.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root fehlt in index.html');
}

const config = parseHostConfig(window.location.search);

// Ton (CHAOS-33): im Testmodus und mit `?mute=1` stumm. Der AudioContext entsteht erst mit
// einer Nutzer-Geste („Los geht’s!“ in der Lobby oder die erste Taste/der erste Klick).
const sound = configureSound({ muted: config.mute || config.test, volume: config.volume / 100 });
if (!sound.muted) unlockOnFirstGesture(sound, window);

// Bildwiederholrate messen, solange noch keine 3D-Szene rendert (CHAOS-76): Die Grafik-Automatik
// stuft auf einem 30-Hz-Fernseher sonst ab, obwohl die GPU mehr schafft.
if (!config.test) startRefreshProbe();

const minigame = config.local ? config.minigame : null;
const content =
  minigame === null ? (
    <App config={config} />
  ) : config.flow ? (
    <LocalMinigameFlow
      id={minigame}
      players={config.players}
      seed={config.seed}
      test={config.test}
    />
  ) : (
    <MinigamePreview id={minigame} players={config.players} seed={config.seed} test={config.test} />
  );

createRoot(root).render(<StrictMode>{content}</StrictMode>);
