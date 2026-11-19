import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RootCrash } from './components/RootCrash';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary fallback={<RootCrash />}>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
