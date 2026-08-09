import { useState } from 'react';
import { pushCodes } from '../api/client';
import { formatHeight, fullName, type Roster } from '../types';

type Props = {
  roster: Roster;
  shared: boolean;
  canEdit: boolean;
  syncLabel: string;
  onChange: (patch: Partial<Roster>) => Promise<void>;
  onClear: () => void;
  onSignOut: () => void;
  onRefresh: () => Promise<void>;
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

export function Settings({
  roster,
  shared,
  canEdit,
  syncLabel,
  onChange,
  onClear,
  onSignOut,
  onRefresh,
}: Props) {
  const [copied, setCopied] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [viewCode, setViewCode] = useState('');
  const [editCode, setEditCode] = useState('');
  const [codeMessage, setCodeMessage] = useState('');

  const copy = async (label: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(`${label} copied to the clipboard.`);
    } catch {
      setCopied(`Couldn't reach the clipboard — long-press to copy from the export box instead.`);
    }
  };

  const changeCodes = async () => {
    setCodeMessage('');
    try {
      await pushCodes({
        viewCode: viewCode.trim() || undefined,
        editCode: editCode.trim() || undefined,
      });
      setViewCode('');
      setEditCode('');
      setCodeMessage('Codes changed. Anyone using the old one will need the new one.');
    } catch (err) {
      setCodeMessage(err instanceof Error ? err.message : 'Could not change the codes.');
    }
  };

  return (
    <div className="screen">
      {shared && (
        <>
          <h2 className="section">Sharing</h2>
          <p className="hint">
            {syncLabel}
            {canEdit ? ' · you can edit' : ' · read-only'}
          </p>
          <div className="review-actions">
            <button type="button" className="btn" onClick={() => void onRefresh()}>
              Check for updates
            </button>
            <button type="button" className="btn" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </>
      )}

      <label className="label" htmlFor="team">
        Team
      </label>
      <input
        id="team"
        className="input"
        value={roster.teamName}
        onChange={(e) => void onChange({ teamName: e.target.value })}
        placeholder="Central High Bulldogs"
        disabled={!canEdit}
      />

      <label className="label" htmlFor="season">
        Season
      </label>
      <input
        id="season"
        className="input"
        value={roster.season}
        onChange={(e) => void onChange({ season: e.target.value })}
        placeholder="2026"
        disabled={!canEdit}
      />

      <h2 className="section">Backup</h2>
      <p className="hint">
        {shared
          ? 'The roster lives in the team database, but a copy never hurts.'
          : 'The roster lives only on this phone. Copy it somewhere safe.'}
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

      {shared && canEdit && (
        <>
          <h2 className="section">Access codes</h2>
          <p className="hint">
            Change a code if one gets passed around too far. Leave a box empty to keep that code as
            it is. The team code is read-only access; the editor code also allows importing.
          </p>
          <input
            className="input"
            value={viewCode}
            onChange={(e) => setViewCode(e.target.value)}
            placeholder="New team code (6+ characters)"
            aria-label="New team code"
            autoCapitalize="none"
            spellCheck={false}
          />
          <input
            className="input settings-gap"
            value={editCode}
            onChange={(e) => setEditCode(e.target.value)}
            placeholder="New editor code (8+ characters)"
            aria-label="New editor code"
            autoCapitalize="none"
            spellCheck={false}
          />
          <div className="review-actions">
            <button
              type="button"
              className="btn"
              onClick={() => void changeCodes()}
              disabled={!viewCode.trim() && !editCode.trim()}
            >
              Change codes
            </button>
          </div>
          {codeMessage && <p className="success">{codeMessage}</p>}
        </>
      )}

      <h2 className="section">Danger zone</h2>
      <p className="hint">
        {shared
          ? 'Clears the copy saved on this phone. The team database is untouched.'
          : 'Deletes the roster from this phone.'}
      </p>
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
            Yes, clear it
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setConfirmClear(true)}
          disabled={roster.players.length === 0}
        >
          {shared ? 'Clear this device' : 'Delete the roster'}
        </button>
      )}

      <p className="footnote">
        {roster.players.length} players · last updated{' '}
        {new Date(roster.updatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
