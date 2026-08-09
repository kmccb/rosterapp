import { useRef, useState } from 'react';
import {
  clearTheme,
  saveTheme,
  themeFromFile,
  themeSizeKb,
  type Theme,
} from '../theme/theme';

type Props = { theme: Theme | null; onChange: (next: Theme | null) => void };

/**
 * Upload a badge, get a team. The colours aren't offered as a choice because
 * picking six that work together, on a phone, is a worse job than reading them
 * off the badge — which is where the team's colours already are.
 */
export function ThemePanel({ theme, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = async (file: File) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const next = await themeFromFile(file);
      saveTheme(next);
      onChange(next);
      setNote(
        next.seedHue >= 0
          ? `Colours taken from the badge. ${themeSizeKb(next)} kB, which travels with the link.`
          : `Saved. That badge has no strong colour, so the app's own blue is used.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image could not be used.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    clearTheme();
    onChange(null);
    setConfirmRemove(false);
    setNote('Back to the default colours.');
  };

  return (
    <>
      <h2 className="section">Badge and colours</h2>
      <p className="hint">
        Add the team&rsquo;s badge and the app takes its colours from it — background, numbers and
        buttons. It goes out with the share link, so everyone who opens the link gets it.
      </p>

      {theme && (
        <div className="theme-preview">
          <img src={theme.logo} alt="The team badge" />
          <div className="theme-swatches" aria-hidden="true">
            <span style={{ background: theme.palette.ground }} />
            <span style={{ background: theme.palette.surface }} />
            <span style={{ background: theme.palette.accent }} />
            <span style={{ background: theme.palette.muted }} />
          </div>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
          e.target.value = '';
        }}
      />

      <div className="review-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          {busy ? 'Reading the badge…' : theme ? 'Use a different badge' : 'Add the team badge'}
        </button>
        {theme && !confirmRemove && (
          <button type="button" className="btn" onClick={() => setConfirmRemove(true)}>
            Remove it
          </button>
        )}
      </div>

      {confirmRemove && (
        <div className="review-actions">
          <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>
            Keep it
          </button>
          <button type="button" className="btn btn-danger" onClick={remove}>
            Yes, back to default colours
          </button>
        </div>
      )}

      {note && <p className="success">{note}</p>}
      {error && <p className="error">{error}</p>}

      <p className="footnote">
        The home screen icon can&rsquo;t change — it belongs to the site rather than the team, so
        it stays the same whoever installs it.
      </p>
    </>
  );
}
