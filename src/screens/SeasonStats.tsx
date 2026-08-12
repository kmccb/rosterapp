import { useEffect, useMemo, useRef, useState } from 'react';

type Stat = { label: string; value: string };
type Section = { name: string; label: string; stats: Stat[] };
type SeasonPlayer = { name: string; number: string; position: string; lines: Stat[] };
type Season = { year: number; record: string; categories: Section[]; players?: SeasonPlayer[] };

/**
 * The record, season by season.
 *
 * Two things people come here for and they are different questions: how the
 * team did, and what one player did. So they are two sections under one year,
 * rather than two hundred figures under headings nobody chose.
 */
export function SeasonStats({ base }: { base: string }) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [who, setWho] = useState('');
  const strip = useRef<HTMLDivElement>(null);

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

  const season = useMemo(() => seasons?.find((s) => s.year === year) ?? null, [seasons, year]);
  const squad = useMemo(() => season?.players ?? [], [season]);

  /** Only positions somebody actually played that year. */
  const positions = useMemo(
    () => [...new Set(squad.map((p) => p.position).filter(Boolean))].sort(),
    [squad],
  );

  const players = useMemo(() => {
    const q = who.trim().toLowerCase();
    return squad.filter((p) => {
      if (position && p.position !== position) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.number.includes(q);
    });
  }, [squad, position, who]);

  const pickYear = (next: number) => {
    setYear(next);
    // A position or a name rarely spans two decades, and carrying either
    // across would make a season look empty when it isn't.
    setPosition(null);
    setWho('');
  };

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
      {/*
        A strip rather than a dropdown: twenty-one years is few enough to slide
        through with a thumb, and it looks like the rest of the app instead of
        like the operating system.
      */}
      <div className="years" ref={strip} role="group" aria-label="Season">
        {seasons.map((s) => (
          <button
            key={s.year}
            type="button"
            className={`chip year-chip${s.year === season.year ? ' active' : ''}`}
            onClick={(e) => {
              pickYear(s.year);
              e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center' });
            }}
            aria-pressed={s.year === season.year}
          >
            {s.year}
          </button>
        ))}
      </div>

      <div className="season-banner">
        <span className="season-banner-year">{season.year}</span>
        {season.record && (
          <span className="season-banner-record">{season.record.replace('-', '–')}</span>
        )}
      </div>

      <h2 className="section">Team</h2>
      {season.categories.map((c) => (
        <section key={c.name} className="stat-block">
          <h3 className="stat-block-title">{c.label}</h3>
          <div className="card-lines">
            {c.stats.map((s) => (
              <div key={s.label} className="card-line">
                <span className="card-line-value">{s.value}</span>
                <span className="card-line-label">{s.label}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="season-head">
        <h2 className="section">Players</h2>
        <span className="cat-count">
          {players.length === squad.length ? squad.length : `${players.length} of ${squad.length}`}
        </span>
      </div>

      {squad.length === 0 ? (
        <p className="hint">No player figures on record for {season.year}.</p>
      ) : (
        <>
          {positions.length > 1 && (
            <div className="chips" role="group" aria-label="Filter by position">
              <button
                type="button"
                className={`chip${position === null ? ' active' : ''}`}
                onClick={() => setPosition(null)}
                aria-pressed={position === null}
              >
                All
              </button>
              {positions.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  className={`chip${position === pos ? ' active' : ''}`}
                  onClick={() => setPosition(pos)}
                  aria-pressed={position === pos}
                >
                  {pos}
                </button>
              ))}
            </div>
          )}

          <input
            className="input search"
            type="search"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="Search by name or number"
            aria-label={`Search ${season.year} players`}
          />

          {players.length === 0 ? (
            <p className="empty-text">Nobody matches that in {season.year}.</p>
          ) : (
            <div className="fixtures">
              {players.map((p) => (
                <div className="player-stat" key={`${p.number}-${p.name}`}>
                  <div className="player-stat-who">
                    <span className="player-stat-number">{p.number || '—'}</span>
                    <span className="player-stat-name">{p.name}</span>
                    {p.position && <span className="player-stat-pos">{p.position}</span>}
                  </div>
                  {/* A handful of numbers each, so they are shown rather than
                      hidden behind a tap. */}
                  <div className="player-stat-lines">
                    {p.lines.map((l, i) => (
                      <span className="player-stat-line" key={`${l.label}-${i}`}>
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
