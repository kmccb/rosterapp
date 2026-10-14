/*
 * What a crest sits on, on the page and on the home screen.
 *
 * Kept in a file of its own, with no imports, so the build script that cuts a
 * paying school's home-screen icon (scripts/paid-apps.mjs) can load it straight
 * from node the way it loads src/oh/backdrop.ts. src/oh/look.ts imports a
 * sibling without an extension, which the browser bundle resolves and node
 * does not, so the rule could not be shared from there — and a copy of it in
 * the script would be the icon and the page waiting to disagree.
 */

/**
 * A crest is stored with its backdrop lifted off, so on its own it floats on
 * the page's ground — which reads well for a tiger on orange and badly for a
 * navy crest on navy. The seller can put it back on a plate: the school's own
 * ground or accent, kept as a word so the plate follows the colors when they
 * change, or any hex at all (white is the usual one).
 */
export type CrestPlate = 'ground' | 'accent' | string;

type PlateColors = { ground: string; accent: string; plate?: CrestPlate };

/** The plate as a CSS color, or 'transparent' for none — or for a value that is
 * neither of the two words nor a hex, which is treated as no choice at all. */
export function plateColor(look: PlateColors): string {
  const { plate } = look;
  if (plate === 'ground') return look.ground;
  if (plate === 'accent') return look.accent;
  return plate && /^#[0-9a-f]{6}$/i.test(plate) ? plate : 'transparent';
}

/** The home-screen icon's tile: the plate the seller chose, so the installed app
 * looks like the crest on the page, or the ground when there is none — an icon
 * has to be filled with something, and the ground is what it always was. */
export function iconTile(look: PlateColors): string {
  const plate = plateColor(look);
  return plate === 'transparent' ? look.ground : plate;
}
