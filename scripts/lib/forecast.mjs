/**
 * The forecast at one place and one moment.
 *
 * Poland's build has fetched the weather for kickoff since the Schedule screen
 * existed, and the paid /oh/ pages now want the same line on their own next
 * fixture. Two callers, one piece of judgement: the forecast is hourly, a
 * kickoff is not on the hour, and how far off is too far to still be an answer
 * is a decision that should be made once rather than drift apart in two files.
 *
 * Both callers run in a workflow, never on a phone, and that is the whole
 * point. It costs one request every few hours instead of one per spectator,
 * the answer rides into the deploy, and nobody has to announce themselves to a
 * weather service to find out whether to bring a coat. /oh/ carries a privacy
 * page saying reading the site involves nothing that follows you; a browser
 * call to Open-Meteo would quietly make that untrue.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/*
 * Two hours. Beyond that the nearest hour the forecast has is not the hour
 * anybody is standing in — which in practice means the game is past the end of
 * the sixteen-day range, and a number invented for it would be a guess wearing
 * a fact's clothes. Saying nothing is the honest answer, and the next rebuild
 * will reach the game in time.
 */
const TOO_FAR_SECONDS = 3600 * 2;

/**
 * The hour nearest `at`, or undefined if the forecast does not reach it.
 *
 * Throws on a network or HTTP failure so each caller can say whose forecast
 * went missing in its own voice — a build log and a refresh log are read by
 * people looking for different things.
 */
export async function forecastAt({ lat, lon, at }) {
  const wanted = Math.floor(at.getTime() / 1000);
  const url =
    `${ENDPOINT}?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code,is_day` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timeformat=unixtime&forecast_days=16`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { hourly } = await res.json();

  // The forecast is hourly and kickoff is not on the hour, so take the
  // closest one — and give up rather than guess if the game is beyond range.
  let best = -1;
  let gap = Infinity;
  hourly.time.forEach((t, i) => {
    const d = Math.abs(t - wanted);
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  if (best < 0 || gap > TOO_FAR_SECONDS) return undefined;

  return {
    code: hourly.weather_code[best],
    tempF: Math.round(hourly.temperature_2m[best]),
    precipChance: Math.round(hourly.precipitation_probability[best] ?? 0),
    windMph: Math.round(hourly.wind_speed_10m[best]),
    day: hourly.is_day[best] === 1,
    at: new Date(hourly.time[best] * 1000).toISOString(),
  };
}
