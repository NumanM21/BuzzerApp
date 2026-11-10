import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { createAppServices } from '@/app/AppServices';
import { createAppRouter } from '@/app/routes';
import { configureMobx } from '@/mvvm/configureMobx';

configureMobx();

// Built once, outside React, so a re-render can never create a second set of stores or a second router.
const services = createAppServices();
const router = createAppRouter();

const container = document.getElementById('root');
if (!container) {
  throw new Error('index.html has no #root element.');
}

createRoot(container).render(
  <StrictMode>
    <App services={services} router={router} />
  </StrictMode>,
);
