/* Roster — Springfield Tigers (New Middletown, OH) spot. */
const { useComposition, Shot, Captions, Easing, animate, interpolate, clamp, CompositionStage } = window;
const { useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakColor, TweakText } = window;

const W = 1080, H = 1920;

const C = {
  bg: '#0e0c0b',
  bgDeep: '#050404',
  head: '#f4a06b',
  muted: '#d9cfc7',
  dim: '#a0948c',
  line: 'rgba(255,255,255,0.11)',
  key: '#2a2320',
  keyEdge: '#4a3d36',
  card: '#1f1714',
  cardEdge: '#f26722',
  win: '#63e2a4',
  loss: '#ff8f8f',
};
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/* three motion helpers — nothing eases outside these */
const MOTION = {
  enter: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 0.6), ease: Easing.easeOutCubic }),
  pop: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 0.42), ease: Easing.easeOutBack }),
  glide: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 0.9), ease: Easing.easeInOutCubic }),
};

const ROSTER = [
  { n: 1, name: 'Owen Carter', ht: '5\'9"', wt: '175 lb', yr: 'Jr', pos: 'QB/DB' },
  { n: 2, name: 'Jalen Reyes', ht: '6\'1"', wt: '185 lb', yr: 'So', pos: 'QB/DB' },
  { n: 3, name: 'Eli Novak', ht: '5\'8"', wt: '160 lb', yr: 'Sr', pos: 'WR/DB' },
  { n: 4, name: 'Drew Halloran', ht: '6\'0"', wt: '180 lb', yr: 'Jr', pos: 'WR/LB' },
  { n: 5, name: 'Kai Mercer', ht: '5\'8"', wt: '165 lb', yr: 'Sr', pos: 'RB/DB' },
  { n: 6, name: 'Sam Whitfield', ht: '5\'10"', wt: '170 lb', yr: 'Sr', pos: 'RB/LB' },
  { n: 7, name: 'Tobias Kerr', ht: '6\'3"', wt: '170 lb', yr: 'Jr', pos: 'TE/LB' },
];

const PLAYERS = {
  '2': { n: '2', name: 'Jalen Reyes', pos: 'QB/DB', yr: 'Sophomore', ht: '6\'1"', wt: '185 lb',
    stats: [['Passing', '96 yds · 1 TD · 9 att', '—'], ['Rushing', '38 yds · 12 car', '—'], ['Defense', '11 tkl', '—']] },
  '24': { n: '24', name: 'Marcus Bell', pos: 'RB/LB', yr: 'Senior', ht: '5\'11"', wt: '195 lb',
    stats: [['Rushing', '812 yds · 9 TD · 141 car · 5.8 avg', '64 yds'], ['Receiving', '143 yds · 11 rec', '—'], ['Defense', '38 tkl', '4 tkl']] },
};

const GAMES = [
  { m: 'AUG', d: '28', vs: 'vs', opp: 'Brookfield', note: 'Home opener', t: '7:00 PM' },
  { m: 'SEP', d: '4', vs: 'vs', opp: 'Garfield', note: 'Home', t: '7:00 PM' },
  { m: 'SEP', d: '11', vs: 'at', opp: 'Mineral Ridge', note: 'MVAC Scarlet', t: '7:00 PM' },
  { m: 'SEP', d: '18', vs: 'at', opp: 'Waterloo', note: 'MVAC Scarlet', t: '7:00 PM' },
  { m: 'SEP', d: '25', vs: 'vs', opp: 'Campbell Memorial', note: 'MVAC Scarlet', t: '7:00 PM' },
];

const TABS = ['Lookup', 'Team', 'Schedule', 'League'];

const SPORTS = [
  { name: 'Football', icon: 'sports_football', note: 'In season', off: false },
  { name: 'Volleyball', icon: 'sports_volleyball', note: 'In season', off: false },
  { name: 'Basketball', icon: 'sports_basketball', note: 'Starts in November', off: true },
];

