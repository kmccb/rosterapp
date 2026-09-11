import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DEMO_SLUG, isDemo } from './demo';
import { Directory } from './Directory';
import { Manage } from './manage/Manage';
import { Privacy } from './Privacy';
import { School } from './School';
import '../styles.css';
import './oh.css';

/*
 * Routed on query flags, not paths: the host's only fallback for a path with
 * no file is Poland's root page, and the root service worker deliberately
 * refuses /oh/ navigations, so /oh/manage as a path would open the wrong app.
 * ?manage and ?privacy always resolve to this page.
 *
 * The demo is the exception, and it is not a fallback: vite.oh.config.ts emits
 * a second page at dist/oh/demo/index.html, so /oh/demo/ is a file Pages can
 * serve on its own. It goes first because it is a whole page rather than a
 * panel over the directory — it skips the picker entirely and mounts the real
 * School screen on the fictional school, so what a prospect is shown is the
 * product and not a rehearsal of it.
 */
const params = new URLSearchParams(location.search);
const page = isDemo() ? (
  // There is no second school to follow here, so the row that offers it hands
  // the reader to the actual directory instead of clearing a choice.
  <School
    slug={DEMO_SLUG}
    onChange={() => {
      location.href = '/oh/';
    }}
  />
) : params.has('manage') ? (
  <Manage />
) : params.has('privacy') ? (
  <Privacy />
) : (
  <Directory />
);

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>);
