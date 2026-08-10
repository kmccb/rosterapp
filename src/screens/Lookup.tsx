import { useEffect, useMemo, useState } from 'react';
import { Keypad } from '../components/Keypad';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerRow } from '../components/PlayerRow';
import { numberKey, numberMatches } from '../parse/rosterParse';
import type { StatsStore } from '../stats/statsStore';
import { bakedTeam } from '../theme/theme';
import type { Player, Roster } from '../types';

const REQUEST_TO = 'tom@scottforge.ai';

/**
 * Opens the reader's own mail app with the request already written.
 *
 * A form on the page would mean somebody approving strangers by hand, and a
 * list of names and addresses kept in the database. This asks for exactly the
 * same thing and stores nothing anywhere. The address of the page goes in the
 * body because it names the team exactly, whatever the team is called.
 */
const requestLink = (school: string): string => {
  const here = `${window.location.origin}${window.location.pathname}`;
  const subject = `Roster link — ${school}`;
  const body = [
    `Please could you send me the link to the ${school} roster?`,
    '',
    'My name:',
    '',
    here,
  ].join('\n');
  return `mailto:${REQUEST_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

type Props = {
  roster: Roster;
  onGoToImport: () => void;
  restoring?: boolean;
  stats?: StatsStore;
};

export function Lookup({ roster, onGoToImport, restoring = false, stats }: Props) {
  const [query, setQuery] = useState('');
  const [pinned, setPinned] = useState<Player | null>(null);
  const school = bakedTeam()?.school || roster.teamName || 'team';

  const matches = useMemo(() => {
    if (!query) return [];
    return roster.players
      .filter((p) => numberMatches(p.number, query))
      .sort((a, b) => {
        // Exact match first, then ascending by number.
        const aExact = numberKey(a.number) === numberKey(query) ? 0 : 1;
        const bExact = numberKey(b.number) === numberKey(query) ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return Number(numberKey(a.number) || 0) - Number(numberKey(b.number) || 0);
      });
  }, [roster.players, query]);

  // Any change to the query invalidates a pinned selection.
  useEffect(() => setPinned(null), [query]);

  // Physical keyboard, for using this on a laptop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) setQuery((q) => (q.length >= 3 ? q : q + e.key));
      else if (e.key === 'Backspace') setQuery((q) => q.slice(0, -1));
      else if (e.key === 'Escape') setQuery('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addDigit = (d: string) => setQuery((q) => (q.length >= 3 ? q : q + d));

  const featured = pinned ?? (matches.length === 1 ? matches[0] : null);

  return (
    <div className="lookup">
      <div className="results">
        {roster.players.length === 0 ? (
          // Someone who has used this for weeks shouldn't be told there's no
          // roster while we're in the middle of fetching theirs back.
          restoring ? (
            <div className="empty">
              <p className="empty-title">Getting the roster</p>
              <p className="empty-text">This phone had one saved. Fetching it again…</p>
            </div>
          ) : (
            <div className="empty">
              <p className="empty-title">No roster yet</p>
              {/*
                Two very different people land here, and for a while it only
                spoke to one of them. The coach setting up for the season comes
                once; everyone else arrived from a link, or typed the address
                having heard about it, and to them a screen offering to let them
                paste a roster reads as broken. So the request leads, and the
                setup door is the quiet one — it is still the only way in to
                Settings, so it can't be dropped.

                The share code is named on purpose too: this is also what a
                phone shows when iOS has cleared its storage, and in that state
                the code is the fastest way back.
              */}
              <p className="empty-text">
                This is the {school} roster. It opens from a link — ask for one, or enter the
                8-character code you were sent.
              </p>
              <div className="empty-actions">
                <a className="btn btn-primary" href={requestLink(school)}>
                  Ask for the link
                </a>
                <button type="button" className="btn" onClick={onGoToImport}>
                  I have a code, or the roster
                </button>
              </div>
            </div>
          )
        ) : featured ? (
          <PlayerCard
            player={featured}
            onBack={pinned && matches.length > 1 ? () => setPinned(null) : undefined}
            stats={stats}
          />
        ) : query ? (
          matches.length > 0 ? (
            <>
              <p className="results-count">
                {matches.length} players starting with {query}
              </p>
              <div className="rows">
                {matches.map((p) => (
                  <PlayerRow key={p.id} player={p} onSelect={() => setPinned(p)} />
                ))}
              </div>
            </>
          ) : (
            <div className="empty">
              <p className="empty-number">{query}</p>
              <p className="empty-text">Nobody on the roster wears that.</p>
            </div>
          )
        ) : (
          <div className="empty">
            <p className="empty-text">Tap a jersey number.</p>
            <p className="empty-hint">
              {roster.players.length} players
              {roster.teamName ? ` · ${roster.teamName}` : ''}
            </p>
          </div>
        )}
      </div>

      <Keypad
        onDigit={addDigit}
        onBackspace={() => setQuery((q) => q.slice(0, -1))}
        onClear={() => setQuery('')}
        canDelete={query.length > 0}
      />
    </div>
  );
}