function HubPane({ T, t0, accent, team, tapAt }) {
  const tap = clamp(1 - Math.abs(T - tapAt) / 0.34, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 24, padding: '86px 40px 30px',
        borderBottom: `2px solid ${C.line}`, background: 'rgba(14,12,11,0.72)',
        opacity: MOTION.enter(t0, 0.5)(T),
      }}>
        <Logo width={150} />
        <div>
          <div style={{ font: `700 38px/1.2 ${FONT}`, letterSpacing: '0.02em', color: '#fff' }}>{team}</div>
          <div style={{ font: `600 22px/1.4 ${FONT}`, letterSpacing: '0.1em', color: C.head, whiteSpace: 'nowrap' }}>NEW MIDDLETOWN, OHIO</div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {SPORTS.map((sp, i) => {
          const e = MOTION.enter(t0 + 0.18 + i * 0.13, 0.55)(T);
          const hot = i === 0 ? tap : 0;
          return (
            <div key={sp.name} style={{
              position: 'relative', flex: 1, display: 'flex', alignItems: 'center', padding: '0 44px',
              borderBottom: `2px solid ${C.line}`, overflow: 'hidden',
              background: `linear-gradient(90deg, rgba(242,103,34,${0.2 + hot * 0.2}), rgba(42,35,32,${0.42 + hot * 0.2}))`,
              opacity: clamp(e * 1.3, 0, 1), transform: `translateX(${(1 - e) * -40}px)`,
            }}>
              <span className="ms" style={{
                position: 'absolute', right: -56, top: '50%', transform: 'translateY(-50%)',
                fontSize: 380, color: 'rgba(255,255,255,0.09)',
                fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 48",
              }}>{sp.icon}</span>
              <div style={{ position: 'relative' }}>
                <div style={{
                  font: `400 92px/1 Anton, ${FONT}`, textTransform: 'uppercase',
                  letterSpacing: '0.01em', color: '#fff',
                }}>{sp.name}</div>
                <div style={{
                  font: `600 26px/1.4 ${FONT}`, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: sp.off ? C.dim : accent, marginTop: 14,
                }}>{sp.note}</div>
              </div>
              {sp.off && <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,4,4,0.5)' }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
const CHROME_H = 246;
const PANE = { position: 'absolute', left: 0, right: 0, top: CHROME_H, bottom: 0 };
const fadeIn = (T, at) => clamp((T - at) / 0.22, 0, 1);

/* ---------- app chrome ---------- */

function Logo({ width, style }) {
  return (
    <img src="tigers-logo.png" alt="Springfield Tigers" style={{
      width, height: width * 0.6, objectFit: 'cover', display: 'block',
      clipPath: 'ellipse(47% 45.5% at 50% 50%)', ...style,
    }} />
  );
}

function Watermark() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <Logo width={1500} style={{ position: 'absolute', left: '50%', top: 820, transform: 'translate(-50%,-50%) rotate(-8deg)', opacity: 0.06, filter: 'grayscale(1)' }} />
    </div>
  );
}

function WatermarkOld() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', left: '50%', top: 780, transform: 'translate(-50%,-50%) rotate(-8deg)',
        font: `900 1500px/1 ${FONT}`, color: '#ffffff', opacity: 0.045, letterSpacing: '-0.06em',
      }}>R</div>
    </div>
  );
}

function Chrome({ T, tabX, accent, team }) {
  const cols = [0.5, 1.5, 2.5, 3.5];
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ padding: '86px 40px 0', font: `600 34px/1 ${FONT}`, letterSpacing: '0.09em', color: C.head }}>
        {team.toUpperCase()}
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', marginTop: 44 }}>
        {TABS.map((t, i) => (
          <div key={t} style={{
            textAlign: 'center', paddingBottom: 22,
            font: `${Math.abs(tabX - i) < 0.5 ? 700 : 500} 42px/1 ${FONT}`,
            color: Math.abs(tabX - i) < 0.5 ? '#fff' : '#b8aba2',
          }}>{t}</div>
        ))}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, height: 6, width: 200, borderRadius: 3, background: accent,
          transform: `translateX(${(W / 4) * (tabX + 0.5) - 100}px)`,
        }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: C.line }} />
      </div>
    </div>
  );
}

/* ---------- lookup ---------- */

function Keypad({ T, presses, accent }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, padding: '26px 34px 0',
      borderTop: `2px solid ${C.line}`,
    }}>
      {keys.map((k) => {
        const hit = presses.find((p) => p.d === k);
        const a = hit ? clamp(1 - Math.abs(T - hit.at) / 0.3, 0, 1) : 0;
        const soft = k === 'clear' || k === 'back';
        return (
          <div key={k} style={{
            height: 158, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: soft ? 'rgba(42,35,32,0.45)' : `rgba(${42 + a * 200},${35 + a * 68},${32 + a * 2},1)`,
            border: `2px solid ${soft ? 'rgba(74,61,54,0.5)' : C.keyEdge}`,
            transform: `scale(${1 - a * 0.05})`,
            font: `${soft ? 500 : 400} ${k === 'clear' ? 40 : 76}px/1 ${FONT}`,
            color: soft ? C.dim : '#fff',
            boxShadow: a > 0 ? `0 0 ${a * 60}px rgba(242,103,34,${a * 0.5})` : 'none',
          }}>{k === 'back' ? '⌫' : k}</div>
        );
      })}
    </div>
  );
}

