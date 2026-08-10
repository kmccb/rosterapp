/**
 * The forecast for kickoff.
 *
 * Fetched when the site is built rather than from each phone: the schedule
 * rebuilds every few hours anyway, so the forecast rides along, it is then in
 * the precache and survives a ground with no signal, and nobody's phone has to
 * announce itself to a weather service to find out whether to bring a coat.
 */

export type Weather = {
  /** WMO code, as the forecast reports it. */
  code: number;
  tempF: number;
  /** Chance of precipitation, percent. */
  precipChance: number;
  windMph: number;
  day: boolean;
  /** The hour this describes, so a stale one can be spotted. */
  at: string;
};

export type Sky =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder';

/**
 * WMO code to something a person reads at a glance.
 *
 * Grouped hard on purpose. The forecast separates light from moderate from
 * dense drizzle, and standing in it you cannot tell — what matters is whether
 * to bring a coat, so the groups are the ones you'd act differently on.
 */
export const skyOf = (code: number): Sky => {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  // Bounded at the top of the table: an open-ended check turned any nonsense
  // value into a thunderstorm, which is the loudest possible way to be wrong.
  if (code >= 95 && code <= 99) return 'thunder';
  // Nothing else is defined, and a wrong picture is worse than a plain cloud.
  return 'cloudy';
};

const WORDS: Record<Sky, string> = {
  clear: 'Clear',
  partly: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  thunder: 'Thunderstorms',
};

export const describeSky = (code: number): string => WORDS[skyOf(code)];

/**
 * Whether the chance of rain is worth printing.
 *
 * Below about a third it says nothing useful — it rains on some of those
 * nights and not others, and a number that low next to a football schedule
 * reads as a warning it isn't.
 */
export const worthMentioning = (precipChance: number): boolean => precipChance >= 30;
