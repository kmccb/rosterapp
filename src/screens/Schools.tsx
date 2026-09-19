import { useEffect, useState } from 'react';
import { describeGame, recordOf, searchSchools } from '../league/schools';
import type { School, SchoolSeason } from '../ohio/stateModel';

/*
 * Any Ohio school's season, from the directory the site already publishes.
 *
 * Two files, fetched when needed and never precached: the index of every
 * school, once per session, and one small season file per school opened.
 * Away from a signal this view says so and does nothing clever — the
 * directory is deliberately kept off the phone, and a search box that lists
 * names it cannot open would be worse than the sentence.
 *
 * The query and the chosen school belong to the League screen, not here, so
 * a switch to Region and back lands on the same school.
 */

type Props = {
  query: string;
  onQuery: (q: string) => void;
  slug: string | null;
  onSlug: (s: string | null) => void;
};

const NEEDS_SIGNAL = 'Looking up a school needs a signal.';

/*
 * One fetch of the index per session. Held as the promise rather than the
 * result so two quick mounts share a request, and dropped on failure so
 * leaving the view and coming back tries again.
 */
let indexPromise: Promise<School[]> | null = null;

const loadIndex = (): Promise<School[]> => {
  if (!indexPromise) {
    indexPromise = fetch('/oh/index.json')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { schools?: School[] }) => {
        if (!Array.isArray(data.schools)) throw new Error('no schools');
        return data.schools;
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
};

const loadSeason = async (slug: string): Promise<SchoolSeason> => {
  const res = await fetch(`/oh/data/${slug}.json`);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

export function Schools({ query, onQuery, slug, onSlug }: Props) {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const [season, setSeason] = useState<SchoolSeason | null>(null);
  const [seasonFailed, setSeasonFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadIndex()
      .then((list) => !cancelled && setSchools(list))
      .catch(() => !cancelled && setIndexFailed(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!slug) {
      setSeason(null);
      setSeasonFailed(false);
      return;
    }
    let cancelled = false;
    setSeason(null);
    setSeasonFailed(false);
    loadSeason(slug)
      .then((s) => !cancelled && setSeason(s))
      .catch(() => !cancelled && setSeasonFailed(true));
    return () => { cancelled = true; };
  }, [slug]);

  if (slug) {
    return (
      <>
        <p className="filter-line">
          <button type="button" className="link-btn" onClick={() => onSlug(null)}>
            ‹ Back
          </button>
        </p>

        {seasonFailed && <p className="empty-text">{NEEDS_SIGNAL}</p>}
        {!seasonFailed && !season && <p className="empty-text">Loading…</p>}

        {season && (
          <>
            <div className="group-head">
              {season.school.name} · {season.school.city} · {recordOf(season)}
            </div>
            {season.games.length === 0 && (
              <p className="empty-text">No games listed for this school yet.</p>
            )}
            {season.games.map((g) => {
              const row = describeGame(g);
              return (
                <div className="lg-game" key={`${g.week}-${g.date}-${g.opponent}`}>
                  <span className="lg-side">
                    {row.week} · {row.date} ·{' '}
                    {g.opponentSlug ? (
                      <button type="button" className="link-btn" onClick={() => onSlug(g.opponentSlug)}>
                        {row.opponent}
                      </button>
                    ) : (
                      row.opponent
                    )}
                  </span>
                  <span className="lg-score">{row.result}</span>
                </div>
              );
            })}
          </>
        )}
      </>
    );
  }

  if (indexFailed) {
    return <p className="empty-text">{NEEDS_SIGNAL}</p>;
  }

  const matches = schools ? searchSchools(schools, query) : [];

  return (
    <>
      <div className="control-row">
        <input
          className="input search"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="School or town"
          aria-label="Find a school"
        />
      </div>
      {!schools && !indexFailed && <p className="empty-text">Loading…</p>}
      {matches.length > 0 && (
        <div className="rows">
          {matches.map((s) => (
            <button type="button" className="row" key={s.slug} onClick={() => onSlug(s.slug)}>
              {s.name} · {s.city}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
