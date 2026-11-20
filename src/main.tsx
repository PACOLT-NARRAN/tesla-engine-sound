import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { EngineSession } from './core/EngineSession.ts';
import './styles/cockpit.css';

// One session for the page lifetime; it owns audio, GPS and the simulation loop (outside React).
const session = new EngineSession(import.meta.env.BASE_URL);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
