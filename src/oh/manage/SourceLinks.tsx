import { useState, type ReactNode } from 'react';
import type { Preview } from '../../sync/run';
import type { SideState, SourceSide, SyncState } from '../../sync/types';
import { checkSource, setSources, syncNow, type RosterRow } from './adminApi';
import { calendarLinkProblem, calendarUrl, sheetLinkProblem, sideLine } from './sources';

type Links = { roster: string | null; schedule: string | null; filter: string | null };

/**
 * Where a saved activation's roster and schedule come from.
 *
 * While a link is set, the sheet or calendar owns that half: the paste boxes
 * above are hidden, and changing it means changing the source or unlinking.
 * Unlinking keeps whatever synced last, so a seller can take a roster back
 * without fans seeing it empty for a moment.
 */
export function Sources({
  row,
  onLinked,
  children,
}: {
  row: RosterRow;
  onLinked: (l: { roster: boolean; schedule: boolean }) => void;
  children: (blocks: { roster: ReactNode; schedule: ReactNode | null }) => ReactNode;
}) {
  const [links, setLinks] = useState<Links>({
    roster: row.roster_source_url ?? null,
    schedule: row.schedule_source_url ?? null,
    filter: row.schedule_source_filter ?? null,
  });
  const [state, setState] = useState<SyncState>(row.sync_state ?? {});

  const save = async (next: Links) => {
    await setSources({
      slug: row.school_slug,
      sport: row.sport,
      season: row.season,
      rosterUrl: next.roster,
      scheduleUrl: next.schedule,
      scheduleFilter: next.filter,
    });
    setLinks(next);
    // The database forgets a side's history when its link changes; so does this.
    setState((s) => ({
      roster: next.roster === links.roster ? s.roster : undefined,
      schedule: next.schedule === links.schedule && next.filter === links.filter ? s.schedule : undefined,
    }));
    onLinked({ roster: Boolean(next.roster), schedule: Boolean(next.schedule) });
  };

  const sync = async () => {
    const answer = await syncNow(row.school_slug, row.sport, row.season);
    setState(answer.state);
  };

  // Handed back as two pieces rather than drawn here: the sheet belongs in the
  // card's roster section and the calendar in its schedule section, but one
  // save carries both links, so their state has to live in one place.
  return children({
    roster: (
      <SourceBlock
        // Remounts across a link/unlink: otherwise the input's leftover url,
        // the stale Check-link preview, and an enabled "Link this …" button
        // from the old session would sit in front of the fresh paste box.
        key={links.roster ? 'roster-linked' : 'roster-unlinked'}
        kind="roster"
        sport={row.sport}
        season={row.season}
        linked={links.roster}
        filter={null}
        side={state.roster}
        onLink={async (url) => {
          await save({ ...links, roster: url });
          await sync();
        }}
        onUnlink={() => save({ ...links, roster: null })}
        onSync={sync}
      />
    ),
    schedule:
      row.sport !== 'football' ? (
        <SourceBlock
          key={links.schedule ? 'schedule-linked' : 'schedule-unlinked'}
          kind="schedule"
          sport={row.sport}
          season={row.season}
          linked={links.schedule}
          filter={links.filter}
          side={state.schedule}
          onLink={async (url, filter) => {
            await save({ ...links, schedule: url, filter });
            await sync();
          }}
          onUnlink={() => save({ ...links, schedule: null, filter: null })}
          onSync={sync}
        />
      ) : null,
  });
}

