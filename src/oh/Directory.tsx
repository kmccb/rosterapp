import { useEffect, useMemo, useState } from 'react';
import type { School } from '../ohio/stateModel';
import { choose, chosenSlug, forget, loadIndex, searchSchools } from './store';
import { School as SchoolScreen } from './School';

/**
 * Every school in Ohio, and the one you follow.
 *
 * The picker is the first run and then gets out of the way — somebody opening
 * this at their own child's game wants the game, not a search box. Changing
 * school stays one tap away, because families follow more than one.
 */
export function Directory() {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [slug, setSlug] = useState<string | null>(() => chosenSlug());

  useEffect(() => {
    loadIndex()
      .then(setSchools)
      .catch(() => setFailed(true));
  }, []);

  const hits = useMemo(() => (schools ? searchSchools(schools, q).slice(0, 40) : []), [schools, q]);

  if (slug) {
    return (
      <SchoolScreen
        slug={slug}
        onChange={() => {
          forget();
          setSlug(null);
          setQ('');
        }}
      />
    );
  }

  if (failed) {
    return (
      <div className="screen">
        <p className="empty-text">Couldn't load the list of schools. Try again with a signal.</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <h1 className="next-card-opponent">Find your school</h1>
      <p className="filter-line">
        <span>{schools ? `${schools.length} Ohio teams` : 'Loading…'}</span>
      </p>

      <input
        className="search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="School or town"
        autoComplete="off"
        aria-label="Search for a school"
      />

      <div className="fixtures">
        {hits.map((s) => (
          <button
            key={s.slug}
            type="button"
            className="fixture-row"
            onClick={() => {
              choose(s.slug);
              setSlug(s.slug);
            }}
          >
            <span className="fixture-team">
              {s.name}
              {/* The town always shows. Three schools are called Jackson and a
                  reader who does not know that cannot know when it matters. */}
              <span className="fixture-sub">{s.city}</span>
            </span>
          </button>
        ))}
        {q.trim() && !hits.length && <p className="empty-text">No school by that name.</p>}
      </div>
    </div>
  );
}
