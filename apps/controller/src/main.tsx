import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { parseLaunchParams, withJoinCode } from './config.ts';
import { controllerSocketUrl } from './net/client.ts';
import { createControllerSession } from './net/session.ts';
import { createBrowserTokenStore } from './net/tokenStore.ts';
import { installIosGuards } from './ui/iosGuards.ts';
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
  tokens: createBrowserTokenStore(),
});
if (params.joinCode !== null) session.join(params.joinCode);

function submitCode(code: string) {
  // Code in die URL schreiben, damit Neuladen dieselbe Sitzung findet.
  window.history.replaceState(null, '', withJoinCode(window.location.search, code));
  session.join(code);
}

createRoot(root).render(
  <StrictMode>
    <App session={session} onCodeSubmit={submitCode} />
  </StrictMode>,
);
