import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { parseLaunchParams, withJoinCode, withSeats } from './config.ts';
import { controllerSocketUrl } from './net/client.ts';
import { createControllerSession } from './net/session.ts';
import { createBrowserTokenStore } from './net/tokenStore.ts';
import { scopeTokenStore } from './tokenScope.ts';
import { installIosGuards } from './ui/iosGuards.ts';
// Mitgelieferte Schrift (OFL-1.1): gleiche Optik auf allen Geräten und stabile Screenshots.
import '@fontsource-variable/nunito/wght.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root fehlt in index.html');
}

installIosGuards();

const params = parseLaunchParams(window.location.search);
// Die Sitzung lebt so lange wie die Seite (nicht an React-Effekte gebunden, StrictMode-sicher).
const session = createControllerSession({
  url: controllerSocketUrl(window.location),
  seats: params.seats,
  // Geteiltes iPad: Token getrennt nach Platzzahl (CHAOS-13).
  tokens: scopeTokenStore(createBrowserTokenStore(), params.seats),
});
if (params.joinCode !== null) session.join(params.joinCode);

function submitCode(code: string) {
  // Code in die URL schreiben, damit Neuladen dieselbe Sitzung findet.
  window.history.replaceState(null, '', withJoinCode(window.location.search, code));
  session.join(code);
}

function changeSeats(seats: number) {
  // Platzzahl steht fest, sobald die Sitzung beitritt; neu laden mit `?seats=`.
  window.location.replace(withSeats(window.location.search, seats));
}

createRoot(root).render(
  <StrictMode>
    <App
      session={session}
      onCodeSubmit={submitCode}
      seats={params.seats}
      onSeatsChange={changeSeats}
    />
  </StrictMode>,
);
