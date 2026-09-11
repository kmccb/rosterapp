# Poland Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/oh/demo/` becomes Poland Seminary with every varsity sport on its real Eventlink calendar, invented rosters, live football scores and standings, and a sport page that lands on Schedule unless a game is on.

**Architecture:** A pure parser (`src/oh/eventlink.ts`) turns the committed `.ics` capture into schedule rows; a rewritten `scripts/build-demo.mjs` writes `public/oh/demo.json` from it. The demo loader stops carrying seasons, weather and the date shift, so football, the NE8 table and the forecast read the same directory files a real school reads. A pure `landingTab` decides Lookup vs Schedule; the hub learns gendered sport names.

**Tech Stack:** TypeScript, React 18, Vite, Vitest (node environment, no jsdom), Node 22 scripts importing `.ts` directly, `sharp` for the crest.

**Spec:** `docs/superpowers/specs/2026-09-11-poland-demo-design.md`. Read it first.

## Global Constraints

- **Poland must not change.** Never touch `src/styles.css`, anything under `src/share`, `src/screens`, `src/theme`, `src/App.tsx`, or `scripts/untouched-baseline.json`. Nothing under `src/oh/` may import a runtime value from those. `npm run build` ends with a guard that fails if the three root pages change.
- **Tests must pass env-free.** CI runs `npm test` with no Supabase variables. Never stub `import.meta.env` or global `fetch` for supa-dependent code; `vi.mock('./supa')` where needed. The demo tests deliberately do not mock supa.
- **The feed URL is a secret.** `EVENTLINK_ICS_URL` lives in `.env.local` (gitignored via `*.local`). It is already there on the owner's machine. Never write it into a committed file, a test, a comment or a commit message. The captured `.ics` fixture contains no token (verified: `grep -c token` is 0).
- **Copy rules:** typographic apostrophes (’) in user-facing strings. Comments explain why, not what, in prose. Commit messages are plain sentences saying why, in the repo's voice (read `git log --oneline -20`). Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Demo slug is `poland-seminary-poland`**, the real directory slug. `DEMO_SLUG` is the one place it lives in `src/`.
- **Sport names** are lowercase; gendered sports carry the gender word in front: `boys basketball`, `girls tennis`. Coed and single-gender sports are bare: `football`, `volleyball`, `cross country`, `swimming`, `track`, `baseball`, `softball`.
- **Run tests with** `npx vitest run <file>` for one file and `npx vitest run` for all; typecheck with `npx tsc --noEmit`. Windows machine, PowerShell primary; the Bash tool works for POSIX one-liners.
- Branch: do the work on a branch named `poland-demo` off `main`.

---

## File map

| File | Responsibility |
|---|---|
| `src/oh/fixtures/eventlink-poland-2026.ics` | Captured feed, 2026-09-11. Already on disk, uncommitted. Task 1 commits it. |
| `src/oh/eventlink.ts` (new) | Pure parser: `.ics` text → `{ sport, rows }[]` for one season. |
| `src/oh/eventlink.test.ts` (new) | Pins the parser to the fixture. |
| `src/oh/sportSeasons.ts` | Gendered lookup; tennis split by gender. |
| `src/oh/SportGlyph.tsx` | Gendered lookup for the mark. |
| `src/oh/landing.ts` (new) + test | `landingTab(fixtures, players, now)`. |
| `src/oh/School.tsx` | Calls `landingTab` on sport entry; pasted schedule splits by date; demo footer copy. |
| `src/oh/demo.ts` + test | Loader loses `seasons`, `weather`, the shift; slug becomes Poland. |
| `src/oh/store.ts` | `loadSeason` / `loadWeather` lose their demo branches. |
| `scripts/build-demo.mjs` | Rewritten: feed → `demo.json`. |
| `public/oh/demo.json` | Regenerated. |
| `scripts/paid-weather.mjs` | Forecasts the demo slug too. |
| `oh/demo/index.html`, `docs/selling.md`, `CLAUDE.md`, `.env.example` | Copy. |

---

### Task 1: The Eventlink parser

**Files:**
- Create: `src/oh/eventlink.ts`
- Create: `src/oh/eventlink.test.ts`
- Commit (already on disk): `src/oh/fixtures/eventlink-poland-2026.ics`

**Interfaces:**
- Consumes: `ScheduleRow` from `src/oh/scheduleParse.ts` (`{ date: string; opponent: string; home: boolean; time?: string; score?: { us: number; them: number } }`).
- Produces: `parseEventlink(text: string, season: number): EventlinkSport[]` where `EventlinkSport = { sport: string; rows: ScheduleRow[] }`; also `clockText`, `opponentName`, `sportName`, `readEvents` exported for tests. Task 6's script imports `parseEventlink`.

- [ ] **Step 1: Confirm the fixture is present and token-free**

Run (Bash):
```bash
wc -c src/oh/fixtures/eventlink-poland-2026.ics && grep -c "token" src/oh/fixtures/eventlink-poland-2026.ics; echo "expect 324627 and 0"
```
If the file is missing, stop and ask the owner — it has to be captured with the private URL in `.env.local`:
```bash
node -e "const e=Object.fromEntries(require('fs').readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));fetch(e.EVENTLINK_ICS_URL).then(r=>r.text()).then(t=>require('fs').writeFileSync('src/oh/fixtures/eventlink-poland-2026.ics',t))"
```

- [ ] **Step 2: Write the failing tests**

`src/oh/eventlink.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clockText, opponentName, parseEventlink, readEvents, sportName } from './eventlink';

/*
 * Pinned to a capture of Poland's calendar taken 2026-09-11. The feed is one
 * school's Eventlink export; a shape change in it fails here rather than in a
 * generator run the night before a demo.
 */
const FIXTURE = new URL('./fixtures/eventlink-poland-2026.ics', import.meta.url);
const feed = readFileSync(FIXTURE, 'utf8');
const parsed = parseEventlink(feed, 2026);
const bySport = Object.fromEntries(parsed.map((s) => [s.sport, s.rows]));

describe('the Eventlink calendar', () => {
  it('yields every varsity sport on the 2026-27 calendar, and exactly its games', () => {
    expect(Object.fromEntries(parsed.map((s) => [s.sport, s.rows.length]))).toEqual({
      volleyball: 22,
      'girls tennis': 18,
      'girls soccer': 20,
      'cross country': 15,
      'boys basketball': 22,
      'girls basketball': 22,
      'girls golf': 13,
      baseball: 8,
      'boys soccer': 20,
      football: 12,
      'boys golf': 21,
    });
  });

  it('keeps varsity only', () => {
    // The feed carries JV and freshman rows; Girard's JV plays at 5:30 on the
    // same day the varsity plays at 7, and only the varsity row survives.
    expect(feed).toMatch(/\(Girls JV\)/);
    expect(bySport.volleyball.filter((r) => r.date === '2026-09-01')).toEqual([
      { date: '2026-09-01', opponent: 'Girard', home: true, time: '7:00 PM' },
    ]);
  });

  it('drops a cancelled game', () => {
    expect(feed).toMatch(/CANCELED - Golf \(Girls V\) @ Girard/);
    expect(bySport['girls golf'].some((r) => r.date === '2026-08-11' && r.opponent === 'Girard')).toBe(false);
  });

  it('drops the rows that match the pattern but are not games', () => {
    expect(feed).toMatch(/Volleyball \(Girls V\) - Scrimmage/);
    const all = parsed.flatMap((s) => s.rows);
    expect(all.some((r) => /scrimmage|banquet|pictures|meeting/i.test(r.opponent))).toBe(false);
  });

  it('keeps only the season it was asked for', () => {
    const all = parsed.flatMap((s) => s.rows);
    expect(all.every((r) => r.date >= '2026-07-01' && r.date < '2027-07-01')).toBe(true);
    // Last season is in the feed too, and asking for it gives a different set.
    expect(parseEventlink(feed, 2025).length).toBeGreaterThan(0);
  });

  it('reads a home row and an away row field by field', () => {
    expect(bySport.football.find((r) => r.date === '2026-09-11')).toEqual({
      date: '2026-09-11',
      opponent: 'Canfield',
      home: false,
      time: '7:00 PM',
    });
    expect(bySport.football.find((r) => r.date === '2026-09-18')).toEqual({
      date: '2026-09-18',
      opponent: 'Hubbard',
      home: true,
      time: '7:00 PM',
    });
  });

  it('keeps a meet under its own name, with the minute the feed gave it', () => {
    // 110008 in the feed — Eventlink stamps odd seconds; only the minute prints.
    expect(bySport['cross country'].find((r) => r.date === '2026-09-12')).toEqual({
      date: '2026-09-12',
      opponent: 'Streetsboro Invitational',
      home: false,
      time: '11:00 AM',
    });
  });

  it('sorts each sport by date', () => {
    for (const { rows } of parsed) {
      const dates = rows.map((r) => r.date);
      expect(dates).toEqual([...dates].sort());
    }
  });

  it('lists football first, then the rest in the order the feed introduced them', () => {
    expect(parsed[0].sport).toBe('football');
  });
});

describe('one event at a time', () => {
  it('reads an all-day row with no time, and drops a recurring one', () => {
    const tiny = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261010',
      'SUMMARY:Golf (Boys V) @ Kiely Cup',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART;TZID=America/New_York:20260901T150000',
      'RRULE:FREQ=WEEKLY',
      'SUMMARY:Golf (Boys V) - Practice Round',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(parseEventlink(tiny, 2026)).toEqual([
      { sport: 'boys golf', rows: [{ date: '2026-10-10', opponent: 'Kiely Cup', home: false }] },
    ]);
  });

  it('unfolds a wrapped line and unescapes the commas in it', () => {
    const folded =
      'BEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20270415T160000\r\n' +
      'SUMMARY:Track & Field (Coed V) - Lakeview High School\\, Struthers High Scho\r\n ol\\, Girard Sr High School\r\nEND:VEVENT\r\n';
    expect(parseEventlink(folded, 2026)).toEqual([
      { sport: 'track', rows: [{ date: '2027-04-15', opponent: 'Lakeview, Struthers, Girard', home: true, time: '4:00 PM' }] },
    ]);
  });

  it('exposes the events it read', () => {
    const events = readEvents('BEGIN:VEVENT\r\nUID:x\r\nDTSTART;TZID=America/New_York:20260911T190000\r\nEND:VEVENT\r\n');
    expect(events).toEqual([{ UID: 'x', DTSTART: '20260911T190000' }]);
  });
});

describe('the pieces', () => {
  it('prints a clock the way a fan reads it', () => {
    expect(clockText('20260911T190000')).toBe('7:00 PM');
    expect(clockText('20260912T110008')).toBe('11:00 AM');
    expect(clockText('20260912T120000')).toBe('12:00 PM');
    expect(clockText('20260912T000000')).toBe('12:00 AM');
    expect(clockText('20261010')).toBeUndefined();
  });

  it('strips the school suffix and nothing else', () => {
    expect(opponentName('Girard Sr High School')).toBe('Girard');
    expect(opponentName('St. Vincent-St. Mary H.S.')).toBe('St. Vincent-St. Mary');
    expect(opponentName('Crestview High School (Columbiana)')).toBe('Crestview (Columbiana)');
    expect(opponentName('Boardman Invite')).toBe('Boardman Invite');
  });

  it('names a sport the way the hub does', () => {
    expect(sportName('Football', 'Boys')).toBe('football');
    expect(sportName('Basketball', 'Girls')).toBe('girls basketball');
    expect(sportName('Tennis', 'Boys')).toBe('boys tennis');
    expect(sportName('Cross Country', 'Coed')).toBe('cross country');
    expect(sportName('Track & Field', 'Coed')).toBe('track');
    expect(() => sportName('Esports', 'Boys')).toThrow(/does not know/);
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run: `npx vitest run src/oh/eventlink.test.ts`
Expected: FAIL — cannot resolve `./eventlink`.

- [ ] **Step 4: Write the parser**

`src/oh/eventlink.ts`:
```ts
/*
 * Reads a school's Eventlink calendar into the schedule rows the paid page
 * draws.
 *
 * Eventlink is what Poland's athletic office actually types into, and its
 * iCal export is the one place every sport's varsity schedule exists in a
 * shape a program can read — the directory scrapes football and nothing else.
 * It publishes fixtures only, never scores.
 *
 * Pure, and pinned to a captured feed in ./fixtures, the same bargain every
 * parser in this repo makes: a change in the export fails a test here rather
 * than a generator run the night before a demo.
 */

