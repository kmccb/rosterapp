/*
 * Old scoreboards, rewritten into the shape today's parser reads.
 *
 * joeeitel's pages from 2011 to 2023 carry the same lines as today's — date,
 * kickoff, "School (Town) [XX]", score, "at" or "vs", school, score, overtime —
 * but in older markup: <PRE> and <BR/> in capitals or self-closing, scores in
 * <font color="blue">, overtime and unplayed games in <font color="red">, and
 * "cancelled" where today's pages say "cancel". Fed to parseScoreboard as they
 * are, they parse to nothing at all, and quietly: no game and no unreadable
 * line, because the <pre> the parser looks for is never found.
 *
 * stateParse.ts serves the live directory and stays exactly as it is, so the
 * old pages are brought to it rather than it to them. Everything here is a
 * markup rewrite; no game's words or numbers are touched, and a page already in
 * today's shape comes back unchanged.
 */

const COLOUR: Record<string, string> = { blue: 'text-primary', red: 'text-danger' };

export function modernScoreboard(html: string): string {
  return (
    html
      // The parser finds a lower-case, attribute-free <pre> and splits on a bare <br>.
      .replace(/<pre\b[^>]*>/gi, '<pre>')
      .replace(/<\/pre\s*>/gi, '</pre>')
      .replace(/<br\s*\/?>/gi, '<br>')
      // Scores, overtime and unplayed markers: the colour said what the span class says now.
      .replace(
        /<font\s+color\s*=\s*"?(blue|red)"?\s*>([\s\S]*?)<\/font>/gi,
        (whole, colour: string, inner: string) => {
          const cls = COLOUR[colour.toLowerCase()];
          return cls ? `<span class="${cls}">${inner}</span>` : whole;
        },
      )
      // The parser recognises a called-off game by today's wording.
      .replace(/<b>\s*cancel(?:led)?\s*<\/b>/gi, '<b>cancel</b>')
  );
}
