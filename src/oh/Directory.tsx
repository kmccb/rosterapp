import { useEffect, useMemo, useRef, useState } from 'react';
import type { School } from '../ohio/stateModel';
import { resolveLink, schoolParam } from './link';
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
  // A school link stays in the address bar for as long as that school is the
  // one on screen: "Add to Home Screen" saves whatever address the page is on,
  // and a phone that saved bare /oh/ opens the school picker for ever after —
  // an iPhone's home-screen app does not even share the browser's memory of
  // which school was chosen. It comes out the moment the reader follows a
  // different school, so a reload then does not snap back to the one on the
  // sign; and a link to a school the directory does not know comes out at once.
  const link = useRef(schoolParam(location.search));
  const [schools, setSchools] = useState<School[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [slug, setSlug] = useState<string | null>(() => (link.current ? null : chosenSlug()));

  // Only needed for the picker — or to check a school link against the
  // directory. A school already chosen goes straight to its own screen, which
  // fetches its season directly. Loading resumes the moment "Follow a
  // different school" clears the choice and slug goes back to null.
  useEffect(() => {
    if (slug !== null) return;
    loadIndex()
      .then((list) => {
        const pending = link.current;
        link.current = null;
        if (pending) {
          const target = resolveLink(pending, list, chosenSlug());
          if (target !== pending) history.replaceState(null, '', '/oh/');
          if (target) {
            if (target === pending) choose(target);
            setSlug(target);
            return;
          }
        }
        setSchools(list);
      })
      .catch(() => setFailed(true));
  }, [slug]);

  const allHits = useMemo(() => (schools ? searchSchools(schools, q) : []), [schools, q]);
  const hits = allHits.slice(0, 40);

  if (slug) {
    return (
      <SchoolScreen
        slug={slug}
        onChange={() => {
          if (schoolParam(location.search)) history.replaceState(null, '', '/oh/');
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

      {allHits.length > 40 && (
        <p className="filter-line">
          <span>{`Showing 40 of ${allHits.length} — keep typing`}</span>
        </p>
      )}

      <div className="fixtures">
        {hits.map((s) => (
          <button
            key={s.slug}
            type="button"
            className="fixture-row is-plain"
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
