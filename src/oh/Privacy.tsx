/**
 * The plain-language version of the design's privacy stance. This is the
 * page a parent, a coach, or a district's lawyer reads, so it says what is
 * true in sentences rather than clauses.
 */
export function Privacy() {
  return (
    <div className="screen oh-privacy">
      <h1 className="next-card-opponent">What this site knows, and doesn't</h1>

      <h2>Schedules and scores</h2>
      <p>
        Every school's schedule and scores come from publicly published results. Nothing about
        any student is involved.
      </p>

      <h2>Rosters</h2>
      <p>
        A roster appears here only when the school's athletic program asked for it and paid for
        it, and a person reviewed and published it — payment alone publishes nothing. It carries
        what the paper roster handed out at a game carries: jersey number, name, position,
        height, weight, and year in school. No photographs.
      </p>
      <p>
        A roster comes down when its season ends, when the school asks, or when we take it down —
        whichever happens first. Taking it down deletes it; nothing is kept behind the scenes.
      </p>

      <h2>You</h2>
      <p>
        Reading this site needs no account and creates none. Page views are counted without
        cookies and without anything that follows you between sites.
      </p>

      <h2>Questions, corrections, removals</h2>
      <p>
        <a href="mailto:tom@scottforge.ai">tom@scottforge.ai</a>. A removal request from a school
        is honored the day it arrives.
      </p>

      <p>
        <a href="/oh/">Back to the directory</a>
      </p>
    </div>
  );
}
