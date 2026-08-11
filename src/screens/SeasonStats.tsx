import { useEffect, useMemo, useState } from 'react';

type Stat = { label: string; value: string };
type Category = { name: string; label: string; stats: Stat[] };
type SeasonPlayer = { name: string; number: string; position: string; lines: Stat[] };
type Season = { year: number; record: string; categories: Category[]; players?: SeasonPlayer[] };

/**
 * The record, season by season.
 *
 * Two decades of it, and around two hundred figures a year, which is far more
 * than anyone reads top to bottom. So the year leads, the record sits next to
 * it as the one number everybody wants, and the rest stays folded away by
 * category until somebody goes looking for it.
 */
export function SeasonStats({ base }: { base: string }) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [who, setWho] = useState('');

  useEffect(() => {
    let cancelled = false;

    // Network first, precache second — the current season changes weekly and
    // the worker's copy is a launch behind, but it is what works at a ground.
    const load = async (): Promise<{ seasons: Season[] }> => {
      try {
        const fresh = await fetch(`${base}seasons.json?t=${Date.now()}`, { cache: 'no-store' });
        if (fresh.ok) return await fresh.json();
      } catch {
        /* no signal */
      }
      const cached = await fetch(`${base}seasons.json`);
      if (!cached.ok) throw new Error(String(cached.status));
      return await cached.json();
    };

    load()
      .then((data) => {
        if (cancelled) return;
        setSeasons(data.seasons);
        setYear(data.seasons[0]?.year ?? null);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
    };
  }, [base]);

  const season = useMemo(
    () => seasons?.find((s) => s.year === year) ?? null,
    [seasons, year],
  );

  // Name, number or position — whichever someone happens to know.
  const players = useMemo(() => {
    const all = season?.players ?? [];
    const q = who.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q) ||
        p.number.includes(q),
    );
  }, [season, who]);

  if (failed) {
    return (
      <div className="screen">
        <p className="empty-text">No season records for this team yet.</p>
      </div>
    );
  }

  if (!seasons || !season) {
    return (
      <div className="screen">
        <p className="empty-text">Loading the record…</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="season-pick">
        <label className="season-year">
          <span className="visually-hidden">Season</span>
          <select
            className="season-select"
            value={season.year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              // A category left open under one year may not exist under
              // another, and an empty panel looks like a fault.
              setOpen(null);
              // The filter is almost always a name, and a name rarely spans
              // two decades — carrying it across would look like nobody played.
              setWho('');
            }}
          >
            {seasons.map((s) => (
              <option key={s.year} value={s.year}>
                {s.year}
              </option>
            ))}
          </select>
        </label>
        {season.record && <span className="season-record">{season.record.replace('-', '–')}</span>}
      </div>

      <h2 className="section">Team</h2>
      <p className="hint">
        {seasons[seasons.length - 1].year}–{seasons[0].year}. Tap a heading for the detail.
      </p>

      <div className="fixtures">
        {season.categories.map((c) => (
          <div className="fixture" key={c.name}>
            <button
              type="button"
              className="fixture-row cat-row"
              onClick={() => setOpen((cur) => (cur === c.name ? null : c.name))}
              aria-expanded={open === c.name}
            >
              <span className="cat-label">{c.label}</span>
              <span className="cat-count">{c.stats.length}</span>
              <span className="fixture-caret" aria-hidden="true" />
            </button>

            {open === c.name && (
              <dl className="cat-stats">
                {c.stats.map((s) => (
                  <div className="cat-stat" key={s.label}>
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>

      {(season.players?.length ?? 0) > 0 && (
        <>
          <div className="season-head">
            <h2 className="section">Players</h2>
            <span className="cat-count">
              {players.length === season.players!.length
                ? `${players.length}`
                : `${players.length} of ${season.players!.length}`}
            </span>
          </div>
          <input
            className="input search"
            type="search"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="Search name, position or number"
            aria-label={`Search ${season.year} players`}
          />

          {players.length === 0 ? (
            <p className="empty-text">Nobody by that name played in {season.year}.</p>
          ) : (
            <div className="fixtures">
              {players.map((p) => (
                <div className="player-stat" key={`${p.number}-${p.name}`}>
                  <div className="player-stat-who">
                    <span className="player-stat-number">{p.number || '—'}</span>
                    <span className="player-stat-name">{p.name}</span>
                    {p.position && <span className="player-stat-pos">{p.position}</span>}
                  </div>
                  {/* Two to four numbers each, so they are shown rather than
                      hidden behind a tap the way the team's two hundred are. */}
                  <div className="player-stat-lines">
                    {p.lines.map((l) => (
                      <span className="player-stat-line" key={l.label}>
                        <b>{l.value}</b> {l.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
