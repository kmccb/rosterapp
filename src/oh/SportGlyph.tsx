import type { ReactNode } from 'react';

/*
 * A mark for every sport, drawn here rather than fetched.
 *
 * The hub lays one of these across each row at 172px and 9% white — a
 * watermark behind the sport's name, not an icon beside it. The obvious way to
 * get sixteen sport symbols is an icon font from a CDN, and this page cannot
 * have one: /oh/?privacy tells the reader that nothing here follows them
 * between sites, which is the same promise scripts/build-teams.mjs keeps by
 * fetching the kickoff forecast on the server rather than from the phone. A
 * font request to Google would quietly break it, and cost a round trip on a
 * ground's signal for the privilege.
 *
 * So these are hand-drawn paths on a 24-unit grid, inline in the bundle, in
 * currentColor — which is what lets the watermark be the school's own text
 * colour at exactly the opacity oh.css asks for, rather than a baked grey.
 *
 * They are deliberately plain. At 9% opacity a detailed silhouette turns to
 * mud; an outline with two or three interior strokes still reads as a ball,
 * and the same shapes stay legible if one is ever asked to sit at 20px.
 */

/** A sport's own mark, or the one every unknown sport falls back to. */
const GLYPHS: Record<string, ReactNode> = {
  football: (
    <>
      <ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-30 12 12)" />
      <path d="M8.4 14.1 L15.6 9.9" />
      <path d="M9.15 12.17 L10.45 14.43" />
      <path d="M11.35 10.87 L12.65 13.13" />
      <path d="M13.55 9.57 L14.85 11.83" />
    </>
  ),

  volleyball: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M4.2 6.5 Q10 12 8.6 20.6" />
      <path d="M19.8 6.5 Q14 12 15.4 20.6" />
      <path d="M3.3 8.6 Q12 12.5 20.7 8.6" />
    </>
  ),

  soccer: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 8 L15.8 10.76 L14.35 15.24 L9.65 15.24 L8.2 10.76 Z" />
      <path d="M12 8 L12 3.2" />
      <path d="M15.8 10.76 L20.17 9.34" />
      <path d="M14.35 15.24 L17.05 18.96" />
      <path d="M9.65 15.24 L6.95 18.96" />
      <path d="M8.2 10.76 L3.83 9.34" />
    </>
  ),

  'cross country': (
    <>
      <circle cx="16.4" cy="5" r="2.2" fill="currentColor" stroke="none" />
      <path d="M15 8.4 L11 13" />
      <path d="M11 13 L14.4 16 L13.4 20.8" />
      <path d="M11 13 L6.8 14.6 L5.6 19.2" />
      <path d="M13.6 10 L18.4 12" />
      <path d="M13.6 10 L9.6 7.4" />
    </>
  ),

  golf: (
    <>
      <path d="M8 3.6 L8 20.4" />
      <path d="M8 4.2 L17.4 7.6 L8 11 Z" />
      <ellipse cx="8" cy="20.4" rx="4.6" ry="1.7" />
    </>
  ),

  tennis: (
    <>
      <ellipse cx="12" cy="8.5" rx="6.5" ry="7.5" />
      <path d="M12 16 L12 21.4" />
      <path d="M9.6 3.6 L9.6 13.4" />
      <path d="M14.4 3.6 L14.4 13.4" />
      <path d="M6.2 6.5 L17.8 6.5" />
      <path d="M6.2 10.5 L17.8 10.5" />
    </>
  ),

  cheer: (
    <>
      <path d="M4 10 L14.6 5.4 L14.6 18.6 L4 14 Z" />
      <path d="M7.4 15.5 L6.6 20.6" />
      <path d="M17.6 9 Q19.8 12 17.6 15" />
      <path d="M20 6.8 Q22.8 12 20 17.2" />
    </>
  ),

  basketball: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 2.5 L12 21.5" />
      <path d="M2.5 12 L21.5 12" />
      <path d="M5.3 5.3 Q12 12 5.3 18.7" />
      <path d="M18.7 5.3 Q12 12 18.7 18.7" />
    </>
  ),

  // Two wrestlers in a tie-up: heads together, arms crossed at the collar,
  // legs braced back. This was ear guards first, and rasterized at 200px they
  // were a pair of headphones — the one drawing here that had to be looked at
  // rather than measured. The locked pair was the thing to fear as a smudge
  // and isn't: at nine per cent the two bodies still separate, because there
  // are only eight strokes in it and none of them cross at a shallow angle.
  wrestling: (
    <>
      <circle cx="8.4" cy="6.5" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="6.5" r="2.2" fill="currentColor" stroke="none" />
      <path d="M9.9 8.3 Q6.6 10.6 4.8 14.2" />
      <path d="M14.1 8.3 Q17.4 10.6 19.2 14.2" />
      <path d="M4.8 14.2 L3.4 20.4" />
      <path d="M4.8 14.2 L7.8 20.4" />
      <path d="M19.2 14.2 L20.6 20.4" />
      <path d="M19.2 14.2 L16.2 20.4" />
      <path d="M9.8 9.6 L15.2 11.6" />
      <path d="M14.2 9.6 L8.8 11.6" />
    </>
  ),

  swimming: (
    <>
      <circle cx="8.2" cy="9" r="2.2" fill="currentColor" stroke="none" />
      <path d="M10.2 10.4 L19.6 13.4" />
      <path d="M9.4 6.9 L13.4 3.8" />
      <path d="M2.4 18.6 Q5.4 16.6 8.4 18.6 T14.4 18.6 T20.4 18.6" />
    </>
  ),

  hockey: (
    <>
      <path d="M18.6 3.6 L9.4 16.8 L3.6 17.4" />
      <ellipse cx="6.4" cy="20.6" rx="2.9" ry="1.3" />
    </>
  ),

  bowling: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="9.4" cy="8.6" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="13.4" cy="7.8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="11.8" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),

  baseball: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M5.6 5 Q9.2 12 5.6 19" />
      <path d="M18.4 5 Q14.8 12 18.4 19" />
      <path d="M5.79 8.8 L8.11 8.2" />
      <path d="M5.79 15.2 L8.11 15.8" />
      <path d="M18.21 8.8 L15.89 8.2" />
      <path d="M18.21 15.2 L15.89 15.8" />
    </>
  ),

  softball: (
    <>
      <circle cx="6.8" cy="17.2" r="4.4" />
      <path d="M3.8 14.2 Q7.6 15.6 9.8 20.1" />
      <path d="M20.6 3.4 L13 11" strokeWidth="3.4" />
      <path d="M13 11 L10.2 13.8" />
    </>
  ),

  track: (
    <>
      <ellipse cx="12" cy="12" rx="10" ry="6.4" />
      <ellipse cx="12" cy="12" rx="6" ry="3" />
      <path d="M12 5.6 L12 9" />
    </>
  ),

  lacrosse: (
    <>
      <ellipse cx="15.6" cy="6.6" rx="4" ry="5" transform="rotate(35 15.6 6.6)" />
      <circle cx="15.6" cy="6.6" r="1.5" fill="currentColor" stroke="none" />
      <path d="M6 20.6 L13.2 10.2" />
    </>
  ),

  // Whatever a school sells that this file has never heard of. A trophy says
  // "a sport" without claiming to be one, which is the only honest thing to
  // draw for a name nobody has drawn yet.
  generic: (
    <>
      <path d="M7.6 3.6 H16.4 V9 A4.4 4.4 0 0 1 7.6 9 Z" />
      <path d="M12 13.4 V17" />
      <path d="M9.6 17 H14.4 L16 20.6 H8 Z" />
    </>
  ),
};

/**
 * Which mark a sport gets, by name. Split out from the component because the
 * suite runs in node with no DOM: the thing worth pinning is that every sport
 * the season table knows resolves to a drawing, and that resolution must not
 * depend on anything being rendered to check.
 */
export const glyphFor = (sport: string): string => {
  const key = sport.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(GLYPHS, key) ? key : 'generic';
};

/**
 * The mark itself. Sized by font-size — width and height are 1em — so the
 * stylesheet keeps saying how big it is, exactly as it would for the emoji
 * this replaces. Hidden from assistive tech: the sport's name is right there
 * in text beside it, and a screen reader announcing "football, football" is
 * worse than one that says it once.
 */
export function SportGlyph({ sport, className }: { sport: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[glyphFor(sport)]}
    </svg>
  );
}
