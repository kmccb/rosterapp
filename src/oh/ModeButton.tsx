import type { Mode } from './look';
import { otherMode } from './mode';

/** What the button says it will do — named for the mode it switches to, since
 * that is the question a fan tapping it is answering. */
export const modeButtonLabel = (mode: Mode): string => `Switch to ${otherMode(mode)} mode`;

/**
 * The sun/moon at the right end of a paid page's header. It shows what a tap
 * gives you: a sun on the dark page, a moon on the light one. Drawn inline in
 * currentColor so it takes the page's own text color in either mode.
 */
export function ModeButton({ mode, onToggle }: { mode: Mode; onToggle: () => void }) {
  const label = modeButtonLabel(mode);
  return (
    <button type="button" className="oh-mode-btn" onClick={onToggle} aria-label={label} title={label}>
      {mode === 'dark' ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
          <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z" />
        </svg>
      )}
    </button>
  );
}
