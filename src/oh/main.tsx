import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Directory } from './Directory';
import { Manage } from './manage/Manage';
import { Privacy } from './Privacy';
import '../styles.css';
import './oh.css';

/*
 * Routed on query flags, not paths: GitHub Pages has no SPA fallback and the
 * root service worker deliberately refuses /oh/ navigations, so /oh/manage as
 * a path would be a 404. ?manage and ?privacy always resolve to this page.
 */
const params = new URLSearchParams(location.search);
const page = params.has('manage') ? <Manage /> : params.has('privacy') ? <Privacy /> : <Directory />;

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>);