import type { ScheduleRow } from './scheduleParse';

export type EventlinkSport = { sport: string; rows: ScheduleRow[] };

/**
 * The feed's sport word, as the hub names it. A table rather than a
 * lowercase of the word, so a sport this has never seen stops the run instead
 * of inventing a tile with no glyph and no season.
 */
const SPORT_NAMES: Record<string, string> = {
  Football: 'football',
  Volleyball: 'volleyball',
  'Cross Country': 'cross country',
  Swimming: 'swimming',
  'Track & Field': 'track',
  Baseball: 'baseball',
  Softball: 'softball',
  Basketball: 'basketball',
  Soccer: 'soccer',
  Golf: 'golf',
  Tennis: 'tennis',
  Wrestling: 'wrestling',
  Lacrosse: 'lacrosse',
};

/** Sports a school fields for both boys and girls, so the gender word has to
 * stay on the front of the name for the two to be two tiles. */
const GENDERED = new Set(['basketball', 'soccer', 'golf', 'tennis', 'wrestling', 'lacrosse']);

/** "Football (Boys V) - Salem High School" / "… @ …" for away. */
const SUMMARY = /^(CANCELED - )?(.+?) \((Boys|Girls|Coed) (V|JV|F)\) (-|@) (.+)$/;

/** Rows that fit the pattern and are not games. A banquet is filed under the
 * sport like a fixture is; a fan's schedule has no line for it. */
const NOT_A_GAME = /\b(banquet|pictures?|meeting|media day|rehearsal|tryouts?|practice|scrimmage)\b/i;

/** Global, because a tri-meet names three schools in one opponent field. */
const SCHOOL_SUFFIX = / (?:Sr )?High School\b| H\.S\./g;

type Event = Record<string, string>;

/** iCal folds long lines with CRLF plus a space or tab; join them back first. */
const unfold = (text: string): string[] => text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

/** iCal escapes commas, semicolons and backslashes in text values. */
const unescape = (v: string): string => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

/**
 * Every VEVENT as a flat record of its properties. Parameters between the
 * name and the colon (DTSTART;TZID=…) are dropped: the timezone is always
 * Eastern for an Ohio school, and an all-day value shows itself by being
 * eight digits long.
 */
export const readEvents = (text: string): Event[] => {
  const events: Event[] = [];
  let current: Event | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(';')[0];
    current[name] = unescape(line.slice(colon + 1));
  }
  return events;
};

const isoDate = (start: string): string =>
  `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`;

/** "20260911T190000" → "7:00 PM". Undefined for an all-day value. Seconds are
 * dropped: Eventlink stamps odd ones (T164517) that mean nothing to a fan. */
