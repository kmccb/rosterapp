import { useMemo, useRef, useState } from 'react';
import { parseHeight, parseRoster, parseWeight, sideFromPosition, splitName } from '../parse/rosterParse';
import { fetchShared, sharingAvailable } from '../share/share';
import { formatHeight, fullName, type Player, type Roster, type Side } from '../types';

type EditRow = {
  id: string;
  number: string;
  name: string;
  position: string;
  heightText: string;
  weightText: string;
  grade: string;
  side: Side;
};

/** A shared roster brings its own team name and season; a pasted one doesn't. */
export type ImportMeta = { teamName?: string; season?: string };

type Props = {
  roster: Roster;
  onSave: (players: Player[], meta?: ImportMeta) => void;
};

const SIDES: Array<{ value: Side; label: string }> = [
  { value: '', label: '—' },
  { value: 'O', label: 'Off' },
  { value: 'D', label: 'Def' },
  { value: 'ST', label: 'ST' },
];

const newRow = (): EditRow => ({
  id: crypto.randomUUID(),
  number: '',
  name: '',
  position: '',
  heightText: '',
  weightText: '',
  grade: '',
  side: '',
});

const rowIssues = (row: EditRow): string[] => {
  const issues: string[] = [];
  if (!row.number.trim()) issues.push('Needs a number');
  if (!row.name.trim()) issues.push('Needs a name');
  if (row.heightText.trim() && parseHeight(row.heightText) === undefined) issues.push('Height?');
  if (row.weightText.trim() && parseWeight(row.weightText) === undefined) issues.push('Weight?');
  return issues;
};

