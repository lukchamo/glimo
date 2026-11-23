import '@glimo/glim/glim.css';
import './styles/site.css';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root') as HTMLElement;
const app = <App initialPath={location.pathname} />;

// Fully prerendered pages are hydrated in place; app shells are rendered on the client.
if (root.dataset.prerender === 'full' && root.dataset.path === location.pathname) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
