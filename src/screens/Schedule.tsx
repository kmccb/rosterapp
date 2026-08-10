import { useEffect, useMemo, useState } from 'react';
import { headToHead, nextGame, type Game } from '../schedule/icalParse';

type Season = { games: Game[]; history: Game[]; teamName?: string; fetched?: string };

/**
 * The season, and who's next.
 *
 * Built from the school's own calendar feed, so nobody keeps it up to date by
 * hand. The next fixture leads because that's the question anyone opening this
 * screen has; the rest of the season is underneath for looking ahead.
 */
export function Schedule({ base }: { base: string }) {
  const [season, setSeason] = useState<Season | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Precached, so this resolves from disk with no signal.
    fetch(`${base}schedule.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Season) => !cancelled && setSeason(data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [base]);

  const next = useMemo(() => (season ? nextGame(season.games) : undefined), [season]);

  if (failed) {
    return (
      <div className="screen">
        <p className="empty-text">No schedule for this team yet.</p>
      </div>
    );
  }

  if (!season) {
    return (
      <div className="screen">
        <p className="empty-text">Loading the schedule…</p>
      </div>
    );
  }

  const played = season.games.filter((g) => g.result && !g.scrimmage);
  const record = {
    won: played.filter((g) => g.result!.won).length,
    lost: played.filter((g) => !g.result!.won).length,
  };

  return (
    <div className="screen">
      {next && <NextGame game={next} history={season.history ?? []} />}

      <div className="season-head">
        <h2 className="section">Season</h2>
        {played.length > 0 && (
          <span className="season-record">
            {record.won}–{record.lost}
          </span>
        )}
      </div>

      <div className="fixtures">
        {season.games.map((g) => (
          <Fixture key={`${g.date}-${g.opponentKey}`} game={g} isNext={g === next} />
        ))}
      </div>
    </div>
  );
}

const WHEN = (game: Game): string => {
  // Prefer the exact kickoff and render it in the reader's own timezone; the
  // date alone was worked out on a build machine that may not share it.
  const when = game.kickoff ? new Date(game.kickoff) : new Date(`${game.date}T12:00:00`);
  return when.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const TIME = (game: Game): string =>
  game.kickoff
    ? new Date(game.kickoff).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';

function NextGame({ game, history }: { game: Game; history: Game[] }) {
  const h2h = headToHead(history, game.opponentKey);

  return (
    <section className="next-game">
      <p className="next-label">{game.scrimmage ? 'Next up · scrimmage' : 'Next up'}</p>
      <h2 className="next-opponent">
        <span className="next-vs">{game.home ? 'vs' : 'at'}</span> {game.opponent}
      </h2>
      <p className="next-when">
        {WHEN(game)}
        {TIME(game) && ` · ${TIME(game)}`}
        {game.occasion && ` · ${game.occasion}`}
      </p>

      {h2h.played > 0 ? (
        <div className="h2h">
          <p className="h2h-record">
            <strong>
              {h2h.won}–{h2h.lost}
            </strong>{' '}
            in the last {h2h.played} {h2h.played === 1 ? 'meeting' : 'meetings'}
          </p>
          <ul className="h2h-list">
            {h2h.meetings.slice(0, 5).map((m) => (
              <li key={m.date}>
                <span className={m.result!.won ? 'h2h-w' : 'h2h-l'}>
                  {m.result!.won ? 'W' : 'L'}
                </span>
                <span className="h2h-score">
                  {m.result!.us}–{m.result!.them}
                </span>
                <span className="h2h-when">
                  {m.home ? 'home' : 'away'} · {m.date.slice(0, 4)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="h2h-none">No previous meetings on record.</p>
      )}
    </section>
  );
}

function Fixture({ game, isNext }: { game: Game; isNext: boolean }) {
  return (
    <div className={`fixture${isNext ? ' is-next' : ''}${game.result ? ' is-played' : ''}`}>
      <span className="fixture-date">
        {new Date(game.kickoff ?? `${game.date}T12:00:00`).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        })}
      </span>
      <span className="fixture-team">
        <span className="fixture-ha">{game.home ? 'vs' : 'at'}</span> {game.opponent}
        {game.scrimmage && <span className="fixture-tag">scrimmage</span>}
      </span>
      <span className="fixture-result">
        {game.result ? (
          <>
            <span className={game.result.won ? 'h2h-w' : 'h2h-l'}>
              {game.result.won ? 'W' : 'L'}
            </span>{' '}
            {game.result.us}–{game.result.them}
          </>
        ) : (
          TIME(game)
        )}
      </span>
    </div>
  );
}
