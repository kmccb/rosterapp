import { useState } from 'react';

type Props = { onSignIn: (code: string) => Promise<void>; hasCachedRoster: boolean };

/** Gate in front of the shared roster. Two codes: one to look, one to edit. */
export function SignIn({ onSignIn, hasCachedRoster }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSignIn(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen signin">
      <h2 className="signin-title">Team code</h2>
      <p className="hint">
        Ask whoever runs the roster for the code. Entering it once keeps you signed in on this
        phone.
      </p>

      <form onSubmit={submit}>
        <input
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Team code"
          aria-label="Team code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="one-time-code"
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary signin-btn" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>

      {hasCachedRoster && (
        <p className="hint signin-cached">
          The roster you already downloaded still works offline — sign in when you have signal to
          pick up changes.
        </p>
      )}
    </div>
  );
}
