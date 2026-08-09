import { useMemo, useState } from 'react';
import { matchStats, type MatchReport } from '../stats/statsMatch';
import { CATEGORY_LABEL, parseStats } from '../stats/statsParse';
import { putSeason, type SeasonBucket, type StatsStore } from '../stats/statsStore';
import type { Roster } from '../types';

type Props = {
  roster: Roster;
  stats: StatsStore;
  onSaved: (next: StatsStore) => void;
  onBack: () => void;
  onGoToSettings: () => void;
};

const BUCKETS: Array<{ id: SeasonBucket; label: string }> = [
  { id: 'previous', label: 'Last season' },
  { id: 'current', label: 'This season' },
];

export function StatsImport({ roster, stats, onSaved, onBack, onGoToSettings }: Props) {
  const [bucket, setBucket] = useState<SeasonBucket>('previous');
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [report, setReport] = useState<MatchReport | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const existing = stats[bucket];

  const placeholderLabel = useMemo(
    () => (bucket === 'current' ? roster.season || 'This season' : 'Last season'),
    [bucket, roster.season],
  );

  const read = () => {
    setSaved('');
    const { rows, categories: found, skippedTables } = parseStats(text);

    if (rows.length === 0) {
      setReport(null);
      setError(
        skippedTables > 0
          ? 'Found a table but not which stat it is. Copy the heading above it too — "Punt Return Stats" and "Kickoff Return Stats" have identical columns and the heading is the only thing that tells them apart.'
          : "Couldn't find a stats table in that. Select the tables on the Hudl page — headings included — and copy the lot.",
      );
      return;
    }

    if (roster.players.length === 0) {
      setError('Add the roster first — stats are filed against players by name.');
      return;
    }

    setError('');
    setCategories(found.map((c) => CATEGORY_LABEL[c]));
    setReport(matchStats(rows, roster.players));
  };

  const save = () => {
    if (!report) return;
    try {
      const next = putSeason(bucket, label.trim() || placeholderLabel, report.byPlayer);
      onSaved(next);
      setSaved(`Saved under ${bucket === 'previous' ? 'last season' : 'this season'}.`);
      setReport(null);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the stats.');
    }
  };

  const matchedCount = report ? Object.keys(report.byPlayer).length : 0;

  return (
    <div className="screen">
      <nav className="setup-nav" aria-label="Setup">
        <button type="button" className="btn" onClick={onBack}>
          Roster
        </button>
        <span className="setup-nav-here">Stats</span>
        <button type="button" className="btn" onClick={onGoToSettings}>
          Settings
        </button>
      </nav>

      <h2 className="section">Stats</h2>
      <p className="hint">
        On Hudl, open the season stats page, select the tables and copy. Paste the lot in one go —
        passing, rushing, defense and the rest together. Players are matched by name, so a change of
        jersey number doesn’t matter.
      </p>

      <label className="label">Which season</label>
      <div className="chips" role="group" aria-label="Which season">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`chip${bucket === b.id ? ' active' : ''}`}
            aria-pressed={bucket === b.id}
            onClick={() => {
              setBucket(b.id);
              setReport(null);
              setSaved('');
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
      {existing && (
        <p className="hint">
          Already holding {Object.keys(existing.byPlayer).length} players as “{existing.label}”.
          Saving replaces them.
        </p>
      )}

      <label className="label" htmlFor="season-label">
        Call it
      </label>
      <input
        id="season-label"
        className="input"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={placeholderLabel}
      />
      <p className="hint">Shown as the column heading on a player’s card.</p>

      <label className="label" htmlFor="stats-paste">
        Paste the stats
      </label>
      <textarea
        id="stats-paste"
        className="input textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={'Passing Stats\n#\tNAME\tGAMES\tCMP\tATT\t…\n1\tD. Xipolitas\t11\t54\t92\t…'}
      />

      {error && <p className="error">{error}</p>}
      {saved && <p className="success">{saved}</p>}

      {report && (
        <>
          <h3 className="section">Check before saving</h3>
          <p className="hint">
            <strong>{matchedCount}</strong> players matched across {categories.join(', ')}.
          </p>

          {report.unmatched.length > 0 && (
            <>
              <p className="warn">
                {report.unmatched.length} names aren’t on the roster — normally players who left.
                Their stats are dropped.
              </p>
              <p className="hint">{report.unmatched.join(' · ')}</p>
            </>
          )}

          {report.ambiguous.length > 0 && (
            <>
              <p className="warn">
                {report.ambiguous.length} names fit more than one player, so they’re left out rather
                than guessed. Give the roster full first names to fix it.
              </p>
              {report.ambiguous.map((a) => (
                <p className="hint" key={a.printed}>
                  {a.printed} → {a.candidates.join(' or ')}
                </p>
              ))}
            </>
          )}

          <div className="review-actions">
            <button type="button" className="btn" onClick={() => setReport(null)}>
              Start over
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={matchedCount === 0}
            >
              Save {matchedCount} players
            </button>
          </div>
        </>
      )}

      {!report && (
        <div className="review-actions">
          <button type="button" className="btn btn-primary" onClick={read} disabled={!text.trim()}>
            Read the stats
          </button>
        </div>
      )}
    </div>
  );
}
