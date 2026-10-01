/*
 * Everything the sync-sources Edge Function imports, bundled by
 * vite.sync.config.ts into supabase/functions/sync-sources/lib/core.js.
 * After any change under src/sync, run `npm run build:sync` and commit the
 * bundle; src/sync/bundle.test.ts fails until you do.
 */
export { emailFor } from './alert';
export { previewSource, syncTarget } from './run';
export type { Preview, SyncResult } from './run';
export type { SyncState, Target } from './types';