export const clockText = (start: string): string | undefined => {
  const m = /^\d{8}T(\d{2})(\d{2})/.exec(start);
  if (!m) return undefined;
  const hour24 = Number(m[1]);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${m[2]} ${hour24 < 12 ? 'AM' : 'PM'}`;
};

export const opponentName = (raw: string): string => raw.replace(SCHOOL_SUFFIX, '').trim();

export const sportName = (word: string, gender: string): string => {
  const base = SPORT_NAMES[word];
  if (!base) throw new Error(`Eventlink names a sport this parser does not know: "${word}"`);
  return GENDERED.has(base) ? `${gender.toLowerCase()} ${base}` : base;
};

/** July to June, the school year: a 2026 season runs 2026-07-01 to 2027-06-30. */
const inSeason = (start: string, season: number): boolean =>
  start >= `${season}0701` && start < `${season + 1}0701`;

/**
 * The varsity fixtures of one season, grouped by sport, football first.
 *
 * Football goes first because it is the tile every school has, paid or not;
 * after it the order is the feed's own, which is the order the athletic office
 * entered the sports. The hub re-sorts by season anyway.
 */
export const parseEventlink = (text: string, season: number): EventlinkSport[] => {
  const found = new Map<string, { start: string; row: ScheduleRow }[]>();

  for (const event of readEvents(text)) {
    if (event.RRULE) continue;
    const m = SUMMARY.exec(event.SUMMARY ?? '');
    if (!m) continue;
    const [, cancelled, word, gender, level, separator, opponent] = m;
    if (cancelled || level !== 'V') continue;
    const start = event.DTSTART ?? '';
    if (!/^\d{8}(T\d{6})?$/.test(start) || !inSeason(start, season)) continue;
    if (NOT_A_GAME.test(opponent)) continue;

    const row: ScheduleRow = {
      date: isoDate(start),
      opponent: opponentName(opponent),
      home: separator === '-',
    };
    const time = clockText(start);
    if (time) row.time = time;

    const name = sportName(word, gender);
    const rows = found.get(name) ?? [];
    rows.push({ start, row });
    found.set(name, rows);
  }

  const sports = [...found].map(([sport, rows]) => ({
    sport,
    rows: [...rows].sort((a, b) => a.start.localeCompare(b.start)).map((r) => r.row),
  }));
  const football = sports.findIndex((s) => s.sport === 'football');
  if (football > 0) sports.unshift(...sports.splice(football, 1));
  return sports;
};
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/oh/eventlink.test.ts`
Expected: PASS, 15 tests. If the per-sport count test fails, print the actual counts and stop: the fixture on disk is not the 2026-09-11 capture, or the drop rules differ from the spec. Do not "fix" by editing expected numbers without understanding which rule moved.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
```bash
git add src/oh/eventlink.ts src/oh/eventlink.test.ts src/oh/fixtures/eventlink-poland-2026.ics
git commit -m "Read Poland's Eventlink calendar into schedule rows

The directory scrapes football and nothing else; Eventlink is where every
other varsity schedule already lives. Pinned to a capture, like every
parser here, so a change in the export fails a test and not a demo.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Gendered sport names in the season table and the glyph set

**Files:**
- Modify: `src/oh/sportSeasons.ts` (lines 12-30 table, 41-47 `norm`/`inSeason`, 60-70 `seasonNote`)
- Modify: `src/oh/SportGlyph.tsx:207-210` (`glyphFor`)
- Modify: `src/oh/sportSeasons.test.ts`, `src/oh/sportGlyph.test.ts`

**Interfaces:**
- Produces: `inSeason`, `seasonNote`, `sortSportsForNow`, `hubSports`, `sportLabel`, `knownSports` keep their signatures. `knownSports()` now includes `'girls tennis'` and `'boys tennis'` and not `'tennis'`. `glyphFor('boys golf')` returns `'golf'`.

- [ ] **Step 1: Write the failing tests**

In `src/oh/sportSeasons.test.ts`, add inside `describe('sport seasons', …)`:
```ts
  it('reads a gendered name by the sport behind it', () => {
    expect(inSeason('boys basketball', 12)).toBe(true);
    expect(inSeason('girls basketball', 9)).toBe(false);
    expect(inSeason('Girls Soccer', 9)).toBe(true);
    expect(seasonNote('boys basketball', new Date('2026-09-15T12:00:00'))).toBe('Starts in November');
  });

  it('knows girls play tennis in the autumn and boys in the spring', () => {
    expect(inSeason('girls tennis', 9)).toBe(true);
    expect(inSeason('girls tennis', 4)).toBe(false);
    expect(inSeason('boys tennis', 4)).toBe(true);
    expect(inSeason('boys tennis', 9)).toBe(false);
    expect(seasonNote('girls tennis', new Date('2026-06-15T12:00:00'))).toBe('Starts in August');
    expect(seasonNote('boys tennis', new Date('2026-11-15T12:00:00'))).toBe('Starts in March');
    // Bare tennis is nobody's season now; the seller says which. Unknown means
    // always in season, the charity every unlisted sport gets.
    expect(seasonNote('tennis', new Date('2026-06-15T12:00:00'))).toBe('In season');
  });

  it('sorts a gendered pair like the sport behind it', () => {
    const november = new Date('2026-11-15T12:00:00');
    expect(sortSportsForNow(['football', 'girls basketball', 'boys basketball', 'baseball'], november))
      .toEqual(['boys basketball', 'girls basketball', 'baseball', 'football']);
  });

  it('labels a gendered name word by word', () => {
    expect(sportLabel('girls soccer')).toBe('Girls Soccer');
  });
```
Then edit the existing test `'names the run a two-season sport reaches next, over the year end'`: delete its two `tennis` expectations (the `June` and `November` lines and their comments) and its leading comment about tennis, keeping the `golf` and `baseball` lines. In `'knows every sport it has a calendar for'` change `toHaveLength(16)` to `toHaveLength(17)` — one tennis entry became two.

In `src/oh/sportGlyph.test.ts`:
- Change the first test body to `expect(glyphFor(sport)).not.toBe('generic');` with the comment `// Both tennis entries share one mark, so the key is not always the name.`
- Add:
```ts
  it('draws a gendered sport with the mark of the sport behind it', () => {
    expect(glyphFor('boys golf')).toBe('golf');
    expect(glyphFor('Girls Basketball')).toBe('basketball');
    expect(glyphFor('coed swimming')).toBe('swimming');
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/oh/sportSeasons.test.ts src/oh/sportGlyph.test.ts`
Expected: the new tests FAIL (bare `tennis` still known; gendered names unknown; `boys golf` → `generic`).

- [ ] **Step 3: Implement**

In `src/oh/sportSeasons.ts` replace the `tennis` line and its comment in `MONTHS` with:
```ts
  // Two sports on the calendar, not one: girls' is autumn, boys' is spring. A
  // bare "tennis" is nobody's season, so the seller types which one.
  'girls tennis': [8, 9, 10],
  'boys tennis': [3, 4, 5],
```
Replace `norm` and `inSeason`, and the `MONTHS[norm(sport)]` line in `seasonNote`, with:
```ts
const norm = (sport: string): string => sport.trim().toLowerCase();

/**
 * The calendar for a sport, however the school names it.
 *
 * A school that sells basketball to both boys and girls stores two sports,
 * "boys basketball" and "girls basketball", and they share one calendar. So
 * the full name is tried first — which is how the two tennis seasons stay
 * apart — and then the name with its gender word taken off.
 */
const GENDER = /^(boys|girls|coed) /;

const monthsFor = (sport: string): number[] | undefined => {
  const key = norm(sport);
  return MONTHS[key] ?? MONTHS[key.replace(GENDER, '')];
};

/** Month is 1–12. A sport the table doesn't know is always in season. */
export const inSeason = (sport: string, month: number): boolean => {
  const months = monthsFor(sport);
  return months ? months.includes(month) : true;
};
```
and in `seasonNote`: `const months = monthsFor(sport)!;` — non-null because `inSeason` returned false only when the table knew the sport. Add a one-line comment saying so.

In `src/oh/SportGlyph.tsx` replace `glyphFor`:
```ts
/** The key a sport draws by: its own, or the sport behind a gender word —
 * "boys golf" draws golf's mark — or the fallback. Exported so the test can
 * hold the set to the season table without rendering anything. */
export const glyphFor = (sport: string): string => {
  const key = sport.trim().toLowerCase();
  const has = (k: string) => Object.prototype.hasOwnProperty.call(GLYPHS, k);
  if (has(key)) return key;
  const bare = key.replace(/^(boys|girls|coed) /, '');
  return has(bare) ? bare : 'generic';
};
```
(Keep the existing JSDoc's first sentence if it says something the new one does not.)

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/oh/sportSeasons.test.ts src/oh/sportGlyph.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/oh/sportSeasons.ts src/oh/SportGlyph.tsx src/oh/sportSeasons.test.ts src/oh/sportGlyph.test.ts
git commit -m "Let the hub read boys and girls sports as the sport behind them

A school that fields both stores two sports, and they share a calendar
and a mark. Tennis is the exception — girls play in autumn and boys in
spring — so it becomes two entries and the bare name is nobody's season.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The landing-tab rule

**Files:**
- Create: `src/oh/landing.ts`
- Create: `src/oh/landing.test.ts`

**Interfaces:**
- Consumes: `clockOf(kickoff): { hour, minute } | null` and `easternOffset(date): string` from `src/ohio/kickoff.ts`.
- Produces: `export type Landing = 'lookup' | 'schedule'`, `export type LandingFixture = { date: string; time?: string | null }`, `export const landingTab = (fixtures: LandingFixture[], players: number, now: Date): Landing`. Task 4 calls it from `School.tsx`.

- [ ] **Step 1: Write the failing tests**

`src/oh/landing.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { landingTab } from './landing';

/*
 * Times below are Eastern Daylight Time, so 7:00 PM on 2026-09-11 is
 * 23:00Z. Every boundary is checked a minute either side.
 */
const friday = [{ date: '2026-09-11', time: '7:00 PM' }];
const at = (iso: string) => new Date(iso);

describe('where a sport lands', () => {
  it('lands on the keypad from an hour before kickoff to four hours after', () => {
    expect(landingTab(friday, 40, at('2026-09-11T22:01:00Z'))).toBe('lookup');
    expect(landingTab(friday, 40, at('2026-09-11T23:00:00Z'))).toBe('lookup');
    expect(landingTab(friday, 40, at('2026-09-12T02:59:00Z'))).toBe('lookup');
  });

  it('lands on the schedule outside that window', () => {
    expect(landingTab(friday, 40, at('2026-09-11T21:59:00Z'))).toBe('schedule');
    expect(landingTab(friday, 40, at('2026-09-12T03:01:00Z'))).toBe('schedule');
    expect(landingTab(friday, 40, at('2026-09-08T23:00:00Z'))).toBe('schedule');
  });

  it('reads the directory’s own clock strings', () => {
    expect(landingTab([{ date: '2026-09-11', time: '7pm' }], 40, at('2026-09-11T23:30:00Z'))).toBe('lookup');
  });

  it('gives an untimed fixture its whole day, Eastern', () => {
    const untimed = [{ date: '2026-09-11' }];
    // 11 in the morning Eastern on the day.
    expect(landingTab(untimed, 40, at('2026-09-11T15:00:00Z'))).toBe('lookup');
    // 11 at night Eastern on the day is 03:00Z the next calendar day in UTC.
    expect(landingTab(untimed, 40, at('2026-09-12T03:00:00Z'))).toBe('lookup');
    // The day after.
    expect(landingTab(untimed, 40, at('2026-09-12T15:00:00Z'))).toBe('schedule');
  });

  it('treats a time it cannot read as no time, never as seven o’clock', () => {
    const tba = [{ date: '2026-09-11', time: 'TBA' }];
    expect(landingTab(tba, 40, at('2026-09-11T15:00:00Z'))).toBe('lookup');
    expect(landingTab(tba, 40, at('2026-09-12T15:00:00Z'))).toBe('schedule');
    expect(landingTab([{ date: '2026-09-11', time: null }], 40, at('2026-09-11T15:00:00Z'))).toBe('lookup');
  });

  it('never lands an empty roster on the keypad', () => {
    expect(landingTab(friday, 0, at('2026-09-11T23:00:00Z'))).toBe('schedule');
  });

  it('lands on the schedule with nothing to go on', () => {
    expect(landingTab([], 40, at('2026-09-11T23:00:00Z'))).toBe('schedule');
  });

  it('looks at every fixture, not the first', () => {
    const two = [{ date: '2026-09-04', time: '7:00 PM' }, ...friday];
    expect(landingTab(two, 40, at('2026-09-11T23:00:00Z'))).toBe('lookup');
  });

  it('survives a date it cannot parse', () => {
    expect(landingTab([{ date: 'soon', time: '7:00 PM' }], 40, at('2026-09-11T23:00:00Z'))).toBe('schedule');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/oh/landing.test.ts`
Expected: FAIL — cannot resolve `./landing`.

- [ ] **Step 3: Implement**

`src/oh/landing.ts`:
```ts
/*
 * Which tab a sport opens on.
 *
 * The keypad is the app — "who is number 17" — and it is asked from the
 * bleachers. The rest of the week the question is when and where the next
 * game is, and the schedule answers that with no tap at all. So a sport lands
 * on Schedule, except while a game is on or about to be, when it lands on
 * Lookup. Poland's own app has always opened on the keypad; that app was a
 * football-only, Friday-night tool, and a page with a dozen sports is not.
 *
 * Pure, so the rule is pinned by tests and School.tsx only has to call it.
 */

import { clockOf, easternOffset } from '../ohio/kickoff';

export type Landing = 'lookup' | 'schedule';

/** A fixture as either source carries it: the directory's `kickoff` ("7pm")
 * or a pasted row's `time` ("7:00 PM"). Absent or unreadable means untimed. */
export type LandingFixture = { date: string; time?: string | null };

/** An hour of pre-game — parents arrive early — and four hours after, which
 * outlasts any game with a weather delay in it. */
const BEFORE_MS = 60 * 60 * 1000;
const AFTER_MS = 4 * 60 * 60 * 1000;

/** Today's date as Ohio reads it, whatever clock the phone is on. en-CA
 * formats as YYYY-MM-DD, which is the shape every fixture date is in. */
const easternDate = (now: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/**
 * The instant a timed fixture starts, or null for an untimed one. Built here
 * rather than through kickoffAt, whose seven-o'clock default is right for a
 * forecast and wrong for this: a time nobody could read must not open the
 * keypad at seven on a day with no game.
 */
const startOf = (fixture: LandingFixture): number | null => {
  const clock = clockOf(fixture.time);
  if (!clock) return null;
  const hh = String(clock.hour).padStart(2, '0');
  const mm = String(clock.minute).padStart(2, '0');
  const at = Date.parse(`${fixture.date}T${hh}:${mm}:00${easternOffset(fixture.date)}`);
  return Number.isNaN(at) ? null : at;
};

export const landingTab = (fixtures: LandingFixture[], players: number, now: Date): Landing => {
  if (players === 0) return 'schedule';
  const today = easternDate(now);
  for (const fixture of fixtures) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fixture.date)) continue;
    const start = startOf(fixture);
    if (start === null) {
      if (fixture.date === today) return 'lookup';
      continue;
    }
    const since = now.getTime() - start;
    if (since >= -BEFORE_MS && since <= AFTER_MS) return 'lookup';
  }
  return 'schedule';
};
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/oh/landing.test.ts && npx tsc --noEmit`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/oh/landing.ts src/oh/landing.test.ts
git commit -m "Decide where a sport lands: the keypad during a game, the schedule otherwise

The keypad is asked from the bleachers. The rest of the week the question
is when the next game is, and the schedule answers it with no tap.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: School.tsx — landing on entry, pasted schedule by date, demo footer

**Files:**
- Modify: `src/oh/School.tsx` — imports (lines 1-30), `PastedSchedule` (lines ~44-125), the roster effect (line 372), a new effect after line 404, the demo note (line ~604).

**Interfaces:**
- Consumes: `landingTab`, `LandingFixture` from `./landing` (Task 3).
- No unit tests exist for `School.tsx` (node test environment, no DOM). Verification is `tsc` plus the browser check in Task 9.

- [ ] **Step 1: Import**

Add after the `import { leagueTable, … } from './leagueTable';` line:
```ts
import { landingTab, type LandingFixture } from './landing';
```

- [ ] **Step 2: Neutral reset, then the landing effect**

In the roster effect (currently `setRoster(null); setTab('lookup');` near line 371-372) change `setTab('lookup')` to `setTab('schedule')` and put this comment above it:
```ts
    // A placeholder until the landing rule below has something to read; the
    // tab bar is not drawn until the roster lands, so nobody sees it.
```
Directly after that effect's closing `}, [slug, sport, liveSports]);` add:
```tsx
  /*
   * Where the sport opens: the keypad during a game, the schedule otherwise.
   *
   * Decided once the pieces it reads have settled — the roster, and for
   * football the season, since football's fixtures are the directory's. Every
   * dependency here changes only on entering a sport (or a school), never on
   * a tab tap, so a reader who has moved to Team is not dragged back.
   */
  useEffect(() => {
    if (sport === null || rosterFetch !== 'done') return;
    if (sport === 'football' && season === null) return;
    const fixtures: LandingFixture[] =
      sport === 'football'
        ? (season?.games ?? []).map((g) => ({ date: g.date, time: g.kickoff }))
        : (roster?.schedule ?? []);
    setTab(landingTab(fixtures, roster?.players.length ?? 0, new Date()));
  }, [sport, rosterFetch, season, roster]);
```

- [ ] **Step 3: Pasted schedule splits by date**

In `PastedSchedule`, replace the two `played`/`coming` lines with:
```tsx
  // Split on the calendar, not on whether a score was pasted. Nobody pastes
  // scores for a golf invitational, and a meet run last month must not sit
  // under "Coming up" for the rest of the season. Football's list splits on
  // results because the directory posts them weekly; a pasted list has no
  // such promise behind it.
  const today = localDate(new Date());
  const played = rows.filter((r) => r.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const coming = rows.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
```
Add this helper above `PastedSchedule` (next to `fixtureDate`):
```ts
/** Today as the phone reads it, in the shape every fixture date is in. */
const localDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
```
In the `played.map` body, `const won = r.score!.us > r.score!.them;` becomes `const score = r.score;` and the result span becomes:
```tsx
                  <span className="fixture-result">
                    {score ? (
                      <>
                        <span className={`form-chip ${score.us > score.them ? 'won' : 'lost'}`}>
                          {score.us > score.them ? 'W' : 'L'}
                        </span>{' '}
                        {score.us}–{score.them}
                      </>
                    ) : (
                      r.time ?? ''
                    )}
                  </span>
```
Update the component's doc comment's last paragraph: replace the sentence about drawn games rendering as an L with: "A played row with no score pasted keeps its time in the result column, the way a fixture card does — a blank would read as a row that lost its result. A drawn game renders as an L: ties are near-nonexistent in these sports and the chip has two states."

- [ ] **Step 4: Demo footer copy**

Change the demo note line to:
```tsx
    <p className="oh-demo-note">Sample rosters — the schedules are real</p>
```
and in the comment above it replace "Springfield Local" with "Poland Seminary" and "the players are invented" with "the players are invented while the schedules are not".

- [ ] **Step 5: Typecheck and full tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all tests pass (the demo tests still pass because the loader has not changed yet).

- [ ] **Step 6: Commit**

```bash
git add src/oh/School.tsx
git commit -m "Open a sport on its schedule, and list a pasted game by its date

The keypad is for the bleachers; a Tuesday wants the next game. A pasted
schedule now splits on the calendar, so a golf meet nobody scores does
not sit under Coming up all season.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The demo loader reads live directory data

**Files:**
- Modify: `src/oh/demo.ts` (whole file; see below)
- Modify: `src/oh/store.ts:13`, `store.ts:182-193`, `store.ts:244-248`
- Rewrite: `src/oh/demo.test.ts`

**Interfaces:**
- Produces: `DEMO_SLUG = 'poland-seminary-poland'`; `DemoData` without `seasons`/`weather`; `isDemo`, `loadDemo`, `demoIdentity`, `keptDemoIdentity`, `demoRosterBody` unchanged in signature. `demoSeason`, `demoWeather`, `weeksBehind`, `shiftToNow` are **removed**.
- The tests in this task use a synthetic body, not the committed file (which still holds Springfield until Task 6). Task 6 adds the committed-file tests.

- [ ] **Step 1: Rewrite the tests**

Replace `src/oh/demo.test.ts` entirely:
```ts
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The demo shim, pinned.
 *
 * Two kinds of thing are tested. The shim's own judgement — which pages count
 * as the demo, what it does with a mangled file, what it hands the store
 * guards. And the store, in demo mode, reached with no Supabase variables and
 * no rpc mocked: the demo has to work in a build with no database at all,
 * which is how CI runs, and getting a roster back here is that claim being
 * demonstrated.
 *
 * Everything is loaded through a fresh module instance because loadDemo
 * memoizes for the life of the page.
 *
 * The body here is synthetic. The committed file is pinned by its own block in
 * this file once the generator has written it (see the "committed file" tests).
 */

const SLUG = 'poland-seminary-poland';

const player = (n: number) => ({
  id: `p${n}`,
  number: String(n),
  firstName: 'Test',
  lastName: `Player${n}`,
  position: '',
  side: '' as const,
});

const body = () => ({
  slug: SLUG,
  season: 2026,
  generatedOn: '2026-09-11',
  school: { slug: SLUG, name: 'Poland Seminary', city: 'Poland' },
  colors: { ground: '#04043a', accent: '#4fbaf7' },
  logo: 'data:image/jpeg;base64,/9j/4AAQ',
  league: { name: 'Northeast 8', members: ['hubbard-hubbard', 'girard-girard'] },
  sportNames: ['football', 'volleyball'],
  sports: {
    football: { players: [player(1), player(2)], schedule: null },
    volleyball: {
      players: [player(3)],
      schedule: [{ date: '2026-09-01', opponent: 'Girard', home: true, time: '7:00 PM' }],
    },
  },
});

type Page = { pathname?: string; search?: string };

/** An empty jar. The store reads localStorage on the way back from a fetch
 * (to decide whether the followed school's copy is kept), and node has no
 * such global. */
const jar = () => {
  const kept: Record<string, string> = {};
  return {
    getItem: (k: string) => kept[k] ?? null,
    setItem: (k: string, v: string) => {
      kept[k] = v;
    },
    removeItem: (k: string) => {
      delete kept[k];
    },
    key: (i: number) => Object.keys(kept)[i] ?? null,
    get length() {
      return Object.keys(kept).length;
    },
  };
};

/** The demo page, with fetch answering the demo file and the directory's own
 * files — the season and the forecast are no longer baked, so the store reads
 * the same committed files a real school's page does. */
const load = async (demo: unknown, page: Page = {}) => {
  vi.resetModules();
  vi.stubGlobal('location', { pathname: page.pathname ?? '/oh/demo/', search: page.search ?? '' });
  vi.stubGlobal('localStorage', jar());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url).split('?')[0];
      if (path === '/oh/demo.json') return { ok: true, json: async () => demo };
      const data = /^\/oh\/data\/([a-z0-9-]+)\.json$/.exec(path);
      if (data) {
        const file = new URL(`../../public/oh/data/${data[1]}.json`, import.meta.url);
        return { ok: true, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
      }
      if (path === '/oh/weather.json') return { ok: true, json: async () => ({}) };
      return { ok: false, json: async () => null };
    }),
  );
  return import('./demo');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('which page is the demo', () => {
  it('knows the path, with or without the trailing slash', async () => {
    expect((await load(body(), { pathname: '/oh/demo/' })).isDemo()).toBe(true);
    expect((await load(body(), { pathname: '/oh/demo' })).isDemo()).toBe(true);
    expect((await load(body(), { pathname: '/oh/demo/index.html' })).isDemo()).toBe(true);
  });

  it('accepts ?demo as an alias, so a link cannot land on the directory', async () => {
    expect((await load(body(), { pathname: '/oh/', search: '?demo' })).isDemo()).toBe(true);
    expect((await load(body(), { pathname: '/oh/', search: '?demo=1' })).isDemo()).toBe(true);
  });

  it('reads ?demo=false as somebody turning it off', async () => {
    expect((await load(body(), { pathname: '/oh/', search: '?demo=false' })).isDemo()).toBe(false);
    expect((await load(body(), { pathname: '/oh/', search: '?demo=0' })).isDemo()).toBe(false);
  });

  it('leaves every other page alone', async () => {
    expect((await load(body(), { pathname: '/oh/' })).isDemo()).toBe(false);
    expect((await load(body(), { pathname: '/' })).isDemo()).toBe(false);
    expect((await load(body(), { pathname: '/oh/', search: '?manage' })).isDemo()).toBe(false);
  });

  it('is false off a page altogether, which is where the tests run', async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    const { isDemo } = await import('./demo');
    expect(isDemo()).toBe(false);
  });
});

