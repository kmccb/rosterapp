import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../schedule/icalParse';
import { gameOptions } from '../stats/gameOptions';
import { parseGameStats } from '../stats/gameParse';
import { gameLabel } from '../stats/leaders';
import { matchStats, type MatchReport } from '../stats/statsMatch';
import { CATEGORY_LABEL } from '../stats/statsParse';
import { putGame, removeGame, type StatsStore } from '../stats/statsStore';
import type { Roster } from '../types';

type Props = {
  roster: Roster;
  stats: StatsStore;
  onSaved: (next: StatsStore) => void;
  /** Where this team's files live; the schedule is read from it. */
  base: string;
};

/** Today as the schedule writes dates, in this phone's own calendar. */
const todayIso = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/*
 * One game at a time, from Hudl's Game Stats page. Games are filed by date,
 * so pasting Friday's game again on Saturday morning replaces it rather than
 * doubling every number. Removing one is a tap with no confirm: putting it
 * back is one paste.
 *
 * The game is picked from the schedule the app already carries rather than
 * typed, and the form opens on the game most likely just played. Typing only
 * comes back when the schedule can't be read at all, so the form never
 * dead-ends on a phone with no signal and no precached copy.
 */
export function GameImport({ roster, stats, onSaved, base }: Props) {
  const [schedule, setSchedule] = useState<Game[] | null>(null);
  const [scheduleFailed, setScheduleFailed] = useState(false);
  const [picked, setPicked] = useState('');
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [report, setReport] = useState<MatchReport | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const games = stats.current?.games ?? [];

  useEffect(() => {
    let cancelled = false;

    // Network first, precache second — the same two tries the Schedule tab
    // makes, for the same reason: the worker's copy is a launch behind.
    const load = async (): Promise<Game[]> => {
      try {
        const fresh = await fetch(`${base}schedule.json?t=${Date.now()}`, { cache: 'no-store' });
        if (fresh.ok) return ((await fresh.json()) as { games?: Game[] }).games ?? [];
      } catch {
        // No signal, which is the normal case at a ground.
      }
      const cached = await fetch(`${base}schedule.json`);
      if (!cached.ok) throw new Error(String(cached.status));
      return ((await cached.json()) as { games?: Game[] }).games ?? [];
    };

    load()
      .then((list) => !cancelled && setSchedule(list))
      .catch(() => !cancelled && setScheduleFailed(true));

    return () => {
      cancelled = true;
    };
  }, [base]);

  const pastedDates = useMemo(() => new Set(games.map((g) => g.date)), [games]);
  const { options, suggested } = useMemo(
    () => gameOptions(schedule ?? [], pastedDates, todayIso()),
    [schedule, pastedDates],
  );
  const chosen = options.find((o) => o.date === picked) ?? null;

  // The suggestion is a starting point, not a leash: it fills the box once,
  // when the schedule lands, and after that the pick is the person's.
  useEffect(() => {
    if (suggested && !picked) setPicked(suggested);
  }, [suggested, picked]);

  const fromSchedule = options.length > 0;
  const gameDate = fromSchedule ? chosen?.date ?? '' : date;
  const gameOpponent = fromSchedule ? chosen?.opponent ?? '' : opponent.trim();

  const read = () => {
    setSaved('');
    if (!gameOpponent || !gameDate) {
      setError(fromSchedule ? 'Pick which game this is.' : 'Say who the game was against and when.');
      return;
    }
    const { rows, categories: found } = parseGameStats(text);
    if (rows.length === 0) {
      setReport(null);
      setError(
        'Couldn’t find a game’s tables in that. On Hudl’s Game Stats page, pick the game, then select from the “Offense” heading down through “Special Teams” and copy.',
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
      const next = putGame(gameDate, gameOpponent, report.byPlayer);
      onSaved(next);
      setSaved(`Saved ${gameLabel(gameDate, gameOpponent)}.`);
      setReport(null);
      setText('');
      setOpponent('');
      setDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the game.');
    }
  };

  const remove = (gameDate: string) => {
    onSaved(removeGame(gameDate));
    setSaved('');
  };

  const matchedCount = report ? Object.keys(report.byPlayer).length : 0;

  return (
    <>
      <p className="hint">
        On Hudl’s Game Stats page, pick the game, then select from the “Offense” heading down
        through “Special Teams” and copy. Both teams come along; only your team’s tables are
        kept — Hudl prints them first.
      </p>

      {fromSchedule ? (
        <>
          <label className="label" htmlFor="game-pick">
            Which game
          </label>
          <select
            id="game-pick"
            className="input"
            value={picked}
            onChange={(e) => {
              setPicked(e.target.value);
              setReport(null);
              setSaved('');
            }}
          >
            {options.map((o) => (
              <option key={o.date} value={o.date}>
                {o.label}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          {!scheduleFailed && schedule === null && (
            <p className="hint">Reading the schedule…</p>
          )}
          <label className="label" htmlFor="game-opponent">
            Opponent
          </label>
          <input
            id="game-opponent"
            className="input"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="Salem"
          />

          <label className="label" htmlFor="game-date">
            Date
          </label>
          <input
            id="game-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </>
      )}

      <label className="label" htmlFor="game-paste">
        Paste the game
      </label>
      <textarea
        id="game-paste"
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={'Offense\nPassing\tComp/Att\tYds\tTD\t…\n#1 D. Xipolitas\t6/11\t83\t1\t…'}
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
            <button type="button" className="btn btn-primary" onClick={save} disabled={matchedCount === 0}>
              Save {matchedCount} players
            </button>
          </div>
        </>
      )}

      {!report && (
        <div className="review-actions">
          <button type="button" className="btn btn-primary" onClick={read} disabled={!text.trim()}>
            Read the game
          </button>
        </div>
      )}

      {games.length > 0 && (
        <>
          <h3 className="section">Games in</h3>
          <div className="rows">
            {games.map((g) => (
              <div className="row" key={g.date}>
                <span>
                  {gameLabel(g.date, g.opponent)} · {Object.keys(g.byPlayer).length} players
                </span>
                <button type="button" className="link-btn" onClick={() => remove(g.date)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
