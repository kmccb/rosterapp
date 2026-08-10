/**
 * Which team a stored value belongs to.
 *
 * Browser storage is keyed by origin, not by path, and every team on this site
 * shares one origin — only the path differs. So a single jar held all of them
 * at once: loading a second team's roster overwrote the first's, and took its
 * badge, stats, share code and sync stamp with it, in both directions.
 *
 * Read from the address rather than from the baked team, because the service
 * worker can answer a navigation with a different team's shell. The path is the
 * one thing that is always right about where you are.
 *
 * The root team keeps the unsuffixed keys it has always used, so no roster
 * already sitting on a phone has to move.
 */
export const teamScope = (): string => {
  const first = window.location.pathname.split('/')[1] ?? '';
  // A filename, not a team: `/index.html` is still the root team.
  return first && !first.includes('.') ? first : '';
};

/** `rosterapp.v1` at the root, `rosterapp.v1:victorychristian` under a team. */
export const scopedKey = (key: string): string => {
  const scope = teamScope();
  return scope ? `${key}:${scope}` : key;
};
