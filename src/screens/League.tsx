import { useEffect, useMemo, useState } from 'react';
import type { RegionTable } from '../league/leagueParse';
import { byWeek, type LeagueGame, type Standing } from '../league/leagueModel';

/**
 * What the build wrote. The row and table shapes are the parser's, imported
 * rather than restated — one definition, so a column added at the source
 * cannot mean two different things on the two sides of the file.
 */
type League = {
  conference: string;
  team: string;
  division: string;
  region: number;
  teams: Standing[];
  games: LeagueGame[];
  regionTable: RegionTable | null;
};

/**
 * The rest of the conference, and the playoff picture.
 *
 * Two questions, so two segments: how everyone did on Friday, and who is in a
 * qualifying place. Poland's own row is picked out in both, because the reason
 * anyone opens this is to find it.
 */
export function League({ base }: { base: string }) {
  const [league, setLeague] = useState<League | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<'league' | 'region'>('league');

  useEffect(() => {
    let cancelled = false;

    // Network first, precache second — the scores change on a Friday night and
    // the worker's copy is a launch behind.
    const load = async (): Promise<League> => {
      try {
        const fresh = await fetch(`${base}league.json?t=${Date.now()}`, { cache: 'no-store' });
        if (fresh.ok) return await fresh.json();
      } catch {
        /* no signal, which is the normal case at a ground */
      }
      const cached = await fetch(`${base}league.json`);
      if (!cached.ok) throw new Error(String(cached.status));
      return await cached.json();
    };

    load()
      .then((d) => !cancelled && setLeague(d))
      .catch(() => !cancelled && setFailed(true));

    return () => { cancelled = true; };
  }, [base]);

  const weeks = useMemo(() => (league ? byWeek(league.games) : []), [league]);

  if (failed) {
    return <div className="screen"><p className="empty-text">No league table for this team yet.</p></div>;
  }
  if (!league) {
    return <div className="screen"><p className="empty-text">Loading the league…</p></div>;
  }

  return (
    <div className="screen">
      <div className="control-bar">
        <div className="seg" role="group" aria-label="What to show">
          <button type="button" aria-pressed={view === 'league'} onClick={() => setView('league')}>
            {league.conference}
          </button>
          <button type="button" aria-pressed={view === 'region'} onClick={() => setView('region')}>
            Region
          </button>
        </div>
      </div>

      {view === 'league' && (
        <>
          <table className="table-lite table-standings">
            <thead>
              <tr><th>Standings</th><th>League</th><th>All</th></tr>
            </thead>
            <tbody>
              {league.teams.map((t) => (
                <tr key={t.name} className={t.name === league.team ? 'is-us' : undefined}>
                  <td>{t.name}</td>
                  <td>{t.leagueRecord.replace('-', '–')}</td>
                  <td>{t.overall.replace('-', '–')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {weeks.map((w) => (
            <div key={w.week}>
              <div className="group-head">Week {w.week} · {w.label}</div>
              {w.games.map((g) => (
                <div className={`lg-game${g.isLeagueGame ? '' : ' is-outside'}`} key={`${g.date}-${g.home}-${g.away}`}>
                  <span className="lg-side">{g.away}</span>
                  <span className="lg-score">{g.result ? g.result.away : '—'}</span>
                  <span className="lg-side">{g.home}</span>
                  <span className="lg-score">{g.result ? g.result.home : '—'}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {view === 'region' && (
        league.regionTable ? (
          <>
            <p className="filter-line">
              <span>Division {league.division}, Region {league.region} — {league.regionTable.caption}</span>
            </p>
            <table className="table-lite table-region">
              <thead>
                <tr><th>#</th><th>School</th><th>W–L</th><th>Avg</th></tr>
              </thead>
              <tbody>
                {league.regionTable.rows.map((r) => (
                  <tr key={r.teamId}
                      className={[r.school === league.team ? 'is-us' : '', r.qualifying ? 'is-in' : ''].filter(Boolean).join(' ') || undefined}>
                    <td>{r.rank}</td>
                    <td>{r.school}</td>
                    <td>{r.record.replace('-', '–')}</td>
                    <td>{r.average.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="empty-text">The playoff table isn’t available right now.</p>
        )
      )}
    </div>
  );
}
