/*
 * STUB. The real directory is written in the next task; this exists only so
 * oh/index.html has an entry module to point at, and so the build that proves
 * Poland did not move is the same shape as the build that ships.
 *
 * It deliberately imports React the way the finished page will, because the
 * question this task has to answer is whether a second React entry can be
 * built without disturbing the first — a placeholder that imported nothing
 * would answer an easier question than the one that matters.
 */
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<h1>Ohio Football — coming soon</h1>);
}
