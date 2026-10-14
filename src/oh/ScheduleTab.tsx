/*
 * A paid school's football schedule, laid out the way Poland's is.
 *
 * Poland's screen lives in src/screens/Schedule.tsx, which nothing under
 * src/oh/ may import (it is the root app's runtime, and the root app's pages
 * are guarded byte for byte). So its pieces — the Next up card, the countdown,
 * the forecast, the fixtures that open onto a head-to-head — are written out
 * again here, the way src/oh/look.ts duplicates the theme's color math. The
 * classes are Poland's own, already in this bundle through ../styles.css, so
 * the two screens can't look different without one of them saying so.
 *
 * The arithmetic is in scheduleView.ts, where it is tested.
 */

import { useEffect, useMemo, useState } from 'react';
import { SkyIcon } from '../components/SkyIcon';
import { daysToKickoff, type Game } from '../schedule/icalParse';
import { describeSky, worthMentioning } from '../schedule/weather';
import type { SchoolSeason } from '../ohio/stateModel';
import { loadHistory, outcome, type Outcome, type SchoolHistory } from './history';
import type { FixtureWeather } from './store';
import {
  allTimeRecord,
  asFixtures,
  forecastFor,
  meetingsLine,
  meetingsWith,
  nextFixture,
  recordOf,
  recordText,
  scheduleSections,
  summaryLine,
  type Fixture,
  type Tally,
} from './scheduleView';

/*
 * A tie gets its own letter and a neutral chip: drawn as a loss it would be a
 * small lie on the very line people open to settle an argument.
 */
const CHIP: Record<Outcome, string> = { W: 'won', L: 'lost', T: 'oh-tied' };
const LETTER: Record<Outcome, string> = {
  W: 'h2h-w',
  L: 'h2h-l',
  T: 'oh-h2h-t',
};

/*
 * Past seasons don't change while a page is open, so a school's file is asked
 * for once per visit rather than every time the tab is opened. Only a file
 * that arrived is kept: a failed fetch on a bad signal gets another go the
 * next time the tab is shown.
 */
const keptHistory = new Map<string, SchoolHistory>();