function PlayerCard({ p, t0, T, accent }) {
  const e = MOTION.pop(t0, 0.5)(T);
  return (
    <div style={{ padding: '46px 40px 0', opacity: clamp(e * 1.3, 0, 1), transform: `translateY(${(1 - e) * 34}px)` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 34 }}>
        <div style={{ font: `700 168px/0.82 ${FONT}`, color: accent, letterSpacing: '-0.04em' }}>{p.n}</div>
        <div style={{ paddingTop: 6 }}>
          <div style={{ font: `700 76px/1.05 ${FONT}`, color: '#fff', letterSpacing: '-0.02em' }}>{p.name}</div>
          <div style={{ font: `600 40px/1.5 ${FONT}`, color: C.muted, marginTop: 10 }}>{p.pos} · {p.yr}</div>
          <div style={{ font: `400 38px/1.4 ${FONT}`, color: C.dim }}>{p.ht} · {p.wt}</div>
        </div>
      </div>
      <div style={{ marginTop: 40, borderTop: `2px solid ${C.line}` }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', padding: '26px 0 18px' }}>
        <div />
        <div style={{ font: `700 28px/1 ${FONT}`, letterSpacing: '0.1em', color: C.head }}>LAST SEASON</div>
        <div style={{ font: `700 28px/1 ${FONT}`, letterSpacing: '0.1em', color: C.head }}>THIS SEASON</div>
      </div>
      {p.stats.map((row, i) => (
        <div key={row[0]} style={{
          display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', alignItems: 'center', gap: 12,
          padding: '22px 0', borderTop: `2px solid ${C.line}`,
          opacity: MOTION.enter(t0 + 0.24 + i * 0.11, 0.45)(T),
        }}>
          <div style={{ font: `600 34px/1.2 ${FONT}`, color: C.muted }}>{row[0]}</div>
          <div style={{ font: `400 34px/1.3 ${FONT}`, color: '#fff' }}>{row[1]}</div>
          <div style={{ font: `400 34px/1.3 ${FONT}`, color: C.dim }}>{row[2]}</div>
        </div>
      ))}
    </div>
  );
}

function LookupPane({ T, cues, accent, team, presses }) {
  const digits = T >= cues.k2 ? '24' : T >= cues.k1 ? '2' : '';
  const p = PLAYERS[digits];
  const hintOut = clamp(1 - MOTION.enter(cues.k1 - 0.15, 0.3)(T), 0, 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {!p && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 26, opacity: hintOut,
          }}>
            <div style={{ font: `400 54px/1 ${FONT}`, color: '#f3ece6' }}>Tap a jersey number.</div>
            <div style={{ font: `400 38px/1 ${FONT}`, color: C.dim }}>48 players · {team}</div>
          </div>
        )}
        {p && <PlayerCard p={p} t0={digits === '24' ? cues.k2 : cues.k1} T={T} accent={accent} />}
      </div>
      <Keypad T={T} presses={presses} accent={accent} />
    </div>
  );
}

/* ---------- team ---------- */

