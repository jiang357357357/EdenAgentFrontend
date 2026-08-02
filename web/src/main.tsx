import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {AppErrorBoundary} from './components/errors';
import './index.css';

// The bubble is a transparent native window. Apply this before React mounts so
// loading, authentication transitions, and render failures cannot expose the
// document's normal light background.
const initialPage = new URLSearchParams(window.location.search).get('page');
document.documentElement.classList.toggle('pet-bubble-surface', initialPage === 'pet-bubble' || initialPage === 'pet-icon');
const isPetSurface = initialPage === 'pet' || initialPage === 'pet-character' || initialPage === 'pet-bubble' || initialPage === 'pet-icon';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary petSurface={isPetSurface}>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