const toPlayer = (row: EditRow): Player => {
  const { firstName, lastName } = splitName(row.name);
  const position = row.position.trim().toUpperCase();
  return {
    id: row.id,
    number: row.number.trim().replace(/^#\s*/, ''),
    firstName,
    lastName,
    position,
    side: row.side || sideFromPosition(position),
    heightIn: parseHeight(row.heightText),
    weightLb: parseWeight(row.weightText),
    grade: row.grade.trim() || undefined,
  };
};

const fromPlayer = (p: Player): EditRow => ({
  id: p.id,
  number: p.number,
  name: fullName(p),
  position: p.position,
  heightText: formatHeight(p.heightIn),
  weightText: p.weightLb ? String(p.weightLb) : '',
  grade: p.grade ?? '',
  side: p.side,
});

const SAMPLE = `#\tName\tPos\tHt\tWt\tGrade
7\tJake Miller\tQB\t6-1\t185\tJr
12\tAnthony Rodriguez\tWR\t5-10\t165\tSo
72\tMarcus Webb\tOT\t6-4\t285\tSr`;

export function Import({ roster, onSave }: Props) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<EditRow[] | null>(null);
  const [meta, setMeta] = useState<ImportMeta>({});
  const [code, setCode] = useState('');
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const duplicateNumbers = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows ?? []) {
      const n = r.number.trim();
      if (n) seen.set(n, (seen.get(n) ?? 0) + 1);
    }
    return new Set([...seen].filter(([, count]) => count > 1).map(([n]) => n));
  }, [rows]);

  const needsAttention = useMemo(
    () => (rows ?? []).filter((r) => rowIssues(r).length > 0).length,
    [rows],
  );

  const handleParse = (source: string) => {
    const result = parseRoster(source);
    if (result.rows.length === 0) {
      setError("Couldn't find any rows in that. Paste the roster including the number and name columns.");
      return;
    }
    setError('');
    setMeta({});
    setRows(result.rows.map((r) => fromPlayer(r.player)));
  };

  // A pulled roster lands in the same review table as a pasted one. It came off
  // someone else's phone, so it gets the same look-before-you-save treatment.
  const handlePull = async () => {
    setPulling(true);
    setError('');
    try {
      const found = await fetchShared(code);
      if (!found) {
        setError('No roster for that code. Check it with whoever shared it — codes can be taken down.');
        return;
      }
      setMeta({ teamName: found.teamName, season: found.season });
      setRows(found.players.map(fromPlayer));
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch that roster.');
    } finally {
      setPulling(false);
    }
  };

  const update = (id: string, patch: Partial<EditRow>) =>
    setRows((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const remove = (id: string) => setRows((rs) => (rs ?? []).filter((r) => r.id !== id));

  const handleSave = () => {
    const keep = (rows ?? []).filter((r) => r.number.trim() || r.name.trim());
    try {
      onSave(keep.map(toPlayer), meta);
      setSaved(true);
      setRows(null);
      setText('');
      setCode('');
      setMeta({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the roster.');
    }
  };

  const onFile = async (file: File) => {
    const content = await file.text();
    setText(content);
    handleParse(content);
  };

  // ---------------------------------------------------------------- review

  if (rows) {
    return (
      <div className="screen">
        <div className="review-summary">
          <div>
            <strong>{rows.length}</strong> players found
            {meta.teamName ? ` for ${meta.teamName}` : ''}
            {needsAttention > 0 && <span className="warn"> · {needsAttention} need a look</span>}
          </div>
          <p className="hint">
            Check the columns landed in the right place, then save. Nothing is stored until you do.
          </p>
        </div>

        <div className="review-rows">
          {rows.map((row) => {
            const issues = rowIssues(row);
            const shared = row.number.trim() && duplicateNumbers.has(row.number.trim());
            return (
              <div key={row.id} className={`review-row${issues.length ? ' has-issue' : ''}`}>
                <div className="review-line">
                  <input
                    className="input cell cell-num"
                    value={row.number}
                    onChange={(e) => update(row.id, { number: e.target.value })}
                    inputMode="numeric"
                    aria-label="Jersey number"
                    placeholder="#"
                  />
                  <input
                    className="input cell cell-name"
                    value={row.name}
                    onChange={(e) => update(row.id, { name: e.target.value })}
                    aria-label="Name"
                    placeholder="Name"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => remove(row.id)}
                    aria-label={`Remove ${row.name || 'row'}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="review-line">
                  <input
                    className="input cell cell-pos"
                    value={row.position}
                    onChange={(e) => update(row.id, { position: e.target.value })}
                    aria-label="Position"
                    placeholder="Pos"
                  />
                  <input
                    className="input cell cell-ht"
                    value={row.heightText}
                    onChange={(e) => update(row.id, { heightText: e.target.value })}
                    aria-label="Height"
                    placeholder="Ht"
                  />
                  <input
                    className="input cell"
                    value={row.weightText}
                    onChange={(e) => update(row.id, { weightText: e.target.value })}
                    inputMode="numeric"
                    aria-label="Weight"
                    placeholder="Wt"
                  />
                  <input
                    className="input cell cell-grade"
                    value={row.grade}
                    onChange={(e) => update(row.id, { grade: e.target.value })}
                    aria-label="Grade"
                    placeholder="Yr"
                  />
                  <select
                    className="input cell cell-side"
                    value={row.side}
                    onChange={(e) => update(row.id, { side: e.target.value as Side })}
                    aria-label="Side of the ball"
                  >
                    {SIDES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                {(issues.length > 0 || shared) && (
                  <p className="review-issues">
                    {issues.join(' · ')}
                    {shared && (issues.length ? ' · ' : '') + `#${row.number} used twice`}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="review-actions">
          <button type="button" className="btn" onClick={() => setRows([...rows, newRow()])}>
            Add player
          </button>
          <button type="button" className="btn" onClick={() => setRows(null)}>
            Start over
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save {rows.length} players
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- paste

  return (
    <div className="screen">
      {saved && <p className="success">Roster saved. Head to Lookup and try a number.</p>}

      {roster.players.length > 0 && (
        <p className="hint">
          {roster.players.length} players saved
          {roster.teamName ? ` for ${roster.teamName}` : ''}. Importing replaces them.
        </p>
      )}

      {sharingAvailable && (
        <>
          <label className="label" htmlFor="code">
            Have a share code?
          </label>
          <p className="hint">
            Eight characters from whoever keeps the roster, like BXQ4-T9KM.
          </p>
          <div className="review-actions">
            <input
              id="code"
              className="input cell"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="BXQ4-T9KM"
              aria-label="Share code"
            />
            <button
              type="button"
              className="btn"
              onClick={() => void handlePull()}
              disabled={pulling || !code.trim()}
            >
              {pulling ? 'Fetching…' : 'Get the roster'}
            </button>
          </div>
        </>
      )}

      <label className="label" htmlFor="paste">
        Paste the roster
      </label>
      <p className="hint">
        Select the rows in the spreadsheet, copy, and paste here. A header row helps but isn’t
        required.
      </p>
      <textarea
        id="paste"
        className="input textarea"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={10}
        spellCheck={false}
        placeholder={SAMPLE}
      />

      {error && <p className="error">{error}</p>}

      <div className="review-actions">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          Choose a file
        </button>
        <button type="button" className="btn" onClick={() => setText(SAMPLE)}>
          Use sample
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => handleParse(text)}
          disabled={!text.trim()}
        >
          Review
        </button>
      </div>
    </div>
  );
}
