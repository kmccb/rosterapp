/*
 * Out of football season the bare address sells the product: a person who
 * types roster.scottforge.ai lands on the marketing page. Everything else that
 * asks for / must still get Poland's page, and the line between them is the
 * whole of this file.
 *
 * Why not a line in public/_redirects: Poland's service worker precaches
 * index.html by fetching /index.html?__WB_REVISION__=…, which Pages answers
 * with a 308 to /?__WB_REVISION__=…. A _redirects rule matches the path alone,
 * so that fetch would follow on to the marketing site — which allows any
 * origin — and the worker would install the marketing page as Poland's, on
 * every phone that has Poland on its home screen. So only a top-level
 * navigation with no query string is sent away:
 *
 *   - the worker's own fetches are not navigations (Sec-Fetch-Mode is cors);
 *   - a coach's share link is /?c=XXXX-XXXX, which has a query;
 *   - a browser too old to send Sec-Fetch-Mode gets Poland. When unsure,
 *     Poland — never the other way round.
 *
 * Old /#CODE share links carry nothing the server can see, so a phone without
 * Poland installed follows one to the marketing page. That is the one loss.
 */
export const MARKETING = 'https://getroster.scottforge.ai/';

export const sellsInstead = (url: URL, headers: Headers): boolean =>
  url.pathname === '/' &&
  url.search === '' &&
  headers.get('sec-fetch-mode') === 'navigate' &&
  headers.get('sec-fetch-dest') === 'document';
