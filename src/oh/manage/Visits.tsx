import { useEffect, useState } from 'react';
import { easternDay } from '../visits';
import { listVisits, type VisitDay } from './adminApi';
import { friendlyError } from './saveArgs';
import { longDate } from './schools';
import { summarizeVisits } from './visitSummary';

/**
 * How many phones opened this school's page — the number to bring to the AD.
 *
 * "Visitors" is a phone's first open of the day, so a week's figure is
 * phone-days: the same parent Friday and Saturday is two. "Opens" is every
 * load. Neither counts the seller's own browser or a phone with no signal, so
 * both are floors. Counting began with migration 0010; before it, nothing.
 */
export function Visits({ slug }: { slug: string }) {
  const [rows, setRows] = useState<VisitDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    listVisits(slug, 30)
      .then((r) => live && setRows(r))
      .catch((e) => live && setError(friendlyError(e)));
    return () => {
      live = false;
    };
  }, [slug]);

  const today = easternDay();
  const s = rows && summarizeVisits(rows, today);

  return (
    <section className="mg-card">
      <h2 className="mg-card-title">Visitors</h2>
      {error ? (
        <p className="mg-hint">
          Couldn’t read the counts ({error}). If it says the function can’t be found, migration 0010 isn’t applied yet.
        </p>
      ) : !s ? (
        <p className="mg-hint">Reading…</p>
      ) : (
        <>
          <div className="mg-visit-totals">
            {(
              [
                ['Today', s.today],
                ['Last 7 days', s.week],
                ['Last 30 days', s.month],
              ] as const
            ).map(([label, t]) => (
              <div key={label} className="mg-visit-total">
                <div className="mg-visit-num">{t.visitors.toLocaleString()}</div>
                <div className="mg-hint">
                  {label} · {t.opens.toLocaleString()} {t.opens === 1 ? 'open' : 'opens'}
                </div>
              </div>
            ))}
          </div>
          <div className="mg-visit-bars" role="img" aria-label="Visitors a day, the last 14 days">
            {s.days.map((d) => (
              <div
                key={d.day}
                className={`mg-visit-bar${d.day === today ? ' is-today' : ''}`}
                style={{ height: `${Math.max(2, (d.visitors / s.peak) * 100)}%` }}
                title={`${longDate(d.day)}: ${d.visitors} visitors, ${d.opens} opens`}
              />
            ))}
          </div>
          <p className="mg-hint">
            Visitors are phones, counted once a day; opens are every load. Your own signed-in browser and phones with no
            signal aren’t counted, so these are floors.
          </p>
        </>
      )}
    </section>
  );
}