describe('what the store guards ask for', () => {
  it('is Poland', async () => {
    const { DEMO_SLUG } = await load(body());
    expect(DEMO_SLUG).toBe('poland-seminary-poland');
  });

  it('hangs the conference on football and on nothing else', async () => {
    const { demoRosterBody, DEMO_SLUG } = await load(body());
    const football = (await demoRosterBody(DEMO_SLUG, 'football')) as Record<string, unknown>;
    expect(football.league).not.toBeNull();
    // Football's fixtures come from the directory, exactly as a real paid
    // school's do — there is nothing pasted for it.
    expect(football.schedule).toBeNull();
    const volleyball = (await demoRosterBody(DEMO_SLUG, 'volleyball')) as Record<string, unknown>;
    expect(volleyball.league).toBeNull();
    expect(Array.isArray(volleyball.schedule)).toBe(true);
  });

  it('answers for the demo school only', async () => {
    const { demoRosterBody, demoIdentity } = await load(body());
    expect(await demoRosterBody('hubbard-hubbard', 'football')).toBeNull();
    expect(await demoIdentity('hubbard-hubbard')).toBeNull();
  });

  it('answers nothing for a sport the school does not sell', async () => {
    const { demoRosterBody, DEMO_SLUG } = await load(body());
    expect(await demoRosterBody(DEMO_SLUG, 'bowling')).toBeNull();
  });

  it('has no kept identity until the file has landed', async () => {
    const { keptDemoIdentity, loadDemo, DEMO_SLUG } = await load(body());
    expect(keptDemoIdentity(DEMO_SLUG)).toBeNull();
    await loadDemo();
    expect(keptDemoIdentity(DEMO_SLUG)).not.toBeNull();
  });

  it('leaves the dates exactly as written', async () => {
    const { loadDemo } = await load(body());
    const demo = await loadDemo();
    expect(demo!.sports.volleyball.schedule![0].date).toBe('2026-09-01');
  });
});

