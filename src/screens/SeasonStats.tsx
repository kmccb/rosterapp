import { useEffect, useMemo, useState } from 'react';

type Stat = { label: string; value: string };
type Section = { name: string; label: string; stats: Stat[] };
type SeasonPlayer = { name: string; number: string; position: string; lines: Stat[] };
type Season = { year: number; record: string; categories: Section[]; players?: SeasonPlayer[] };

/** How many figures a block leads with before the rest go behind a tap. */
const LEAD = 4;

/** And how many go on a player's line, which is a line rather than a card. */
const PLAYER_LEAD = 3;

/**
 * The record, season by season.
 *
 * Two things people come here for and they are different questions: how the
 * team did, and what one player did. So they are two segments under one year,
 * rather than two hundred figures under headings nobody chose.
 */
export function SeasonStats({ base }: { base: string }) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [who, setWho] = useState('');
  const [view, setView] = useState<'team' | 'players'>('team');
  const [posOpen, setPosOpen] = useState(false);
  /** Which team blocks are showing everything they have. */
  const [open, setOpen] = useState<Record<string, boolean>>({});

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
    setPosOpen(false);
    setWho('');
    setOpen({});
  };

  /** Newest first, as the API returns them, so prev/next mean what they say. */
  const step = (by: number) => {
    const i = seasons?.findIndex((s) => s.year === year) ?? -1;
    const next = seasons?.[i + by];
    if (next) pickYear(next.year);
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

  const oldest = seasons[seasons.length - 1];
  const filtering = position !== null || who.trim() !== '';

  return (
    <div className="screen">
      {/*
        A year at a time with a step either side, rather than twenty-two chips
        in a strip you have to drag through to find 2009. The year you are
        looking at is the headline; the ones you aren't are one tap away.
      */}
      <div className="control-bar">
        <div className="control-row" style={{ alignItems: 'center' }}>
          <button
            type="button"
            className="pos-pill"
            onClick={() => step(1)}
            aria-label="Earlier season"
            disabled={!oldest || season.year === oldest.year}
          >
            ‹
          </button>
          <span className="season-banner">
            <span className="season-banner-year">{season.year}</span>
            {season.record && (
              <span className="season-banner-record">{season.record.replace('-', '–')}</span>
            )}
          </span>
          <button
            type="button"
            className="pos-pill"
            onClick={() => step(-1)}
            aria-label="Later season"
            disabled={season.year === seasons[0]?.year}
          >
            ›
          </button>
        </div>

        <div className="seg" role="group" aria-label="What to show">
          <button type="button" aria-pressed={view === 'team'} onClick={() => setView('team')}>
            The team
          </button>
          <button
            type="button"
            aria-pressed={view === 'players'}
            onClick={() => setView('players')}
          >
            The players
          </button>
        </div>
      </div>

      {view === 'team' &&
        season.categories.map((c) => (
          <section key={c.name} className="stat-block">
            <h3 className="stat-block-title">{c.label}</h3>
            <div className="card-lines">
              {c.stats.slice(0, LEAD).map((s) => (
                <div key={s.label} className="card-line">
                  <span className="card-line-value">{s.value}</span>
                  <span className="card-line-label">{s.label}</span>
                </div>
              ))}
            </div>
            {open[c.name] && (
              <dl className="stat-rest">
                {c.stats.slice(LEAD).map((s) => (
                  <div key={s.label}>
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {c.stats.length > LEAD && (
              <button
                type="button"
                className="more-link"
                aria-expanded={!!open[c.name]}
                onClick={() => setOpen((o) => ({ ...o, [c.name]: !o[c.name] }))}
              >
                {open[c.name] ? 'Fewer' : `${c.stats.length - LEAD} more`}
              </button>
            )}
          </section>
        ))}

      {view === 'players' &&
        (squad.length === 0 ? (
          <p className="hint">No player figures on record for {season.year}.</p>
        ) : (
          <>
            <div className="player-filters">
              <div className="control-row">
                <input
                  className="input search"
                  type="search"
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  placeholder="Name or number"
                  aria-label={`Search ${season.year} players`}
                />
                {positions.length > 1 && (
                  <button
                    type="button"
                    className="pos-pill"
                    aria-pressed={position !== null}
                    aria-expanded={posOpen}
                    onClick={() => setPosOpen((v) => !v)}
                  >
                    {position ?? 'Position'}
                  </button>
                )}
              </div>

              {posOpen && positions.length > 1 && (
                <div className="pos-chips" role="group" aria-label="Filter by position">
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

              <p className="filter-line">
                <span>{summariseSquad(position, who, players.length)}</span>
                {filtering && (
                  <button
                    type="button"
                    className="filter-clear"
                    onClick={() => {
                      setPosition(null);
                      setPosOpen(false);
                      setWho('');
                    }}
                  >
                    Clear
                  </button>
                )}
              </p>
            </div>

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
                    {/* Three figures fit on a line at this width; a fourth wraps
                        and turns a list into a wall. */}
                    <div className="player-stat-lines">
                      {p.lines.slice(0, PLAYER_LEAD).map((l, i) => (
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
        ))}
    </div>
  );
}

/** The same sentence the Team list uses, in the terms this screen filters on. */
const summariseSquad = (position: string | null, who: string, n: number) => {
  const named = [position, who.trim() && `“${who.trim()}”`].filter(Boolean);
  const noun = n === 1 ? 'player' : 'players';
  return named.length ? `${named.join(' · ')} — ${n} ${noun}` : `${n} ${noun}, by number`;
};