function TeamPane({ T, t0, accent }) {
  const chips = ['All', 'Offense', 'Defense', 'Special'];
  return (
    <div style={{ padding: '30px 40px 0' }}>
      <div style={{ display: 'flex', gap: 18, opacity: MOTION.enter(t0, 0.4)(T) }}>
        <div style={{
          flex: 1, height: 108, borderRadius: 18, background: 'rgba(42,35,32,0.55)', border: `2px solid ${C.keyEdge}`,
          display: 'flex', alignItems: 'center', padding: '0 30px', font: `400 40px/1 ${FONT}`, color: '#a0948c',
        }}>Name, number or position</div>
        <div style={{
          width: 260, height: 108, borderRadius: 18, background: 'rgba(42,35,32,0.55)', border: `2px solid ${C.keyEdge}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', font: `600 40px/1 ${FONT}`, color: '#f3ece6',
        }}>Position</div>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 20, padding: 8,
        background: 'rgba(42,35,32,0.55)', borderRadius: 20, opacity: MOTION.enter(t0 + 0.1, 0.4)(T),
      }}>
        {chips.map((c, i) => (
          <div key={c} style={{
            height: 92, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: i === 0 ? '#fff' : 'transparent', color: i === 0 ? '#0e0c0b' : '#e8ded6',
            font: `${i === 0 ? 700 : 500} 40px/1 ${FONT}`,
          }}>{c}</div>
        ))}
      </div>
      <div style={{ font: `400 32px/1 ${FONT}`, color: C.dim, padding: '26px 0 8px' }}>48 players, by number</div>
      <div style={{ font: `700 30px/1 ${FONT}`, letterSpacing: '0.14em', color: C.head, padding: '22px 0 6px' }}>SINGLE DIGITS</div>
      {ROSTER.map((r, i) => (
        <div key={r.n} style={{
          display: 'flex', alignItems: 'center', gap: 30, padding: '24px 0', borderTop: `2px solid ${C.line}`,
          opacity: MOTION.enter(t0 + 0.2 + i * 0.07, 0.5)(T),
          transform: `translateY(${(1 - MOTION.enter(t0 + 0.2 + i * 0.07, 0.5)(T)) * 26}px)`,
        }}>
          <div style={{ width: 70, textAlign: 'center', font: `700 62px/1 ${FONT}`, color: accent }}>{r.n}</div>
          <div style={{ flex: 1 }}>
            <div style={{ font: `700 48px/1.15 ${FONT}`, color: '#fff' }}>{r.name}</div>
            <div style={{ font: `400 34px/1.4 ${FONT}`, color: C.dim }}>{r.ht} · {r.wt} · {r.yr}</div>
          </div>
          <div style={{ font: `700 34px/1 ${FONT}`, color: '#e8ded6', letterSpacing: '0.04em' }}>{r.pos}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- schedule ---------- */

function SchedulePane({ T, t0, accent }) {
  const e = MOTION.pop(t0, 0.55)(T);
  return (
    <div style={{ padding: '34px 40px 0' }}>
      <div style={{
        background: C.card, border: `2px solid ${C.cardEdge}`, borderRadius: 30, padding: '38px 40px 34px',
        opacity: clamp(e * 1.4, 0, 1), transform: `translateY(${(1 - e) * 40}px)`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ font: `700 30px/1 ${FONT}`, letterSpacing: '0.14em', color: '#ffb27d' }}>NEXT UP</div>
          <div style={{ font: `400 34px/1 ${FONT}`, color: '#f3ece6', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 700, color: '#fff' }}>6</span> days until game day
          </div>
        </div>
        <div style={{ font: `700 78px/1.1 ${FONT}`, color: '#fff', marginTop: 22, letterSpacing: '-0.02em' }}>
          <span style={{ color: '#ffb27d' }}>vs </span>Brookfield
        </div>
        <div style={{ font: `400 38px/1.4 ${FONT}`, color: '#f3ece6', marginTop: 14 }}>
          <span style={{ fontWeight: 700, color: '#ffb27d', fontSize: 42 }}>1–0</span> this season
        </div>
        <div style={{ font: `400 36px/1.45 ${FONT}`, color: '#e0d5cc', marginTop: 12 }}>
          Friday, August 28 · 7:00 PM · Home opener
        </div>
      </div>
      <div style={{ font: `400 32px/1 ${FONT}`, color: C.dim, padding: '30px 0 6px', opacity: MOTION.enter(t0 + 0.4, 0.4)(T) }}>
        10 games · 5 at home
      </div>
      <div style={{ font: `700 30px/1 ${FONT}`, letterSpacing: '0.14em', color: C.head, padding: '18px 0 4px' }}>COMING UP</div>
      {GAMES.map((g, i) => (
        <div key={g.d + g.opp} style={{
          display: 'flex', alignItems: 'center', gap: 30, padding: '26px 0', borderTop: `2px solid ${C.line}`,
          opacity: MOTION.enter(t0 + 0.5 + i * 0.09, 0.5)(T),
          transform: `translateY(${(1 - MOTION.enter(t0 + 0.5 + i * 0.09, 0.5)(T)) * 24}px)`,
        }}>
          <div style={{ width: 110, textAlign: 'center' }}>
            <div style={{ font: `700 26px/1 ${FONT}`, letterSpacing: '0.1em', color: i === 0 ? accent : C.dim }}>{g.m}</div>
            <div style={{ font: `700 58px/1.15 ${FONT}`, color: i === 0 ? accent : '#e8ded6' }}>{g.d}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ font: `700 46px/1.15 ${FONT}`, color: '#fff' }}>
              <span style={{ fontWeight: 400, color: C.muted }}>{g.vs} </span>{g.opp}
            </div>
            <div style={{ font: `400 34px/1.4 ${FONT}`, color: C.dim }}>{g.note}</div>
          </div>
          <div style={{ font: `${i === 0 ? 700 : 400} 40px/1 ${FONT}`, color: i === 0 ? accent : '#e8ded6' }}>{g.t}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- league ---------- */

const SCORES = [
  ['Springfield', 28, 'Mineral Ridge', 14],
  ['McDonald', 21, 'Waterloo', 7],
  ['Jackson-Milton', 17, 'Lowellville', 13],
  ['Campbell Memorial', 35, 'Western Reserve', 20],
];
const CONF = [
  ['Springfield', '3–0', '3–0'], ['McDonald', '3–0', '2–1'], ['Jackson-Milton', '2–1', '2–1'], ['Campbell Memorial', '2–1', '1–2'],
  ['Mineral Ridge', '1–2', '1–2'], ['Lowellville', '1–2', '0–3'], ['Waterloo', '0–3', '1–2'], ['Western Reserve', '0–3', '0–3'],
];
const REGION = [
  ['1', 'Mogadore', '3–0', '9.40'], ['2', 'Springfield', '3–0', '8.85'], ['3', 'Wickliffe', '3–0', '8.10'],
  ['4', 'McDonald', '2–1', '6.95'], ['5', 'Cuyahoga Hts.', '2–1', '6.40'], ['6', 'Garfield', '2–1', '5.90'],
  ['7', 'Jackson-Milton', '2–1', '5.35'], ['8', 'Mineral Ridge', '1–2', '3.80'],
];

function LeaguePane({ T, t0, flipAt, accent, team }) {
  const flip = MOTION.glide(flipAt, 0.45)(T);
  const conf = 1 - flip, reg = flip;
  const me = (n) => n === 'Springfield';
  const rowIn = (i, base) => MOTION.enter(base + i * 0.06, 0.45)(T);
  return (
    <div style={{ padding: '30px 40px 0', position: 'relative', height: '100%' }}>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', padding: 8, background: 'rgba(42,35,32,0.55)', borderRadius: 20, opacity: MOTION.enter(t0, 0.4)(T) }}>
        <div style={{ position: 'absolute', top: 8, bottom: 8, left: 8, width: 'calc(50% - 8px)', borderRadius: 14, background: '#fff', transform: `translateX(${flip * 100}%)` }} />
        {['MVAC Scarlet', 'Region 21'].map((c, i) => (
          <div key={c} style={{ position: 'relative', height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center',
            font: `700 40px/1 ${FONT}`, color: (i === 0 ? conf : reg) > 0.5 ? '#0e0c0b' : '#e8ded6' }}>{c}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 40, right: 40, top: 160, opacity: conf, transform: `translateX(${-flip * 80}px)` }}>
        <div style={{ font: `700 30px/1 ${FONT}`, letterSpacing: '0.14em', color: C.head, padding: '10px 0 16px' }}>WEEK 3 FINALS</div>
        {SCORES.map((g, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 1fr 70px', alignItems: 'center', gap: 12, padding: '20px 0', borderTop: `2px solid ${C.line}`,
            opacity: rowIn(i, t0 + 0.15), font: `400 36px/1.2 ${FONT}`, color: '#e8ded6' }}>
            <div style={{ fontWeight: 700, color: me(g[0]) ? accent : '#fff' }}>{g[0]}</div>
            <div style={{ fontWeight: 700, color: '#fff', textAlign: 'right' }}>{g[1]}</div>
            <div style={{ paddingLeft: 26, color: C.muted }}>{g[2]}</div>
            <div style={{ color: C.muted, textAlign: 'right' }}>{g[3]}</div>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px', font: `700 28px/1 ${FONT}`, letterSpacing: '0.12em', color: C.head, padding: '46px 0 16px' }}>
          <div>STANDINGS</div><div style={{ textAlign: 'right' }}>CONF</div><div style={{ textAlign: 'right' }}>ALL</div>
        </div>
        {CONF.map((r, i) => (
          <div key={r[0]} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px', padding: '19px 16px', margin: '0 -16px', borderTop: `2px solid ${C.line}`,
            background: me(r[0]) ? 'rgba(242,103,34,0.16)' : 'transparent', opacity: rowIn(i, t0 + 0.4),
            font: `${me(r[0]) ? 700 : 400} 36px/1.2 ${FONT}`, color: me(r[0]) ? '#fff' : '#e8ded6' }}>
            <div>{r[0]}</div><div style={{ textAlign: 'right' }}>{r[1]}</div><div style={{ textAlign: 'right', color: C.dim }}>{r[2]}</div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 40, right: 40, top: 160, opacity: reg, transform: `translateX(${(1 - flip) * 80}px)` }}>
        <div style={{ font: `400 34px/1.45 ${FONT}`, color: C.muted, padding: '10px 0 26px' }}>Division VI, Region 21 — top 16 after week 10 make the playoffs</div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 130px 130px', font: `700 28px/1 ${FONT}`, letterSpacing: '0.12em', color: C.head, paddingBottom: 16 }}>
          <div>#</div><div>SCHOOL</div><div style={{ textAlign: 'right' }}>W–L</div><div style={{ textAlign: 'right' }}>AVG</div>
        </div>
        {REGION.map((r, i) => (
          <div key={r[1]} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 130px 130px', padding: '21px 16px', margin: '0 -16px', borderTop: `2px solid ${C.line}`,
            background: me(r[1]) ? 'rgba(242,103,34,0.16)' : 'transparent', opacity: MOTION.enter(flipAt + 0.1 + i * 0.05, 0.4)(T),
            font: `${me(r[1]) ? 700 : 400} 38px/1.2 ${FONT}`, color: me(r[1]) ? '#fff' : '#e8ded6' }}>
            <div style={{ color: me(r[1]) ? accent : C.dim }}>{r[0]}</div><div>{r[1]}</div>
            <div style={{ textAlign: 'right' }}>{r[2]}</div><div style={{ textAlign: 'right', color: C.dim }}>{r[3]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- kinetic type ---------- */

function Callouts({ T, items, accent, bottom }) {
  const it = items.find((c) => T >= c.at - 0.05 && T < c.until + 0.3);
  if (!it) return null;
  const out = clamp(1 - (T - it.until) / 0.3, 0, 1);
  const slab = MOTION.pop(it.at, 0.4)(T);
  const words = it.text.split(' ');
  return (
    <div style={{ position: 'absolute', left: 50, right: 50, bottom, display: 'flex', justifyContent: 'center', opacity: out, zIndex: 10 }}>
      <div style={{
        background: accent, padding: '26px 40px 30px', borderRadius: 10,
        transform: `rotate(-2.5deg) scaleX(${0.3 + slab * 0.7})`, opacity: clamp(slab * 2, 0, 1),
        boxShadow: '0 24px 60px rgba(0,0,0,0.55), 12px 12px 0 #000',
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 22, rowGap: 4, maxWidth: 940,
      }}>
        {words.map((w, i) => {
          const e = MOTION.pop(it.at + 0.12 + i * 0.06, 0.38)(T);
          return (
            <span key={i} style={{
              font: `400 82px/1.04 Anton, ${FONT}`, textTransform: 'uppercase', color: '#fff',
              display: 'inline-block', opacity: clamp(e * 1.5, 0, 1),
              transform: `translateY(${(1 - e) * 60}px) scale(${0.7 + e * 0.3})`,
            }}>{w}</span>
          );
        })}
      </div>
    </div>
  );
}

function MusicSync({ on }) {
  const { T } = useComposition();
  const ref = React.useRef(null);
  const last = React.useRef(-1);
  const timer = React.useRef(0);
  React.useEffect(() => {
    const a = ref.current; if (!a) return;
    if (!on) { a.pause(); return; }
    if (T !== last.current) {
      if (Math.abs(a.currentTime - T) > 0.25) a.currentTime = T;
      if (a.paused) a.play().catch(() => {});
      clearTimeout(timer.current);
      timer.current = setTimeout(() => a.pause(), 180);
    }
    last.current = T;
  });
  return <audio ref={ref} src="tigers-theme.wav" preload="auto" />;
}

function TypeLine({ children, t0, T, size, color, weight, ls, delay }) {
  const e = MOTION.enter(t0 + (delay || 0), 0.55)(T);
  return (
    <div style={{
      font: `${weight || 800} ${size}px/1.02 ${FONT}`, color: color || '#fff',
      letterSpacing: ls || '-0.035em', opacity: clamp(e * 1.35, 0, 1),
      transform: `translateY(${(1 - e) * 46}px)`,
    }}>{children}</div>
  );
}

/* ---------- the piece ---------- */

function Piece(props) {
  const { T, CUES } = useComposition();
  const accent = props.accent || '#f26722';
  const team = props.team || 'Northfield Ravens';

  const k1 = CUES.Lookup + 2.1, k2 = CUES.Lookup + 2.9;
  const presses = [{ d: '2', at: k1 }, { d: '4', at: k2 }];

  /* camera: one transform for the whole app screen */
  const appIn = MOTION.enter(CUES.Hub - 0.35, 0.75)(T);
  const chromeIn = MOTION.enter(CUES.Lookup - 0.3, 0.45)(T);
  const zoomPlayer = MOTION.glide(CUES.Player + 0.1, 1.6)(T);
  const zoomOutTeam = MOTION.glide(CUES.Team - 0.3, 0.8)(T);
  const drift = MOTION.glide(CUES.Team, 3)(T);
  const pullBack = MOTION.glide(CUES.Value - 0.45, 1.0)(T);
  const appOut = clamp(MOTION.enter(CUES.Value - 0.3, 0.7)(T), 0, 1);

  const gone = clamp(MOTION.enter(CUES.Close - 0.45, 0.6)(T), 0, 1);
  const scale = 1 + zoomPlayer * 0.075 - zoomOutTeam * 0.075 - pullBack * 0.2;
  const ty = -zoomPlayer * 46 + zoomOutTeam * 46 - drift * 70 + pullBack * 24;
  const appOpacity = clamp(appIn, 0, 1) * (1 - appOut * 0.93) * (1 - gone);

  const tabX = MOTION.glide(CUES.Team - 0.42, 0.3)(T) + MOTION.glide(CUES.Schedule - 0.42, 0.3)(T) + MOTION.glide(CUES.League - 0.42, 0.3)(T);

  const hookZoom = MOTION.glide(0, 4)(T);
  const closeE = MOTION.pop(CUES.Close + 0.15, 0.6)(T);
  const closeRule = MOTION.glide(CUES.Close + 0.5, 0.7)(T);


  return (
    <div style={{
      position: 'absolute', inset: 0, background: C.bg, overflow: 'hidden', fontFamily: FONT,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(120% 70% at 50% 26%, #2a160c 0%, ${C.bg} 55%, ${C.bgDeep} 100%)`,
      }} />
      <Watermark />

      {/* ---- app screen (persists across Lookup → Value) ---- */}
      <div style={{
        position: 'absolute', inset: 0, opacity: appOpacity,
        transform: `translateY(${ty}px) scale(${scale})`, transformOrigin: '50% 34%',
      }}>
        <div style={{ opacity: chromeIn }}><Chrome T={T} tabX={tabX} accent={accent} team={team} /></div>
        <Shot from={CUES.Hub - 0.4} to={CUES.Lookup - 0.3}>
          <HubPane T={T} t0={CUES.Hub - 0.35} accent={accent} team={team} tapAt={CUES.Hub + 2.35} />
        </Shot>
        <Shot from={CUES.Lookup - 0.3} to={CUES.Team - 0.35}>
          <div style={PANE}><LookupPane T={T} cues={{ k1, k2 }} accent={accent} team={team} presses={presses} /></div>
        </Shot>
        <Shot from={CUES.Team - 0.35} to={CUES.Schedule - 0.35}>
          <div style={{ ...PANE, opacity: fadeIn(T, CUES.Team - 0.35) }}><TeamPane T={T} t0={CUES.Team - 0.35} accent={accent} /></div>
        </Shot>
        <Shot from={CUES.League - 0.35} to={CUES.Close}>
          <div style={{ ...PANE, opacity: fadeIn(T, CUES.League - 0.35) }}><LeaguePane T={T} t0={CUES.League - 0.35} flipAt={CUES.League + 1.7} accent={accent} team={team} /></div>
        </Shot>
        <Shot from={CUES.Schedule - 0.35} to={CUES.League - 0.35}>
          <div style={{ ...PANE, opacity: fadeIn(T, CUES.Schedule - 0.35) }}><SchedulePane T={T} t0={CUES.Schedule - 0.35} accent={accent} /></div>
        </Shot>
      </div>

      {/* ---- Hook ---- */}
      <Shot from={0} to={CUES.Problem}>
        <div style={{
          position: 'absolute', left: 70, right: 70, top: 640,
          transform: `scale(${1 + hookZoom * 0.09})`, transformOrigin: '0% 50%',
        }}>
          <TypeLine t0={0.25} T={T} size={76} color={C.muted} weight={700}>Friday night.</TypeLine>
          <div style={{ height: 30 }} />
          <TypeLine t0={1.15} T={T} size={104}>#24 breaks free.</TypeLine>
          <div style={{ height: 56 }} />
          <TypeLine t0={2.4} T={T} size={104} color={accent}>Who is that?</TypeLine>
        </div>
      </Shot>

      {/* ---- Problem ---- */}
      <Shot from={CUES.Problem} to={CUES.Hub - 0.2}>
        <div style={{ position: 'absolute', left: 80, right: 80, top: 700 }}>
          <TypeLine t0={CUES.Problem + 0.15} T={T} size={94} color={C.muted} weight={700}>The roster is a PDF</TypeLine>
          <TypeLine t0={CUES.Problem + 0.4} T={T} size={94} color={C.muted} weight={700}>in somebody's email.</TypeLine>
          <div style={{ height: 60 }} />
          <TypeLine t0={CUES.Problem + 1.5} T={T} size={112} color="#fff">The announcer</TypeLine>
          <TypeLine t0={CUES.Problem + 1.7} T={T} size={112} color="#fff">doesn't have it.</TypeLine>
        </div>
      </Shot>

      {/* ---- Value ---- */}
      <Shot from={CUES.Value - 0.2} to={CUES.Close}>
        <div style={{ position: 'absolute', left: 80, right: 80, top: 560 }}>
          <TypeLine t0={CUES.Value + 0.1} T={T} size={108}>Every roster.</TypeLine>
          <TypeLine t0={CUES.Value + 0.45} T={T} size={108}>Every schedule.</TypeLine>
          <TypeLine t0={CUES.Value + 0.8} T={T} size={108} color={accent}>Every score.</TypeLine>
          <div style={{ height: 96 }} />
          <TypeLine t0={CUES.Value + 1.9} T={T} size={72} color={C.muted} weight={600}>No app store. No login.</TypeLine>
          <TypeLine t0={CUES.Value + 2.15} T={T} size={72} color={C.muted} weight={600}>Just a link.</TypeLine>
        </div>
      </Shot>

      {/* ---- Close ---- */}
      <Shot from={CUES.Close - 0.1} to={CUES.Close + 10}>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ opacity: clamp(closeE * 1.3, 0, 1), transform: `scale(${0.82 + closeE * 0.18}) rotate(${(1 - closeE) * -6}deg)` }}>
            <Logo width={640} />
          </div>
          <div style={{
            font: `400 132px/1 Anton, ${FONT}`, textTransform: 'uppercase', color: '#fff', marginTop: 50,
            opacity: MOTION.enter(CUES.Close + 0.45, 0.5)(T), transform: `translateY(${(1 - MOTION.enter(CUES.Close + 0.45, 0.5)(T)) * 40}px)`,
          }}>{team}</div>
          <div style={{ height: 10, width: 560 * closeRule, background: accent, borderRadius: 5, marginTop: 36 }} />
          <div style={{
            font: `600 52px/1.2 ${FONT}`, color: '#f3ece6', marginTop: 48, textAlign: 'center',
            opacity: MOTION.enter(CUES.Close + 0.9, 0.6)(T),
          }}>Every Tigers team. One link.</div>
          <div style={{
            font: `600 34px/1 ${FONT}`, color: C.dim, marginTop: 30, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'center',
            opacity: MOTION.enter(CUES.Close + 1.3, 0.6)(T),
          }}>Powered by Roster</div>
        </div>
      </Shot>

      {/* ---- captions over the walkthrough ---- */}
      {props.captions !== false && (
        <Callouts T={T} accent={accent}
          bottom={(T >= CUES.Lookup - 0.3 && T < CUES.Team - 0.25) ? 760 : (T < CUES.Lookup - 0.3 ? 46 : 110)}
          items={[
            { at: CUES.Hub + 0.5, until: CUES.Hub + 3.1, text: 'Every sport. One link.' },
            { at: CUES.Lookup + 0.35, until: CUES.Lookup + 1.7, text: 'No sign-in. No install.' },
            { at: CUES.Player + 0.35, until: CUES.Player + 3.9, text: 'Type the number, get the player.' },
            { at: CUES.Team + 0.4, until: CUES.Team + 2.6, text: 'The whole roster, searchable.' },
            { at: CUES.Schedule + 0.4, until: CUES.Schedule + 3.0, text: 'The whole season, game by game.' },
            { at: CUES.League + 0.35, until: CUES.League + 3.2, text: 'Conference and region, all season.' },
]} />
      )}
    </div>
  );
}

function TigersVideo() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  const [sound, setSound] = React.useState(false);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <CompositionStage
        width={W} height={H} bg={C.bg}
        scenes={window.OM_SCENES} playback={window.OM_PLAYBACK}
      >
        <Piece accent={t.accent} team={t.team} captions={t.captions} />
        <MusicSync on={sound && t.music !== false} />
      </CompositionStage>
      <button onClick={() => setSound((v) => !v)} style={{
        position: 'absolute', top: 16, left: 16, zIndex: 50, padding: '10px 16px', borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.25)', background: sound ? '#f26722' : 'rgba(0,0,0,0.6)',
        color: '#fff', font: `600 14px/1 ${FONT}`, cursor: 'pointer',
      }}>{sound ? '♪ Sound on' : '♪ Tap for sound'}</button>
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent}
          options={['#f26722', '#ff8a3d', '#e2501a']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakText label="Team" value={t.team} onChange={(v) => setTweak('team', v)} />
        <TweakSection label="Video" />
        <TweakToggle label="Callouts" value={t.captions} onChange={(v) => setTweak('captions', v)} />
        <TweakToggle label="Music" value={t.music} onChange={(v) => setTweak('music', v)} />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </div>
  );
}

window.TigersVideo = TigersVideo;
