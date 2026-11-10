import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { createAppServices } from '@/app/AppServices';
import { browserPageVisibility } from '@/app/pageVisibility';
import { RealtimeCoordinator } from '@/app/RealtimeCoordinator';
import { createAppRouter } from '@/app/routes';
import { configureMobx } from '@/mvvm/configureMobx';
import { SignalRGameConnection } from '@/realtime/SignalRGameConnection';

configureMobx();

// Built once, outside React, so a re-render can never create a second set of stores or a second router.
const connection = new SignalRGameConnection();
const services = createAppServices({ connection });
const router = createAppRouter();

// For the app's whole life: connects while someone is signed in, whatever screen React shows.
new RealtimeCoordinator(connection, services.session, services.round, browserPageVisibility).start();

const container = document.getElementById('root');
if (!container) {
  throw new Error('index.html has no #root element.');
}

createRoot(container).render(
  <StrictMode>
    <App services={services} router={router} />
  </StrictMode>,
);
