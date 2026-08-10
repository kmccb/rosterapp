import { useState } from 'react';
import { fetchShared, formatCode, normalizeCode, type FetchedRoster } from '../share/share';

type Props = {
  onFound: (found: FetchedRoster, code: string) => void;
  onBack: () => void;
  /** Filled in already when a share link was followed. */
  initialCode?: string;
  /** Whether accepting would replace a roster this phone already has. */
  replacing?: boolean;
};

/**
 * One field and a button.
 *
 * Almost everyone who needs to type a code is a parent in a car park who was
 * sent one, and the setup screen — paste a roster, pick a file, review a table
 * of 49 rows — is not for them. It asked them to make decisions about a job
 * that was already done. This screen does the one thing they came to do and
 * then gets out of the way.
 *
 * Nothing is reviewed here on purpose. A code came from someone who already
 * checked the roster; the review table exists for a roster pasted out of an
 * email, which is not this.
 */
export function CodeEntry({ onFound, onBack, initialCode, replacing = false }: Props) {
  const [code, setCode] = useState(initialCode ?? '');
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState('');

  const clean = normalizeCode(code);
  const ready = clean.length === 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || pulling) return;

    setPulling(true);
    setError('');
    try {
      const found = await fetchShared(clean, 15000);
      if (!found) {
        setError('No roster for that code. Check it with whoever sent it — codes can be taken down.');
        return;
      }
      onFound(found, clean);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch that roster.');
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="screen">
      <form className="code-entry" onSubmit={(e) => void submit(e)}>
        <h2 className="section">Enter your code</h2>
        <p className="hint">
          The 8 characters from the message you were sent. The dash is only there to make it
          easier to read — you don't have to type it.
        </p>

        <input
          className="code-input"
          value={formatCode(code)}
          // Held as typed and normalised on the way out, so the dash the
          // formatter adds can still be deleted with one backspace.
          onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, 8))}
          placeholder="BXQ4-T9KM"
          aria-label="Share code"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          enterKeyHint="go"
        />

        {replacing && ready && (
          // Following someone else's link with a roster already here is the one
          // way to lose one, so it gets said out loud rather than discovered.
          <p className="warn">This will replace the roster already on this phone.</p>
        )}
        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={!ready || pulling}>
          {pulling ? 'Getting the roster…' : 'Get the roster'}
        </button>
        <button type="button" className="btn" onClick={onBack} disabled={pulling}>
          Back
        </button>
      </form>
    </div>
  );
}
