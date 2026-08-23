import { type RosterRow } from './adminApi';

/**
 * Task 4 stub — the form for creating/editing a roster.
 * Replaced in Task 4.
 */
export function Activate({ existing, onDone }: { existing: RosterRow | null; onDone: () => void }) {
  const slug = existing?.school_slug ?? 'new';
  return (
    <div className="screen">
      <h1 className="next-card-opponent">{slug}</h1>
      <button
        type="button"
        className="fixture-row is-plain"
        onClick={onDone}
      >
        <span className="fixture-team">Back</span>
      </button>
    </div>
  );
}
