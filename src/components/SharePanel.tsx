import { useState } from 'react';
import {
  createShare,
  deleteShare,
  formatCode,
  loadShareKey,
  shareUrl,
  updateShare,
  type ShareKey,
} from '../share/share';
import type { Roster } from '../types';

type Props = { roster: Roster };

type Busy = 'publish' | 'update' | 'stop' | null;

export function SharePanel({ roster }: Props) {
  const [key, setKey] = useState<ShareKey | null>(() => loadShareKey());
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);

  const run = async (which: Exclude<Busy, null>, work: () => Promise<string>) => {
    setBusy(which);
    setError('');
    setNote('');
    try {
      setNote(await work());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const publish = () =>
    run('publish', async () => {
      const next = await createShare(roster);
      setKey(next);
      return `Published. The code is ${formatCode(next.code)}.`;
    });

  const update = () =>
    run('update', async () => {
      if (!key) throw new Error('Nothing is published from this phone yet.');
      await updateShare(key, roster);
      return 'Everyone who pulls the code again gets the new roster.';
    });

  const stop = () =>
    run('stop', async () => {
      if (!key) throw new Error('Nothing is published from this phone yet.');
      await deleteShare(key);
      setKey(null);
      setConfirmStop(false);
      return 'The code no longer works. Rosters already pulled stay on those phones.';
    });

  const copy = async (what: 'link' | 'code') => {
    if (!key) return;
    setError('');
    const text = what === 'link' ? shareUrl(key.code) : formatCode(key.code);
    try {
      await navigator.clipboard.writeText(text);
      setNote(what === 'link' ? 'Link copied. Paste it to the team.' : 'Code copied.');
    } catch {
      // Safari refuses the clipboard outside a user gesture it trusts, and the
      // link is too long to read off a screen — so show it instead of failing.
      setNote(`Couldn’t reach the clipboard. ${what === 'link' ? text : formatCode(key.code)}`);
    }
  };

  return (
    <>
      <h2 className="section">Share</h2>

      {key ? (
        <>
          <p className="hint">
            Send the link to the team. Opening it loads the roster — no typing, no accounts. The
            code below is the same thing for anyone you'd rather read it out to.
          </p>
          <p className="code">{formatCode(key.code)}</p>

          <div className="review-actions">
            <button type="button" className="btn btn-primary" onClick={() => void copy('link')}>
              Copy the link
            </button>
            <button type="button" className="btn" onClick={() => void copy('code')}>
              Copy the code
            </button>
          </div>

          <p className="hint">
            Changed the roster since? Send it again — the same link picks up the new one.
          </p>
          <div className="review-actions">
            <button
              type="button"
              className="btn"
              onClick={() => void update()}
              disabled={busy !== null}
            >
              {busy === 'update' ? 'Sending…' : 'Send the current roster'}
            </button>
          </div>

          {confirmStop ? (
            <div className="review-actions">
              <button type="button" className="btn" onClick={() => setConfirmStop(false)}>
                Keep sharing
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void stop()}
                disabled={busy !== null}
              >
                {busy === 'stop' ? 'Stopping…' : 'Yes, stop sharing'}
              </button>
            </div>
          ) : (
            <div className="review-actions">
              <button type="button" className="btn btn-danger" onClick={() => setConfirmStop(true)}>
                Stop sharing
              </button>
            </div>
          )}

          <p className="footnote">
            Only this phone can change or stop the share — the key that proves it is stored here and
            nowhere else. If you clear this browser’s data the code keeps working but nobody can
            take it down, so stop sharing before you wipe the phone.
          </p>
        </>
      ) : (
        <>
          <p className="hint">
            Publishing puts the roster on a server and hands you an 8-character code. Anyone with
            the code can read it — names, positions, heights, weights and year — so treat it like
            the paper roster, not like a password. Nothing goes up until you press the button.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void publish()}
            disabled={busy !== null || roster.players.length === 0}
          >
            {busy === 'publish' ? 'Publishing…' : 'Publish to a code'}
          </button>
        </>
      )}

      {note && <p className="success">{note}</p>}
      {error && <p className="error">{error}</p>}
    </>
  );
}