describe('the store, in demo mode', () => {
  const stores = async () => {
    const { DEMO_SLUG } = await import('./demo');
    return { DEMO_SLUG, store: await import('./store'), rosterStore: await import('./rosterStore') };
  };

  it('serves the roster and the identity out of the file, and the season out of the directory', async () => {
    await load(body());
    const { DEMO_SLUG, store, rosterStore } = await stores();

    const identity = await rosterStore.loadSchoolSports(DEMO_SLUG);
    expect(identity!.sports).toEqual(['football', 'volleyball']);
    expect(identity!.colors).toEqual({ ground: '#04043a', accent: '#4fbaf7' });
    expect(identity!.logo).toMatch(/^data:image\/jpeg;base64,/);

    const roster = await rosterStore.loadSchoolRoster(DEMO_SLUG, 'volleyball');
    expect(roster!.players).toHaveLength(1);
    expect(roster!.schedule).toHaveLength(1);
    expect(roster!.league).toBeNull();

    // Poland's real season, from public/oh/data — real scores, weekly.
    const season = await store.loadSeason(DEMO_SLUG);
    expect(season.school.name).toBe('Poland Seminary');
    expect(season.games.length).toBeGreaterThanOrEqual(10);
  });

  it('asks the directory for a conference member the same way', async () => {
    await load(body());
    const { store } = await stores();
    const hubbard = await store.loadSeason('hubbard-hubbard');
    expect(hubbard.school.slug).toBe('hubbard-hubbard');
  });

  it('reads the forecast file like any school, and finds nothing in an empty one', async () => {
    await load(body());
    const { DEMO_SLUG, store } = await stores();
    expect(await store.loadWeather(DEMO_SLUG)).toBeNull();
  });

  it('leaves the kept-identity door where it was: null until the file lands', async () => {
    await load(body());
    const { DEMO_SLUG, rosterStore } = await stores();
    expect(rosterStore.keptSchoolSports(DEMO_SLUG)).toBeNull();
    await rosterStore.loadSchoolSports(DEMO_SLUG);
    expect(rosterStore.keptSchoolSports(DEMO_SLUG)!.sports).toHaveLength(2);
  });

  it('refuses to remember a sport, so every prospect gets the hub', async () => {
    await load(body());
    const { DEMO_SLUG, store } = await stores();
    const jar: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => jar[k] ?? null,
      setItem: (k: string, v: string) => {
        jar[k] = v;
      },
      removeItem: (k: string) => {
        delete jar[k];
      },
    });
    store.rememberSport(DEMO_SLUG, 'volleyball');
    expect(Object.keys(jar)).toEqual([]);
    expect(store.chosenSport(DEMO_SLUG)).toBeNull();
    jar[`oh.sport.${DEMO_SLUG}`] = 'basketball';
    expect(store.chosenSport(DEMO_SLUG)).toBeNull();
  });
});