export function ScheduleTab({
  slug,
  season,
  weather,
  crest,
}: {
  slug: string;
  season: SchoolSeason;
  weather: FixtureWeather | null;
  /** The school's crest, which stands in for Poland's badge on game day. */
  crest: string | null;
}) {
  // Fetched here, when the tab is shown, and not with the page: most visits
  // never open the Schedule tab, and none of the others need the file.
  const [history, setHistory] = useState<SchoolHistory | null>(() => keptHistory.get(slug) ?? null);
  useEffect(() => {
    const kept = keptHistory.get(slug);
    setHistory(kept ?? null);
    if (kept) return;
    let current = true;
    loadHistory(slug).then((h) => {
      if (!h) return;
      keptHistory.set(slug, h);
      if (current) setHistory(h);
    });
    return () => {
      current = false;
    };
  }, [slug]);

  // One at a time, as on Poland's: two open panels push the rest of the season
  // off a phone's screen for no gain.
  const [open, setOpen] = useState<string | null>(null);
  const now = useNow();

  const fixtures = useMemo(() => asFixtures(season.games), [season]);
  const next = useMemo(() => nextFixture(fixtures, now), [fixtures, now]);
  const sections = useMemo(() => scheduleSections(fixtures, now), [fixtures, now]);

  return (
    <>
      {next && (
        <NextGame
          game={next}
          record={recordOf(fixtures)}
          weather={forecastFor(weather, next)}
          allTime={allTimeRecord(history, season.games, next.opponentKey)}
          crest={crest}
          today={now}
        />
      )}

      <p className="filter-line">
        <span>{summaryLine(fixtures)}</span>
      </p>

      <div className="fixtures">
        {sections.map((s) => (
          <div key={s.label}>
            <div className="group-head">{s.label}</div>
            {s.games.map((g) => {
              const id = `${g.date}-${g.opponentKey}`;
              const h2h = meetingsWith(history, season.games, g.opponentKey);
              return (
                <FixtureRow
                  key={id}
                  game={g}
                  isNext={g === next}
                  done={s.done}
                  h2h={h2h}
                  // With a history file a row always opens, and says so when
                  // there have been no meetings, as Poland's does. Without one
                  // it opens only onto this season's own meetings, and a row
                  // with none has nothing to show and so no caret.
                  expandable={history !== null || h2h.played > 0}
                  open={open === id}
                  onToggle={() => setOpen((cur) => (cur === id ? null : id))}
                />
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

const WHEN = (game: Game): string =>
  new Date(game.kickoff ?? `${game.date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

const TIME = (game: Game): string =>
  game.kickoff
    ? new Date(game.kickoff).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

/*
 * Today, and again tomorrow — Poland's useNow. A countdown worked out once is a
 * day behind by morning on a page left open in a pocket, so the day is state:
 * it turns over at midnight and is re-read whenever the page comes back to the
 * front, which is the moment a sleeping phone actually needs it.
 */
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const wake = () => setNow(new Date());
    const turn = () => setNow((prev) => (sameDay(prev, new Date()) ? prev : new Date()));
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const id = setTimeout(turn, midnight.getTime() - now.getTime() + 1000);
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearTimeout(id);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [now]);
  return now;
}

/*
 * Sky, temperature, and only the rain or wind worth mentioning — a forecast
 * listing every number for a still, dry evening is noise above the game.
 */
function Forecast({ weather }: { weather: FixtureWeather }) {
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

/*
 * Days rather than a running clock: nobody plans around the hours. On the day
 * itself the count stops being the point, and the school's crest comes out
 * where Poland's badge does.
 */
function Countdown({ game, crest, today }: { game: Game; crest: string | null; today: Date }) {
  const days = daysToKickoff(game, today);
  if (days === null) return null;

  if (days === 0) {
    return (
      <span className="countdown is-gameday">
        {/* Decoration beside a sentence that already says it, so a school
            with no crest yet loses nothing but the picture. */}
        {crest && (
          <img
            className="countdown-badge oh-countdown-crest"
            src={crest}
            alt=""
            aria-hidden="true"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
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
  record,
  weather,
  allTime,
  crest,
  today,
}: {
  game: Fixture;
  record: Tally;
  weather: FixtureWeather | null;
  allTime: string | null;
  crest: string | null;
  today: Date;
}) {
  const isGameDay = daysToKickoff(game, today) === 0;
  const time = TIME(game);

  return (
    <section className={`next-card${isGameDay ? ' is-gameday' : ''}`}>
      <div className="next-card-head">
        <p className="next-card-label">Next up</p>
        <Countdown game={game} crest={crest} today={today} />
      </div>
      <h2 className="next-card-opponent">
        <span className="next-vs">{game.home ? 'vs' : 'at'}</span> {game.opponent}
      </h2>

      {/* Before the first game there is no record, and a bare 0–0 would only
          take up the room. */}
      {record.played > 0 && (
        <p className="next-record">
          <b>{recordText(record)}</b> <span>this season</span>
        </p>
      )}

      <p className="next-when">
        {WHEN(game)}
        {time && ` · ${time}`}
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

function HeadToHead({ h2h }: { h2h: ReturnType<typeof meetingsWith> }) {
  const line = meetingsLine(h2h);
  if (!line) return <p className="h2h-none">No previous meetings on record.</p>;

  // Every meeting, not the last few: a record line claiming twelve meetings
  // above a list of five reads as the whole story and isn't.
  return (
    <div className="h2h">
      <p className="h2h-record">
        <strong>{line.record}</strong> {line.rest}
      </p>
      <ul className="h2h-list">
        {h2h.meetings.map((m) => {
          const o = outcome(m)!;
          return (
            <li key={m.date}>
              <span className={LETTER[o]}>{o}</span>
              <span className="h2h-score">
                {m.result!.us}–{m.result!.them}
              </span>
              <span className="h2h-when">
                {m.home ? 'home' : 'away'} · {m.date.slice(0, 4)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FixtureRow({
  game,
  isNext,
  done,
  h2h,
  expandable,
  open,
  onToggle,
}: {
  game: Fixture;
  isNext: boolean;
  /** In the played half, where a kickoff time is no longer the useful thing. */
  done: boolean;
  h2h: ReturnType<typeof meetingsWith>;
  expandable: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  // The row carries its own month: the halves run in opposite directions, so
  // a September row can sit directly under an October one.
  const when = new Date(`${game.date}T12:00:00`);
  const day = when.toLocaleDateString(undefined, { day: 'numeric' });
  const month = when.toLocaleDateString(undefined, { month: 'short' });

  const cells = (
    <>
      <span className="fixture-date">
        <span className="fixture-month">{month}</span>
        {day}
      </span>
      <span className="fixture-team">
        <span className="fixture-ha">{game.home ? 'vs' : 'at'}</span> {game.opponent}
        <span className="fixture-sub">
          {game.opponentCity}
          {game.overtime ? ` · ${game.overtime}` : ''}
        </span>
      </span>
      {/* The score once there is one, and the kickoff until then. A game over
          with no score yet gets neither: last Friday's kickoff time is not what
          anyone is looking for. */}
      <span className="fixture-result">
        {game.result ? (
          <>
            <span className={`form-chip ${CHIP[outcome(game)!]}`}>{outcome(game)}</span>{' '}
            {game.result.us}–{game.result.them}
          </>
        ) : (
          !done && TIME(game)
        )}
      </span>
    </>
  );

  return (
    <div className={`fixture${isNext ? ' is-next' : ''}${game.result ? ' is-played' : ''}`}>
      {expandable ? (
        <button type="button" className="fixture-row" onClick={onToggle} aria-expanded={open}>
          {cells}
          <span className="fixture-caret" aria-hidden="true" />
        </button>
      ) : (
        <div className="fixture-row oh-fixture-still">
          {cells}
          <span aria-hidden="true" />
        </div>
      )}

      {expandable && open && (
        <div className="fixture-h2h">
          <HeadToHead h2h={h2h} />
        </div>
      )}
    </div>
  );
}