function SourceBlock(props: {
  kind: SourceSide;
  sport: string;
  season: number;
  linked: string | null;
  filter: string | null;
  side: SideState | undefined;
  onLink: (url: string, filter: string | null) => Promise<void>;
  onUnlink: () => Promise<void>;
  onSync: () => Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [filter, setFilter] = useState(props.filter ?? '');
  const [check, setCheck] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const noun = props.kind === 'roster' ? 'roster' : 'schedule';
  const source = props.kind === 'roster' ? 'Google Sheet' : 'calendar';

  if (props.linked) {
    return (
      <div className="mg-source">
        <p className="mg-hint">
            {noun === 'roster' ? 'Roster' : 'Schedule'} from a {source} · {sideLine(props.side, new Date())}
          </p>
        <span className="mg-hint">
          {props.linked}
          {props.filter && ` · only “${props.filter}”`}
        </span>
        <div className="mg-actions">
          <button type="button" className="mg-btn is-small" disabled={busy} onClick={() => run(props.onSync)}>
            {busy ? 'Working…' : 'Sync now'}
          </button>
          <button
            type="button"
            className="mg-btn is-small is-quiet"
            disabled={busy}
            title={`The last synced ${noun} stays on the page.`}
            onClick={() => run(props.onUnlink)}
          >
            Unlink
          </button>
        </div>
        {error && <p className="mg-error">{error}</p>}
      </div>
    );
  }

  const clean = props.kind === 'schedule' ? calendarUrl(url) : url.trim();
  const problem = clean
    ? props.kind === 'roster'
      ? sheetLinkProblem(clean)
      : calendarLinkProblem(clean)
    : null;
  const filterValue = filter.trim() || null;

  return (
    <div className="mg-source">
      <p className="mg-hint">Or link a {source}, and the {noun} keeps itself current</p>
      <input
        className="mg-input"
        type="url"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setCheck(null);
        }}
        placeholder={props.kind === 'roster' ? 'Published Google Sheet link (CSV)' : 'Calendar link (https:// or webcal://)'}
        aria-label={`${source} link`}
      />
      {props.kind === 'roster' && (
        <span className="mg-hint">
          In the sheet: File → Share → Publish to web → the roster tab → Comma-separated values (.csv) → Publish,
          then copy that link.
        </span>
      )}
      {props.kind === 'schedule' && (
        <input
          className="mg-input"
          type="text"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setCheck(null);
          }}
          placeholder="Only events containing… e.g. Volleyball (Girls V)"
          aria-label="Calendar filter"
        />
      )}
      {problem && <p className="mg-error">{problem}</p>}
      <button
        type="button"
        className="mg-btn is-small"
        disabled={busy || !clean || Boolean(problem)}
        onClick={() =>
          run(async () => {
            setCheck(await checkSource({ kind: props.kind, url: clean, filter: filterValue, season: props.season }));
          })
        }
      >
        {busy ? 'Working…' : 'Check link'}
      </button>
      {check && <CheckView check={check} />}
      {check?.ok && (
        <button
          type="button"
          className="mg-btn is-small is-primary"
          disabled={busy}
          onClick={() => run(() => props.onLink(clean, filterValue))}
        >
          Link this {source}
        </button>
      )}
      {error && <p className="mg-error">{error}</p>}
    </div>
  );
}

function CheckView({ check }: { check: Preview }) {
  if (!check.ok) return <p className="mg-error">Refused: {check.reason}.</p>;
  return (
    <>
      <p className="mg-hint">
          {check.players ? `${check.players.length} players read` : `${check.rows?.length ?? 0} games read`}
          {check.skipped > 0 && ` · ${check.skipped} events skipped`}
        </p>
      {check.warnings.length > 0 && (
        <div className="mg-skip">
          {check.warnings.map((w, i) => (
            <div className="mg-skip-row" key={i}>
              {w}
            </div>
          ))}
        </div>
      )}
      <div className="mg-review">
        {check.players?.slice(0, 60).map((p) => (
          <div className="mg-review-row" key={p.id}>
            <b>#{p.number}</b> {p.firstName} {p.lastName}
            <span className="mg-hint">
              {p.position}
              {p.grade && ` · ${p.grade}`}
            </span>
          </div>
        ))}
        {check.rows?.slice(0, 60).map((r, i) => (
          <div className="mg-review-row" key={i}>
            <b>{r.date}</b> · {r.home ? 'vs' : 'at'} {r.opponent}
            {r.time && <span className="mg-hint">{r.time}</span>}
          </div>
        ))}
      </div>
    </>
  );
}
