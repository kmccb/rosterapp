import { useEffect, useMemo, useState } from 'react';
import { SkyIcon } from '../components/SkyIcon';
import { daysToKickoff, headToHead, isDone, nextGame, type Game } from '../schedule/icalParse';
import { seasonRecord } from '../schedule/mergeResults';
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

  /*
   * One clock for the whole screen. The card, the countdown and the split
   * between what is coming and what has been played all read from it, so they
   * cannot end up disagreeing about whether Friday's game is over.
   */
  const now = useNow();

  /*
   * Scrimmages are dropped here rather than filtered out at the source, so the
   * feed's own account of the season stays intact in schedule.json. Nothing on
   * this screen wants them: they are not part of a record, nobody has a score
   * for them, and two of them sat at the top of the list all season.
   */
  const games = useMemo(() => (season?.games ?? []).filter((g) => !g.scrimmage), [season]);

  const next = useMemo(() => nextGame(games, now), [games, now]);
  const sections = useMemo(() => bySection(games, now), [games, now]);

  /*
   * Every meeting with a school, this season's included.
   *
   * history.json stops at the end of last season — it is a committed record,
   * not something the build appends to — so a game played this year was
   * missing from its own head-to-head. Four days after losing to Salem the
   * card under them still read 4-0.
   */
  const meetings = useMemo(
    () => [...(season?.history ?? []), ...games.filter((g) => g.result)],
    [season, games],
  );

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

  const record = seasonRecord(games);

  return (
    <div className="screen">
      {next && (
        <NextGame
          game={next}
          history={meetings}
          weather={season.weather}
          base={base}
          record={record}
          today={now}
        />
      )}

      <p className="filter-line">
        <span>
          {games.length} games
          {record.played > 0 && ` · ${record.won}–${record.lost}`} — tap one for the record against
          them
        </span>
      </p>

      <div className="fixtures">
        {sections.map((m) => (
          <div key={m.label}>
            <div className="group-head">{m.label}</div>
            {m.games.map((g) => {
              const id = `${g.date}-${g.opponentKey}`;
              return (
                <Fixture
                  key={id}
                  game={g}
                  isNext={g === next}
                  done={m.done}
                  history={meetings}
                  open={open === id}
                  onToggle={() => setOpen((cur) => (cur === id ? null : id))}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The season in two halves: what is left, and what has happened.
 *
 * Months were the grouping before, which put August at the top of the screen
 * all season and pushed the next game further down it every week. What anyone
 * opening this wants is the next game and the last result, so those are the
 * two things put nearest the top — coming up in the order they will be played,
 * played in the order they finished, most recent first. The two games either
 * side of tonight end up next to each other, which is the pair people are
 * actually comparing.
 *
 * Months do not survive a reversed half, so the row carries its own date now.
 */
const bySection = (
  games: Game[],
  now: Date,
): Array<{ label: string; done: boolean; games: Game[] }> => {
  const coming: Game[] = [];
  const played: Game[] = [];

  // parseIcal sorts by date, so `coming` comes out ascending for free and
  // `played` only has to be turned round.
  for (const g of games) (isDone(g, now) ? played : coming).push(g);

  return [
    { label: 'Coming up', done: false, games: coming },
    { label: 'Played', done: true, games: played.reverse() },
  ].filter((s) => s.games.length > 0);
};

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

/** Just the record, for the card. The meetings themselves stay on tap. */
const recordAgainst = (history: Game[], opponentKey: string): string | null => {
  const h = headToHead(history, opponentKey);
  return h.played === 0 ? null : `${h.won}–${h.lost}`;
};

/**
 * The record against one opponent, and every meeting behind it.
 *
 * Opened from a fixture in the list, which is now the only place it appears:
 * the card at the top of the screen carries the record as a single figure, so
 * this is what you get when that figure is the thing you want to look into.
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

/**
 * The next fixture, as a card.
 *
 * It used to print the whole head-to-head underneath, which pushed the season
 * itself off the screen for a record most people only glance at. The record is
 * one figure in the foot now; every meeting behind it is still a tap away on
 * the fixture in the list.
 */
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * Today, and again tomorrow.
 *
 * A countdown worked out once at render is a day behind by morning, and this
 * is an app people leave open — installed to a home screen, put in a pocket at
 * a ground, opened again the next evening. So the day is state, and it turns
 * over on its own.
 *
 * Timed to the next midnight and checked again whenever the page comes back to
 * the front, because a sleeping phone does not run timers on schedule and the
 * wake-up is the moment that actually matters. Both routes hand back the same
 * Date object when the day has not changed, so React drops the re-render and
 * the ordinary case costs nothing.
 */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    /*
     * Coming back to the front always re-reads the clock, and no longer only
     * when the date has changed. A game finishing at ten on a Friday night is
     * the moment this screen most needs to move on, and that is two hours
     * before the day turns over — a phone taken out of a pocket at the final
     * whistle would otherwise still be counting down to a game that is over.
     *
     * It costs a render per foreground, which for a list this size is nothing.
     */
    const wake = () => setNow(new Date());
    // And a day that turns over while the screen is being looked at.
    const turn = () => setNow((prev) => (sameDay(prev, new Date()) ? prev : new Date()));

    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    // A second past, so the clock has definitely turned when this fires.
    const id = setTimeout(turn, midnight.getTime() - now.getTime() + 1000);
    document.addEventListener('visibilitychange', wake);

    return () => {
      clearTimeout(id);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [now]);

  return now;
}

/**
 * The wait, counted down.
 *
 * Days rather than a running clock: nobody plans around the hours, and a
 * ticking number would be wrong the moment the phone went in a pocket. On the
 * day itself the count stops being the point, so the badge comes out and the
 * card says so.
 */
function Countdown({ game, base, today }: { game: Game; base: string; today: Date }) {
  const days = daysToKickoff(game, today);
  if (days === null) return null;

  if (days === 0) {
    return (
      <span className="countdown is-gameday">
        {/* Decoration beside a sentence that already says it — a badge that
            never arrives leaves the words doing the job on their own. */}
        <img
          className="countdown-badge"
          src={`${base}badge.jpg`}
          alt=""
          aria-hidden="true"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        It&rsquo;s game day!
      </span>
    );
  }

  return (
    <span className="countdown">
      <b>{days}</b> {days === 1 ? 'day' : 'days'} until game day
    </span>
  );
}

function NextGame({
  game,
  history,
  weather,
  base,
  record,
  today,
}: {
  game: Game;
  history: Game[];
  weather?: Weather;
  base: string;
  record: { won: number; lost: number; played: number };
  today: Date;
}) {
  const allTime = recordAgainst(history, game.opponentKey);
  const isGameDay = daysToKickoff(game, today) === 0;

  return (
    <section className={`next-card${isGameDay ? ' is-gameday' : ''}`}>
      <div className="next-card-head">
        <p className="next-card-label">Next up</p>
        <Countdown game={game} base={base} today={today} />
      </div>
      <h2 className="next-card-opponent">
        <span className="next-vs">{game.home ? 'vs' : 'at'}</span> {game.opponent}
      </h2>

      {/* The season so far, beside who is next. Before the first game there is
          no record to print and a bare 0–0 would only take up the room. */}
      {record.played > 0 && (
        <p className="next-record">
          <b>
            {record.won}–{record.lost}
          </b>{' '}
          <span>this season</span>
        </p>
      )}

      <p className="next-when">
        {WHEN(game)}
        {TIME(game) && ` · ${TIME(game)}`}
        {game.occasion && ` · ${game.occasion}`}
      </p>

      {(weather || allTime) && (
        <div className="next-card-foot">
          {weather && <Forecast weather={weather} />}
          {allTime && (
            <span>
              <b>{allTime}</b> all-time
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function Fixture({
  game,
  isNext,
  done,
  history,
  open,
  onToggle,
}: {
  game: Game;
  isNext: boolean;
  /** In the played half, so a kickoff time is no longer the useful thing. */
  done: boolean;
  history: Game[];
  open: boolean;
  onToggle: () => void;
}) {
  /*
   * The row carries its own month now. The header above it says "Coming up" or
   * "Played" rather than a month, and in the played half the dates run
   * backwards, so a September row can sit directly under an October one.
   */
  const when = new Date(game.kickoff ?? `${game.date}T12:00:00`);
  const day = when.toLocaleDateString(undefined, { day: 'numeric' });
  const month = when.toLocaleDateString(undefined, { month: 'short' });

  // Whatever the school called the night, and failing that where it is played.
  const sub = game.occasion ?? (game.home ? 'Home' : 'Away');

  return (
    <div className={`fixture${isNext ? ' is-next' : ''}${game.result ? ' is-played' : ''}`}>
      <button type="button" className="fixture-row" onClick={onToggle} aria-expanded={open}>
        <span className="fixture-date">
          <span className="fixture-month">{month}</span>
          {day}
        </span>
        <span className="fixture-team">
          <span className="fixture-ha">{game.home ? 'vs' : 'at'}</span> {game.opponent}
          <span className="fixture-sub">{sub}</span>
        </span>
        {/*
          The score once there is one, and the kickoff time until then. A game
          that has been played and has no score gets neither — the league has
          not posted it yet, and last Friday's kickoff time is not what anyone
          is looking for.
        */}
        <span className="fixture-result">
          {game.result ? (
            <>
              <span className={`form-chip ${game.result.won ? 'won' : 'lost'}`}>
                {game.result.won ? 'W' : 'L'}
              </span>{' '}
              {game.result.us}–{game.result.them}
            </>
          ) : (
            !done && TIME(game)
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
