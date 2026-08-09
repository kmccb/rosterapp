import { useState } from 'react';
import { SharePanel } from '../components/SharePanel';
import { sharingAvailable } from '../share/share';
import { formatHeight, fullName, type Roster } from '../types';

type Props = {
  roster: Roster;
  onChange: (patch: Partial<Roster>) => void;
  onBack: () => void;
  onClear: () => void;
};

const toCsv = (roster: Roster): string => {
  const head = '#,Name,Pos,Ht,Wt,Grade,Side';
  const escape = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = roster.players.map((p) =>
    [
      p.number,
      fullName(p),
      p.position,
      formatHeight(p.heightIn),
      p.weightLb ? String(p.weightLb) : '',
      p.grade ?? '',
      p.side,
    ]
      .map((v) => escape(v ?? ''))
      .join(','),
  );
  return [head, ...lines].join('\n');
};

export function Settings({ roster, onChange, onBack, onClear }: Props) {
  const [copied, setCopied] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const copy = async (label: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(`${label} copied to the clipboard.`);
    } catch {
      setCopied(`Couldn't reach the clipboard — long-press to copy from the export box instead.`);
    }
  };

  return (
    <div className="screen">
      {/* No tab bar entry for this screen, so it carries its own way out. */}
      <button type="button" className="card-back" onClick={onBack}>
        ‹ Back to the roster
      </button>

      <label className="label" htmlFor="team">
        Team
      </label>
      <input
        id="team"
        className="input"
        value={roster.teamName}
        onChange={(e) => onChange({ teamName: e.target.value })}
        placeholder="Central High Bulldogs"
      />

      <label className="label" htmlFor="season">
        Season
      </label>
      <input
        id="season"
        className="input"
        value={roster.season}
        onChange={(e) => onChange({ season: e.target.value })}
        placeholder="2026"
      />

      <h2 className="section">Backup</h2>
      <p className="hint">
        The roster lives only on this phone. Copy it somewhere safe, or send it to another parent —
        both formats paste straight back in on the screen you just came from.
      </p>
      <div className="review-actions">
        <button
          type="button"
          className="btn"
          onClick={() => void copy('CSV', toCsv(roster))}
          disabled={roster.players.length === 0}
        >
          Copy as CSV
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void copy('JSON', JSON.stringify(roster, null, 2))}
          disabled={roster.players.length === 0}
        >
          Copy as JSON
        </button>
      </div>
      {copied && <p className="success">{copied}</p>}

      {roster.players.length > 0 && (
        <>
          <label className="label" htmlFor="export">
            Export
          </label>
          <textarea
            id="export"
            className="input textarea"
            readOnly
            rows={6}
            value={toCsv(roster)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      )}

      {sharingAvailable && <SharePanel roster={roster} />}

      <h2 className="section">Danger zone</h2>
      {confirmClear ? (
        <div className="review-actions">
          <button type="button" className="btn" onClick={() => setConfirmClear(false)}>
            Keep it
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              onClear();
              setConfirmClear(false);
            }}
          >
            Yes, delete the roster
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setConfirmClear(true)}
          disabled={roster.players.length === 0}
        >
          Delete the roster
        </button>
      )}

      <p className="footnote">
        {roster.players.length} players · last updated{' '}
        {new Date(roster.updatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