describe('a file that is not what it should be', () => {
  const mangled: Array<[string, unknown]> = [
    ['not an object', 'nope'],
    ['no slug', { ...body(), slug: '' }],
    ['no sport names', { ...body(), sportNames: [] }],
    ['a sport with no squad', { ...body(), sports: { ...body().sports, football: { players: [], schedule: null } } }],
    ['a sport the names promise and the file has not got', { ...body(), sportNames: ['football', 'volleyball', 'lacrosse'] }],
    ['a schedule that is not a list', { ...body(), sports: { ...body().sports, volleyball: { players: [player(3)], schedule: 'soon' } } }],
  ];

  it.each(mangled)('reads %s as no demo rather than throwing', async (_label, mangledBody) => {
    const { loadDemo } = await load(mangledBody);
    await expect(loadDemo()).resolves.toBeNull();
  });

  it('ignores the seasons and weather an older generator baked in', async () => {
    const { loadDemo } = await load({ ...body(), seasons: {}, weather: { date: '2026-09-25' } });
    await expect(loadDemo()).resolves.not.toBeNull();
  });

  it('reads a file that will not come at all as no demo', async () => {
    vi.resetModules();
    vi.stubGlobal('location', { pathname: '/oh/demo/', search: '' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('no signal');
      }),
    );
    const { loadDemo } = await import('./demo');
    await expect(loadDemo()).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run to see the new tests fail**

Run: `npx vitest run src/oh/demo.test.ts`
Expected: FAIL — `DEMO_SLUG` is still Springfield; `asDemo` rejects a body with no `seasons`; the store test gets the demo body back for the season.

- [ ] **Step 3: Rewrite `src/oh/demo.ts`**

Replace the file with the version below. It keeps `isDemo`, the readers, `loadDemo`, `demoIdentity`, `keptDemoIdentity`, `demoRosterBody`; drops seasons, weather, the shift.
```ts
/*
 * The demo school.
 *
 * /oh/demo/ is a page a seller can hand a prospect: Poland Seminary, with
 * every varsity sport on its real calendar, out of one committed file. The
 * schedules are real — read off the school's own Eventlink feed by
 * scripts/build-demo.mjs — and the rosters are invented, because the root
 * app's roster travels by share code and this page asks the database for
 * nothing. The footer says so.
 *
 * What matters about this module is what it is *not*: it is not a second copy
 * of the School screen. The demo page mounts the real one, and two store
 * functions take a guard clause at the top that answers out of this file
 * instead of the network — the roster and the identity. The season, the
 * conference members and the forecast are not here at all: the demo's slug is
 * Poland's real directory slug, so those fall through to the same committed
 * files a real school's page reads, and football's scores arrive weekly on
 * their own.
 *
 * Nothing here imports a runtime value from store.ts or rosterStore.ts — those
 * two import from here, and a cycle between them would be a live hazard for the
 * sake of a validator. Types only, which are erased. The sanitizing is done on
 * the other side of the guard, by the same doors the network answers come
 * through.
 */

import type { Player } from '../types';
import type { School } from '../ohio/stateModel';
import type { ScheduleRow } from './scheduleParse';

/** The one school this page is about — Poland's real directory slug, so the
 * season, the conference and the forecast are the real ones. */
export const DEMO_SLUG = 'poland-seminary-poland';

/** The raw shape of one sport in the file: a squad, and the fixtures somebody
 * would have pasted for it. Football's are null — its fixtures come from the
 * season, exactly as a real paid school's do. */
export type DemoSport = { players: Player[]; schedule: ScheduleRow[] | null };

export type DemoData = {
  slug: string;
  season: number;
  school: School;
  /** Left unknown here and validated on the far side of the guard, by
   * rosterStore's own validators — this file must not hold a second opinion
   * about what a color or a badge is allowed to be. */
  colors: unknown;
  logo: unknown;
  league: unknown;
  sportNames: string[];
  sports: Record<string, DemoSport>;
};

/*
 * Which page this is.
 *
 * The path is the real answer — vite.oh.config.ts emits a file at
 * dist/oh/demo/index.html, so /oh/demo/ is a page that exists rather than a
 * route needing a fallback. `?demo` is kept as an alias because a seller may
 * reach this from a link, a QR code or a typed address, and a demo that quietly
 * turns into the directory is worse than a demo that is reachable two ways.
 *
 * `location` is guarded because the test environment for this project is node,
 * where there is no such global: off the page, nothing is the demo.
 */
const DEMO_PATH = /^\/oh\/demo(\/(index\.html)?)?$/;

/** `?demo=false` is somebody turning it off, not a flag that happens to be
 * present — the query string is the one place a reader can spell it either
 * way, and `has()` alone reads both as yes. */
const OFF = new Set(['false', '0', 'no', 'off']);

export function isDemo(): boolean {
  if (typeof location === 'undefined') return false;
  if (DEMO_PATH.test(location.pathname)) return true;
  const flag = new URLSearchParams(location.search).get('demo');
  return flag !== null && !OFF.has(flag.toLowerCase());
}

// ------------------------------------------------------------- reading it in

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const asSchool = (v: unknown): School | null => {
  if (!isRecord(v)) return null;
  return isText(v.slug) && isText(v.name) && typeof v.city === 'string'
    ? { slug: v.slug, name: v.name, city: v.city }
    : null;
};

/** A malformed file reads as no demo at all, rather than throwing into a
 * screen — the rule every other reader in this bundle keeps. Keys an older
 * generator wrote (seasons, weather) are simply not read. */
const asDemo = (v: unknown): DemoData | null => {
  if (!isRecord(v)) return null;
  if (!isText(v.slug) || !isCount(v.season)) return null;

  const school = asSchool(v.school);
  if (!school) return null;

  if (!Array.isArray(v.sportNames) || !v.sportNames.length || !v.sportNames.every(isText)) {
    return null;
  }
  if (!isRecord(v.sports)) return null;

  const sports: Record<string, DemoSport> = {};
  for (const name of v.sportNames as string[]) {
    const entry = v.sports[name];
    if (!isRecord(entry) || !Array.isArray(entry.players) || !entry.players.length) return null;
    if (entry.schedule !== null && !Array.isArray(entry.schedule)) return null;
    sports[name] = {
      players: entry.players as Player[],
      schedule: (entry.schedule as ScheduleRow[] | null) ?? null,
    };
  }

  return {
    slug: v.slug,
    season: v.season,
    school,
    colors: v.colors,
    logo: v.logo,
    league: v.league,
    sportNames: v.sportNames as string[],
    sports,
  };
};

/*
 * Fetched once, whatever asks for it.
 *
 * Three store functions and one of them synchronous, so the promise is held
 * rather than the callers coordinating: the first to ask starts the fetch and
 * every other one joins it. A failure memoizes as null on purpose — a demo page
 * whose data file is missing is broken, and retrying it on every screen change
 * would only be broken more slowly.
 */
let pending: Promise<DemoData | null> | null = null;
let arrived: DemoData | null = null;

export function loadDemo(): Promise<DemoData | null> {
  if (!pending) {
    pending = fetch('/oh/demo.json', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((body) => {
        arrived = asDemo(body);
        return arrived;
      })
      .catch(() => null);
  }
  return pending;
}

// ------------------------------------------------------- what the guards ask

/**
 * Who this school is, in the shape rosterStore's own `asIdentity` reads: the
 * sports it sells and the look to draw them in. Handed over raw, because the
 * validating belongs on the other side of the guard.
 */
const identityBody = (demo: DemoData): unknown => ({
  sports: demo.sportNames,
  colors: demo.colors,
  logo: demo.logo,
});

export async function demoIdentity(slug: string): Promise<unknown> {
  const demo = await loadDemo();
  return demo && slug === demo.slug ? identityBody(demo) : null;
}

/** The same answer without waiting, for the one caller that cannot: the kept
 * copy read during a render. Null until the fetch above has landed, which is
 * exactly what a first visit to a real school looks like. */
export function keptDemoIdentity(slug: string): unknown {
  return arrived && slug === arrived.slug ? identityBody(arrived) : null;
}

/**
 * One sport's roster, in the shape rosterStore's `parseCached` reads.
 *
 * The conference rides on football alone, because the standings are folded out
 * of football seasons and no other sport has anything to fold — the same rule
 * School.tsx applies when it decides whether to draw a fourth tab.
 */
export async function demoRosterBody(slug: string, sport: string): Promise<unknown> {
  const demo = await loadDemo();
  if (!demo || slug !== demo.slug) return null;
  const entry = demo.sports[sport];
  if (!entry) return null;
  return {
    season: demo.season,
    players: entry.players,
    colors: demo.colors,
    logo: demo.logo,
    schedule: entry.schedule,
    league: sport === 'football' ? demo.league : null,
  };
}
```

- [ ] **Step 4: Remove the two store branches**

In `src/oh/store.ts`:
- Line 13: `import { demoSeason, demoWeather, isDemo } from './demo';` → `import { isDemo } from './demo';`
- In `loadSeason`, delete the comment block and `if (isDemo()) { … }` (lines 183-193) so the function begins at `try {`. Put this one comment where they were:
```ts
  // The demo page takes no branch here: its slug is Poland's real one, so the
  // season it reads — and every conference member's — is the directory's own.
```
- In `loadWeather`, delete the comment and `if (isDemo()) return demoWeather(slug);` (lines 245-248). Nothing replaces them; the forecast file carries the demo slug's line because scripts/paid-weather.mjs adds it (Task 7).

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/oh/demo.test.ts src/oh/store.test.ts src/oh/rosterStore.test.ts && npx tsc --noEmit`
Expected: PASS. `tsc` will flag any leftover reference to `demoSeason`/`demoWeather`; there should be none outside the two files just edited.

- [ ] **Step 6: Commit**

```bash
git add src/oh/demo.ts src/oh/demo.test.ts src/oh/store.ts
git commit -m "Point the demo at Poland's real slug, so the season and the forecast are the directory's

The demo file stops carrying seasons, a forecast and a date shift. Its
slug is now the real one, and football, the NE8 table and the kickoff
weather fall through to the same committed files a real page reads.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The generator, and the committed file

**Files:**
- Rewrite: `scripts/build-demo.mjs` (whole file)
- Regenerate: `public/oh/demo.json`
- Modify: `src/oh/demo.test.ts` — add the "committed file" block

**Interfaces:**
- Consumes: `parseEventlink` from `src/oh/eventlink.ts` (Task 1); `.env.local`'s `EVENTLINK_ICS_URL` if present; `public/oh/data/poland-seminary-poland.json`; `teams/poland/logo.jpg`; `sharp`.
- Produces: `public/oh/demo.json` in the shape `DemoData` reads (Task 5) plus `generatedOn`.

- [ ] **Step 1: Write the generator**

Replace `scripts/build-demo.mjs` with:
```js
/*
 * The demo school, written out as one file.
 *
 * Everything a prospect is shown at /oh/demo/ comes from public/oh/demo.json:
 * Poland Seminary, its crest and colors, every varsity sport on its real
 * calendar, and an invented roster for each. The schedules are read off the
 * school's own Eventlink feed; the rosters are invented because the root app's
 * roster travels by share code and the demo asks the database for nothing.
 * Football's fixtures and scores, the conference table and the forecast are
 * not in here at all — the demo's slug is Poland's real one, so the page reads
 * those from the directory like any school's page does.
 *
 * Run by hand — `node scripts/build-demo.mjs` — then commit public/oh/demo.json
 * and, if the feed was fetched, the refreshed capture in src/oh/fixtures. It is
 * not part of `npm run build` and must not become part of it: it re-encodes a
 * crest through sharp and may reach the network, and the guarded build has no
 * business doing either.
 *
 * WHEN TO RE-RUN. Whenever the school's calendar changes, and when a season
 * turns — the athletic office enters winter and spring schedules as they are
 * set, and a re-run picks up the new sports. Scores on played volleyball and
 * soccer rows are invented, seeded from the row, so a re-run on the same feed
 * writes the same file. Set DEMO_TODAY=2026-11-01 to see what it writes on a
 * day of your choosing.
 *
 * THE FEED URL IS A SECRET. It is a personal subscription token and the repo is
 * public. It lives in .env.local as EVENTLINK_ICS_URL and nowhere else. Without
 * it the script reads the committed capture, which carries no token.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseEventlink } from '../src/oh/eventlink.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'src/oh/fixtures/eventlink-poland-2026.ics');
const out = join(root, 'public/oh/demo.json');

const fail = (message) => {
  console.error(`! ${message}`);
  process.exit(1);
};

// ------------------------------------------------------------------ identity

const SLUG = 'poland-seminary-poland';
const SEASON = 2026;

const seasonFile = join(root, `public/oh/data/${SLUG}.json`);
if (!existsSync(seasonFile)) fail(`${seasonFile} is not there — the directory has not been built.`);
const directory = JSON.parse(readFileSync(seasonFile, 'utf8'));
const SCHOOL = directory.school;

/** Poland's navy and light blue, from teams/poland/team.json. */
const COLORS = { ground: '#04043a', accent: '#4fbaf7' };

/*
 * The conference is the seven league games: weeks 4 to 10 of the directory's
 * season. A table one school short is worse than none, so a season missing a
 * game or a slug in that range stops the run.
 */
const games = directory.games ?? [];
if (games.length < 10) fail(`Poland's season has ${games.length} games; expected ten.`);
const members = games.filter((g) => g.week >= 4 && g.week <= 10).map((g) => g.opponentSlug);
if (members.length !== 7 || members.some((m) => typeof m !== 'string' || !m)) {
  fail('weeks 4–10 do not each carry an opponent slug; the conference cannot be listed.');
}
const LEAGUE = { name: 'Northeast 8', members };

// ------------------------------------------------------------------- crest

/*
 * Poland's badge, re-encoded small. JPEG rather than PNG because the badge is
 * a photograph-like image and comes out a fifth of the size; rosterStore's
 * LOGO_DATA_URI accepts it. The string is inlined in a committed JSON and
 * again in a CSS custom property, and is worth keeping small in both.
 */
const badge = await sharp(join(root, 'teams/poland/logo.jpg'))
  .resize(256, 256, { fit: 'inside' })
  .jpeg({ quality: 78 })
  .toBuffer();
const LOGO = `data:image/jpeg;base64,${badge.toString('base64')}`;
if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(LOGO)) fail('the badge did not encode.');

// ---------------------------------------------------------------- the feed

const readEnv = () => {
  const file = join(root, '.env.local');
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
};

let ics;
const url = readEnv().EVENTLINK_ICS_URL;
if (url) {
  const res = await fetch(url);
  if (!res.ok) fail(`the feed answered ${res.status}.`);
  ics = await res.text();
  if (!ics.includes('BEGIN:VCALENDAR')) fail('the feed did not answer with a calendar.');
  writeFileSync(fixture, ics);
  console.log(`fetched the feed; refreshed ${fixture}`);
} else if (existsSync(fixture)) {
  ics = readFileSync(fixture, 'utf8');
  console.log('no EVENTLINK_ICS_URL in .env.local; reading the committed capture');
} else {
  fail('no feed URL and no captured fixture — nothing to build from.');
}

const sports = parseEventlink(ics, SEASON);
if (sports.length < 10) fail(`only ${sports.length} sports came out of the feed; it has changed shape.`);
if (sports[0].sport !== 'football') fail('football is not on the calendar.');

// ------------------------------------------------------------------- today

/** Today, Eastern — the line between a row that gets a score and one that
 * does not. DEMO_TODAY overrides it for a look at another day. */
const TODAY =
  process.env.DEMO_TODAY ??
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) fail(`DEMO_TODAY must be YYYY-MM-DD, not "${TODAY}".`);

// ---------------------------------------------------------- seeded chance

/** A small deterministic generator, seeded from a string, so a re-run on the
 * same feed writes the same file and a diff shows only what changed. */
const seed = (text) => {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const rng = (text) => {
  let a = seed(text);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (r, list) => list[Math.floor(r() * list.length)];

/** Fisher–Yates, so the order depends on the seed and on nothing else. */
const shuffle = (r, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// -------------------------------------------------------------------- scores

/*
 * Only played volleyball and soccer rows get a score. A meet has no us/them,
 * and a golf score would be a lie. Sets for volleyball, goals for soccer, no
 * draws — the schedule chip has two states.
 */
const SCORED = new Set(['volleyball', 'boys soccer', 'girls soccer']);

const scoreFor = (sport, row) => {
  const r = rng(`${sport}|${row.date}|${row.opponent}`);
  const won = r() < 0.6;
  if (sport === 'volleyball') {
    const lost = pick(r, [0, 1, 2]);
    return won ? { us: 3, them: lost } : { us: lost, them: 3 };
  }
  const high = 1 + Math.floor(r() * 4);
  const low = Math.floor(r() * high);
  return won ? { us: high, them: low } : { us: low, them: high };
};

const withScores = (sport, rows) =>
  rows.map((row) => (SCORED.has(sport) && row.date < TODAY ? { ...row, score: scoreFor(sport, row) } : row));

// ------------------------------------------------------------------- rosters

/*
 * Invented players. The pools are generic on purpose and the generator's own;
 * none is drawn from any Poland roster. Last names are unique within a sport
 * so two players are never confused on the Team tab.
 */
const FIRST = [
  'Aiden', 'Ben', 'Caleb', 'Drew', 'Eli', 'Finn', 'Gavin', 'Hayden', 'Ian', 'Jake',
  'Kai', 'Liam', 'Mason', 'Nolan', 'Owen', 'Parker', 'Quinn', 'Reid', 'Sam', 'Tyler',
  'Ava', 'Bella', 'Chloe', 'Delaney', 'Ella', 'Faith', 'Grace', 'Hannah', 'Isla', 'Jenna',
  'Kate', 'Lila', 'Maya', 'Nora', 'Olivia', 'Paige', 'Reese', 'Sadie', 'Tessa', 'Zoe',
];
const LAST = [
  'Abbott', 'Barlow', 'Carver', 'Dawson', 'Ellery', 'Fenwick', 'Garner', 'Holloway', 'Ingram',
  'Jarvis', 'Keaton', 'Lockhart', 'Marlow', 'Naylor', 'Oakes', 'Pruett', 'Quimby', 'Rowan',
  'Sutton', 'Thorne', 'Underhill', 'Vance', 'Whitaker', 'Yates', 'Ashby', 'Bexley', 'Corwin',
  'Denholm', 'Everly', 'Fairbanks', 'Greer', 'Hollis', 'Iverson', 'Kendrick', 'Lyle', 'Merritt',
  'Norwood', 'Pemberton', 'Radley', 'Stroud', 'Tilden', 'Wakefield',
];
const GRADES = ['Fr', 'So', 'Jr', 'Sr'];

const BOYS_FIRST = FIRST.slice(0, 20);
const GIRLS_FIRST = FIRST.slice(20);

/** Which first-name pool a sport draws from. Coed sports draw from both. */
const namesFor = (sport) => {
  if (/^girls |^volleyball$|^softball$/.test(sport)) return GIRLS_FIRST;
  if (/^boys |^football$|^baseball$/.test(sport)) return BOYS_FIRST;
  return FIRST;
};

/** Squad size, the number range, and the positions a sport's Team tab filters by. */
const SHAPE = {
  football: { size: 40, numbers: [1, 99], positions: ['QB', 'RB', 'WR', 'WR', 'TE', 'OL', 'OL', 'OL', 'DL', 'DL', 'LB', 'LB', 'CB', 'CB', 'S', 'K', 'P', 'WR/CB', 'RB/LB', 'QB/S'] },
  volleyball: { size: 13, numbers: [1, 25], positions: ['S', 'OH', 'OH', 'MB', 'MB', 'OPP', 'L', 'DS'] },
  'boys soccer': { size: 20, numbers: [0, 30], positions: ['GK', 'D', 'D', 'M', 'M', 'F'] },
  'girls soccer': { size: 20, numbers: [0, 30], positions: ['GK', 'D', 'D', 'M', 'M', 'F'] },
  'boys basketball': { size: 13, numbers: [0, 55], positions: ['G', 'G', 'F', 'F', 'C'] },
  'girls basketball': { size: 13, numbers: [0, 55], positions: ['G', 'G', 'F', 'F', 'C'] },
  baseball: { size: 18, numbers: [1, 40], positions: ['P', 'P', 'C', '1B', '2B', '3B', 'SS', 'OF', 'OF'] },
  softball: { size: 18, numbers: [1, 40], positions: ['P', 'P', 'C', '1B', '2B', '3B', 'SS', 'OF', 'OF'] },
  'boys lacrosse': { size: 22, numbers: [1, 45], positions: ['G', 'D', 'D', 'M', 'M', 'A'] },
  'girls lacrosse': { size: 22, numbers: [1, 45], positions: ['G', 'D', 'D', 'M', 'M', 'A'] },
};
const DEFAULT_SHAPE = { size: 16, numbers: [1, 40], positions: [] };

/** A football player's side of the ball, read off the position the way the
 * root app's roster filters do; a slash means both ways, which is ''. */
const OFFENSE = new Set(['QB', 'RB', 'WR', 'TE', 'OL', 'FB', 'C', 'OT', 'OG']);
const DEFENSE = new Set(['DL', 'DT', 'DE', 'LB', 'CB', 'S']);
const SPECIAL = new Set(['K', 'P']);
const sideOf = (position) => {
  if (position.includes('/')) return '';
  if (OFFENSE.has(position)) return 'O';
  if (DEFENSE.has(position)) return 'D';
  if (SPECIAL.has(position)) return 'ST';
  return '';
};

const rosterFor = (sport) => {
  const r = rng(`roster|${sport}`);
  const shape = SHAPE[sport] ?? DEFAULT_SHAPE;
  const firsts = namesFor(sport);
  const lasts = shuffle(r, LAST).slice(0, shape.size);
  const numbers = new Set();
  const [lo, hi] = shape.numbers;
  while (numbers.size < shape.size) numbers.add(lo + Math.floor(r() * (hi - lo + 1)));
  const key = sport.replace(/ /g, '-');
  return [...numbers]
    .sort((a, b) => a - b)
    .map((number, i) => {
      const position = shape.positions.length ? pick(r, shape.positions) : '';
      const player = {
        id: `${key}-${number}`,
        number: String(number),
        firstName: pick(r, firsts),
        lastName: lasts[i],
        position,
        side: sport === 'football' ? sideOf(position) : '',
        grade: pick(r, GRADES),
      };
      if (sport === 'football') {
        player.heightIn = 66 + Math.floor(r() * 12);
        player.weightLb = 150 + Math.floor(r() * 130);
      }
      return player;
    });
};

// -------------------------------------------------------------------- write

const demoSports = {};
for (const { sport, rows } of sports) {
  demoSports[sport] = {
    players: rosterFor(sport),
    // Football's fixtures come from the directory, as a real paid school's do.
    schedule: sport === 'football' ? null : withScores(sport, rows),
  };
}

const demo = {
  slug: SLUG,
  season: SEASON,
  generatedOn: TODAY,
  school: SCHOOL,
  colors: COLORS,
  logo: LOGO,
  league: LEAGUE,
  sportNames: sports.map((s) => s.sport),
  sports: demoSports,
};

writeFileSync(out, `${JSON.stringify(demo, null, 2)}\n`);

console.log(`wrote ${out} for ${SCHOOL.name}, season ${SEASON}, as of ${TODAY}`);
console.log(`  conference: ${LEAGUE.name} — ${members.join(', ')}`);
for (const { sport, rows } of sports) {
  const entry = demoSports[sport];
  const scored = entry.schedule ? entry.schedule.filter((r) => r.score).length : 0;
  const fixtures = entry.schedule ? `${entry.schedule.length} fixtures, ${scored} scored` : 'fixtures from the directory';
  console.log(`  ${sport.padEnd(18)} ${String(entry.players.length).padStart(2)} players, ${fixtures}`);
}
```

- [ ] **Step 2: Run it**

Run: `node scripts/build-demo.mjs`
Expected: prints the fetch line (the owner's `.env.local` has the URL) or the fixture line, the conference with seven slugs, and one line per sport — 11 sports as of the 2026-09-11 capture, football with fixtures from the directory, volleyball and both soccers with some rows scored, the rest "0 scored". The write must not fail.

Then: `git status --short` — expect `public/oh/demo.json` modified and possibly `src/oh/fixtures/eventlink-poland-2026.ics` modified (a fresh fetch). If the fixture changed, re-run `npx vitest run src/oh/eventlink.test.ts`; if the per-sport counts moved because the athletic office added games, update the expected counts in that test **and say so in the commit message**. If it fails for any other reason, restore the fixture with `git checkout src/oh/fixtures/eventlink-poland-2026.ics` and rerun the generator without the URL to diagnose.

Check the file size: `Get-Item public/oh/demo.json | Select-Object Length` — expect under 200 kB. The logo is the bulk; if it is over 60 kB alone, lower `quality` to 70.

- [ ] **Step 3: Add the committed-file tests**

Append to `src/oh/demo.test.ts`:
```ts
/*
 * The committed file itself. public/oh/demo.json is written by a hand-run
 * script and read by the store, so a regeneration that changes its shape
 * fails here rather than on a prospect's phone.
 */
describe('the committed file', () => {
  const DEMO_FILE = new URL('../../public/oh/demo.json', import.meta.url);
  const committed = () => JSON.parse(readFileSync(DEMO_FILE, 'utf8')) as Record<string, unknown>;

  it('reads as the demo, for Poland, with football first', async () => {
    const { loadDemo, DEMO_SLUG } = await load(committed());
    const demo = await loadDemo();
    expect(demo).not.toBeNull();
    expect(demo!.slug).toBe(DEMO_SLUG);
    expect(demo!.school.name).toBe('Poland Seminary');
    expect(demo!.sportNames[0]).toBe('football');
    expect(demo!.sportNames.length).toBeGreaterThanOrEqual(10);
  });

  it('carries a squad for every sport, and pasted fixtures for every sport but football', async () => {
    const { loadDemo } = await load(committed());
    const demo = (await loadDemo())!;
    for (const name of demo.sportNames) {
      const entry = demo.sports[name];
      expect(entry.players.length, name).toBeGreaterThan(0);
      const numbers = entry.players.map((p) => p.number);
      expect(new Set(numbers).size, `${name} numbers`).toBe(numbers.length);
      if (name === 'football') expect(entry.schedule).toBeNull();
      else expect(entry.schedule!.length, name).toBeGreaterThan(0);
    }
  });

  it('scores only what has been played, and only where a score means something', async () => {
    const { loadDemo } = await load(committed());
    const demo = (await loadDemo())!;
    const generatedOn = committed().generatedOn as string;
    for (const name of demo.sportNames) {
      for (const row of demo.sports[name].schedule ?? []) {
        if (row.score) {
          expect(['volleyball', 'boys soccer', 'girls soccer'], `${name} ${row.date}`).toContain(name);
          expect(row.date < generatedOn, `${name} ${row.date} scored ahead of time`).toBe(true);
          expect(row.score.us, `${name} ${row.date} drawn`).not.toBe(row.score.them);
        }
      }
    }
  });

  it('names the conference by the seven league games in the directory', async () => {
    const { loadDemo } = await load(committed());
    const demo = (await loadDemo())!;
    const league = demo.league as { name: string; members: string[] };
    expect(league.name).toBe('Northeast 8');
    expect(league.members).toHaveLength(7);
    const seasonFile = new URL('../../public/oh/data/poland-seminary-poland.json', import.meta.url);
    const games = (JSON.parse(readFileSync(seasonFile, 'utf8')) as { games: { week: number; opponentSlug: string }[] }).games;
    expect(league.members).toEqual(games.filter((g) => g.week >= 4 && g.week <= 10).map((g) => g.opponentSlug));
  });

  it('passes the store’s own colour and badge checks', async () => {
    await load(committed());
    const { DEMO_SLUG } = await import('./demo');
    const rosterStore = await import('./rosterStore');
    const identity = await rosterStore.loadSchoolSports(DEMO_SLUG);
    expect(identity!.colors).toEqual({ ground: '#04043a', accent: '#4fbaf7' });
    expect(identity!.logo).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('names only sports the hub can draw and place in a season', async () => {
    const { knownSports } = await import('./sportSeasons');
    const { glyphFor } = await import('./SportGlyph');
    const known = new Set(knownSports());
    for (const name of committed().sportNames as string[]) {
      const bare = name.replace(/^(boys|girls|coed) /, '');
      expect(known.has(name) || known.has(bare), name).toBe(true);
      expect(glyphFor(name), name).not.toBe('generic');
    }
  });
});
```

- [ ] **Step 4: Run the whole suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-demo.mjs public/oh/demo.json src/oh/demo.test.ts src/oh/fixtures/eventlink-poland-2026.ics
git commit -m "Write the demo as Poland, every varsity sport off its own calendar

Springfield Local proved the page; a real school's calendar is what
proves the hub. Rosters stay invented and the footer says so. The feed
URL stays in .env.local; without it the script reads the capture.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The forecast covers the demo

**Files:**
- Modify: `scripts/paid-weather.mjs:64-82` (the slug list) and `:162-167` (the write)

**Interfaces:**
- Consumes: `public/oh/demo.json`'s `slug` (Task 6).
- No test harness exists for this script; verify by running it.

- [ ] **Step 1: Merge the demo slug into the list**

After `const paid = usable ? listed : [];` (line 67) and its warning block (ends line 78), add:
```js
  /*
   * The demo page is forecast too. It is not a paying school and must never be
   * written into paid-schools.json, so its slug is read off its own file: the
   * seller's demo shows the kickoff sky the way a paying page does, and a
   * missing demo file is one quiet line, not a failed run.
   */
  const demoFile = join(root, 'public/oh/demo.json');
  let demoSlug = null;
  try {
    const demo = await read(demoFile);
    if (typeof demo.slug === 'string' && demo.slug) demoSlug = demo.slug;
  } catch {
    console.log('  · no demo file to forecast for.');
  }
  const slugs = demoSlug && !paid.includes(demoSlug) ? [...paid, demoSlug] : paid;
```
Change `for (const slug of paid) {` (line 82) to `for (const slug of slugs) {`.
In the write block change `for (const slug of paid) if (kept[slug]) out[slug] = kept[slug];` to iterate `slugs`, and the log line to:
```js
    console.log(`weather.json: ${Object.keys(forecasts).length} of ${slugs.length} schools (${paid.length} paid).`);
```
Leave the `!usable` guard and the "nothing came back" guard as they are — `paid.length` in the latter still means a genuinely empty paid list clears the file except for the demo's own line, which is what the comment above it promises.

- [ ] **Step 2: Run it**

Run: `node scripts/paid-weather.mjs`
Expected: a `✓ poland-seminary-poland: …` line (or `· poland-seminary-poland: nothing left to play.` late in the season), the Strasburg line as before, and `weather.json: N of 2 schools (1 paid).` Then `git diff --stat public/oh/weather.json` shows the file changed — **do not commit `public/oh/weather.json`**; the refresh workflow writes it at deploy time. Restore it: `git checkout public/oh/weather.json`.

- [ ] **Step 3: Full tests still green, then commit**

Run: `npx vitest run`
```bash
git add scripts/paid-weather.mjs
git commit -m "Forecast the demo page's next kickoff without calling it a paying school

The slug comes off the demo file itself, so paid-schools.json stays the
list of who pays.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Copy and docs

**Files:**
- Modify: `oh/demo/index.html:8-10`
- Modify: `docs/selling.md` ("What to show a prospect" and "More than one sport")
- Modify: `CLAUDE.md` ("Where things stand" and open items)
- Modify: `.env.example`

- [ ] **Step 1: The demo page's head**

In `oh/demo/index.html` change the three lines:
```html
    <meta name="theme-color" content="#04043a" />
    <meta name="description" content="Poland Seminary — what a school gets when it signs up." />
    <title>Poland Seminary — a demo</title>
```

- [ ] **Step 2: selling.md**

Replace the whole "What to show a prospect" section (from `## What to show a prospect` to the line before `## Activate a school`) with:
```markdown
## What to show a prospect

https://roster.scottforge.ai/oh/demo/ — open it on a phone and hand it over.
No login, no setup, nothing to explain first.

It is Poland Seminary, in its own colors and crest, with every varsity sport
on its real calendar — read off the school's Eventlink feed, so the opponents,
dates and times are the ones on the school's own site. Whatever month you are
selling in, some tiles read "In season" and the rest say when they come back.
Football carries real scores, the NE8 standings and a forecast at kickoff,
straight from the directory. Each sport opens on its schedule, and on the
keypad while a game is on.

The rosters are invented. The root app's roster travels by share code and the
demo asks the database for nothing, so a quiet line in the footer says
"Sample rosters — the schedules are real." Scores on played volleyball and
soccer rows are invented too; meets are left unscored.

It works with no signal once loaded, and it asks the database for nothing —
so it is safe to show on a school's guest wifi, in a car park, anywhere.

**Maintenance:** the calendar is a snapshot. When the athletic office enters
a new season's schedules, or changes one, run `node scripts/build-demo.mjs`
and commit `public/oh/demo.json` together with the refreshed capture at
`src/oh/fixtures/eventlink-poland-2026.ics`. The script reads the feed URL
from `EVENTLINK_ICS_URL` in `.env.local` — a personal subscription token that
must never be committed — and without it rebuilds from the committed capture.
```
In "More than one sport", after the first paragraph add:
```markdown
Name the gender for basketball, soccer, golf, tennis, wrestling and lacrosse —
"girls basketball", "boys tennis" — so the hub draws two tiles for a school
that fields both and puts each in its own season. Tennis in particular has to
say: girls play in the autumn, boys in the spring, and a bare "tennis" is
nobody's season.
```

- [ ] **Step 3: CLAUDE.md**

In "Where things stand", after the "Shipped, pending migration" paragraph add:
```markdown
**The demo is Poland (2026-09-11):** `/oh/demo/` is Poland Seminary with every varsity sport on
its real Eventlink calendar (`scripts/build-demo.mjs` → `public/oh/demo.json`, parser in
`src/oh/eventlink.ts` pinned to `src/oh/fixtures/eventlink-poland-2026.ics`). Rosters invented,
footer says so; football/standings/weather read the real directory files because the demo slug is
Poland's real one. Feed URL is `EVENTLINK_ICS_URL` in `.env.local`, never committed. Sport pages
land on Schedule, or Lookup during a game (`src/oh/landing.ts`). Gendered sport names (`boys
basketball`, `girls tennis`) are understood by the season table and glyphs; bare `tennis` is no
longer a season. Pasted schedules split Played/Coming up by date, not by score.
```
Add to the open items list, after item 5:
```markdown
6. **Eventlink is a scrapeable multi-sport schedule source.** The demo reads Poland's feed; a
   paying school that shares its Eventlink subscription URL could have every sport's schedule
   automated instead of concierge-pasted. Not built — needs a per-school URL in the panel and a
   refresh job. Changes the phase 3 picture.
```
Renumber the two items after it.

- [ ] **Step 4: .env.example**

Append:
```
# Poland's Eventlink calendar, for scripts/build-demo.mjs. A personal
# subscription token — this one is genuinely secret and must never be committed
# or shipped. Leave it unset and the script rebuilds from the committed capture.
EVENTLINK_ICS_URL=
```

- [ ] **Step 5: Commit**

```bash
git add oh/demo/index.html docs/selling.md CLAUDE.md .env.example
git commit -m "Say the demo is Poland, and how to keep its calendar current

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Build, guard, and the browser check

**Files:** none modified unless something is found.

- [ ] **Step 1: Everything green**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests pass; build completes; the final guard prints that the three pages are untouched and the precache is 32 entries. If the guard fails, the failure is in this branch — nothing here may touch the root pages. Find it; never edit the baseline.

- [ ] **Step 2: Preview the built site**

Use the Browser pane (`preview_start` with a launch.json entry running `npm run preview` on port 4173, or `vite preview --host`). Open `http://localhost:4173/oh/demo/`. Set the viewport to 375×812.

Check, with screenshots for the report:
1. The hub shows Poland Seminary, the crest, navy ground, and one tile per sport (11 as of the capture) with in-season sports first and "Starts in …" on the rest. Tiles read "Girls Soccer", "Boys Golf".
2. Tap Football: lands on **Schedule** (no game on at check time) with real scores from the directory under Played and a forecast on the next fixture if `public/oh/weather.json` carries Poland (it will not until the refresh runs; note that). The tab bar shows Lookup, Team, Schedule, League. League shows the NE8 table with eight rows.
3. Tap Lookup on football, type a number, see a player. Team tab filters by Offense/Defense.
4. Back to the hub, tap Volleyball: lands on Schedule; played rows carry W/L chips with set scores; future rows carry times.
5. Tap Cross Country: lands on Schedule; past meets sit under Played with their time and no chip; future meets under Coming up.
6. Tap Girls Tennis: tile said "In season" in September; roster has no positions so Team is a bare search box.
7. The footer reads "Sample rosters — the schedules are real".
8. `read_console_messages` shows no errors.

- [ ] **Step 3: The real Poland page is unchanged in behaviour**

Open `http://localhost:4173/oh/` and follow Poland Seminary. It has no paid rows, so it shows the football-only page as before. Open `http://localhost:4173/` and confirm Poland's root app renders.

- [ ] **Step 4: Report**

No commit. Report the screenshots and anything found. If anything was fixed, it goes in its own commit with a message saying what the browser showed.

---

## Self-review notes

- Spec §1 parser → Task 1. §2 generator → Task 6 (env, identity, sports, scores, rosters, league, refusals all present). §3 loader → Task 5; weather merge → Task 7. §4 gendered names → Task 2. §5 landing → Tasks 3 and 4. §6 copy → Tasks 4 and 8. §7 pasted split by date → Task 4. Testing section → Tasks 1–6 and 9.
- Names used across tasks: `parseEventlink` (1→6), `landingTab`/`LandingFixture` (3→4), `DEMO_SLUG` (5→6 tests), `glyphFor` (2→6 tests), `knownSports` (2→6 tests). All consistent.
- Task 5's tests run against a synthetic body so the suite is green before Task 6 regenerates the file; Task 6 adds the committed-file block. Nothing between tasks is red.
