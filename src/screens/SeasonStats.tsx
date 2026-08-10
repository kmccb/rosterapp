import { useEffect, useMemo, useState } from 'react';

type Stat = { label: string; value: string };
type Category = { name: string; label: string; stats: Stat[] };
type Season = { year: number; record: string; categories: Category[] };

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
    </div>
  );
}
