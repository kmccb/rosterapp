import { useEffect, useMemo, useState } from 'react';
import { SkyIcon } from '../components/SkyIcon';
import { headToHead, nextGame, type Game } from '../schedule/icalParse';
import { describeSky, worthMentioning, type Weather } from '../schedule/weather';

type Season = {
  games: Game[];
  history: Game[];
  teamName?: string;
  /** Kickoff forecast for the next game, when the build could get one. */
  weather?: Weather;
  fetched?: string;
};

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
  /*
   * Which fixture is showing its record. One at a time: on a phone the list is
   * most of the screen, and two open panels push the rest of the season out of
   * sight for no gain — nobody compares two of these side by side.
   */
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    /*
     * Network first, then the precache.
     *
     * This is the one file that changes between deploys — scores after a game,
     * the forecast every few hours — and the precached copy only rolls over
     * when a new service worker installs and activates, which is a launch or
     * more behind. The query is what gets past it: the precache route matches
     * on the exact URL, so a request carrying one goes to the network.
     *
     * The plain address is the fallback, and that one the worker does answer,
     * so a ground with no signal still gets the schedule.
     */
    const load = async (): Promise<Season> => {
      try {
        const fresh = await fetch(`${base}schedule.json?t=${Date.now()}`, { cache: 'no-store' });
        if (fresh.ok) return (await fresh.json()) as Season;
      } catch {
        // No signal, which is the normal case at a ground.
      }
      const cached = await fetch(`${base}schedule.json`);
      if (!cached.ok) throw new Error(String(cached.status));
      return (await cached.json()) as Season;
    };

    load()
      .then((data) => !cancelled && setSeason(data))
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

  const history = season.history ?? [];
  const played = season.games.filter((g) => g.result && !g.scrimmage);
  const record = {
    won: played.filter((g) => g.result!.won).length,
    lost: played.filter((g) => !g.result!.won).length,
  };

  return (
    <div className="screen">
      {next && <NextGame game={next} history={history} weather={season.weather} />}

      <div className="season-head">
        <h2 className="section">Season</h2>
        {played.length > 0 && (
          <span className="season-record">
            {record.won}–{record.lost}
          </span>
        )}
      </div>
      <p className="hint">Tap any game for the record against them.</p>

      <div className="fixtures">
        {season.games.map((g) => {
          const id = `${g.date}-${g.opponentKey}`;
          return (
            <Fixture
              key={id}
              game={g}
              isNext={g === next}
              history={history}
              open={open === id}
              onToggle={() => setOpen((cur) => (cur === id ? null : id))}
            />
          );
        })}
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

/**
 * The record against one opponent, and how the last few went.
 *
 * Shared by the next fixture and by any game opened in the list, so the thing
 * you get for tapping a game in October is the thing you already trust from the
 * top of the screen.
 */
function HeadToHead({ history, opponentKey }: { history: Game[]; opponentKey: string }) {
  const h2h = headToHead(history, opponentKey);

  if (h2h.played === 0) {
    return <p className="h2h-none">No previous meetings on record.</p>;
  }

  const since = h2h.meetings[h2h.meetings.length - 1]?.date.slice(0, 4);

  /*
   * Every meeting, everywhere this appears. A record line claiming fifteen
   * meetings above a list of five reads as the whole story and isn't — and a
   * rivalry's older results are exactly what someone opens this to find.
   */
  return (
    <div className="h2h">
      <p className="h2h-record">
        <strong>
          {h2h.won}–{h2h.lost}
        </strong>{' '}
        in {h2h.played} {h2h.played === 1 ? 'meeting' : 'meetings'}
        {since && h2h.played > 1 ? ` since ${since}` : ''}
      </p>
      <ul className="h2h-list">
        {h2h.meetings.map((m) => (
          <li key={m.date}>
            <span className={m.result!.won ? 'h2h-w' : 'h2h-l'}>{m.result!.won ? 'W' : 'L'}</span>
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
  );
}

/**
 * What it will be like to stand there.
 *
 * Only the temperature is always shown. Rain gets a line when there is enough
 * chance of it to change what you bring, and wind only when it is enough to
 * feel — a forecast that lists every number for a still, dry evening is just
 * noise above the thing people opened this screen for.
 */
function Forecast({ weather }: { weather: Weather }) {
  const notes = [
    worthMentioning(weather.precipChance) ? `${weather.precipChance}% rain` : null,
    weather.windMph >= 12 ? `${weather.windMph} mph wind` : null,
  ].filter(Boolean);

  return (
    <p className="forecast">
      <SkyIcon code={weather.code} day={weather.day} />
      <span className="forecast-temp">{weather.tempF}°</span>
      <span className="forecast-sky">{describeSky(weather.code)}</span>
      {notes.length > 0 && <span className="forecast-note">{notes.join(' · ')}</span>}
    </p>
  );
}

function NextGame({
  game,
  history,
  weather,
}: {
  game: Game;
  history: Game[];
  weather?: Weather;
}) {
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

      {weather && <Forecast weather={weather} />}

      <HeadToHead history={history} opponentKey={game.opponentKey} />
    </section>
  );
}

function Fixture({
  game,
  isNext,
  history,
  open,
  onToggle,
}: {
  game: Game;
  isNext: boolean;
  history: Game[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`fixture${isNext ? ' is-next' : ''}${game.result ? ' is-played' : ''}`}>
      <button type="button" className="fixture-row" onClick={onToggle} aria-expanded={open}>
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
        <span className="fixture-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixture-h2h">
          <HeadToHead history={history} opponentKey={game.opponentKey} />
        </div>
      )}
    </div>
  );
}
