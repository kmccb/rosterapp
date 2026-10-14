/*
 * A conference somebody else has already written down.
 *
 * scripts/maxpreps.mjs, the first time it reads a team that has a MaxPreps
 * page, also reads that team's conference and leaves it at
 * /oh/leagues/<slug>-<sport>.json, its members already placed in the state
 * directory. This reads that file for the panel, so the conference form can be
 * filled with one press instead of seven searches.
 *
 * It is a suggestion and is treated as one. Nothing reads this file but the
 * panel; the fan page still draws the conference the seller saved, from the
 * database. So the worst a wrong file can do is offer a wrong list to a person
 * who is looking at it — and it is checked anyway, member by member, against
 * the directory the panel already has: a slug that is not a school, or is the
 * school itself, is dropped rather than put in a form.
 */

export type LeagueSuggestion = {
  name: string;
  /** Directory slugs, without the school itself. */
  members: string[];
  /** Schools the source lists that could not be placed, by its name for them. */
  unmatched: string[];
  /** Who keeps it: "MaxPreps". */
  source: string;
};

export const asLeagueSuggestion = (
  v: unknown,
  ownSlug: string,
  known: ReadonlySet<string>,
): LeagueSuggestion | null => {
  if (typeof v !== 'object' || v === null) return null;
  const file = v as Record<string, unknown>;
  if (typeof file.name !== 'string' || !file.name.trim() || !Array.isArray(file.members)) return null;

  const members = [
    ...new Set(
      file.members.filter((m): m is string => typeof m === 'string' && m !== ownSlug && known.has(m)),
    ),
  ];
  if (members.length === 0) return null;

  return {
    name: file.name.trim().slice(0, 80),
    members,
    unmatched: Array.isArray(file.unmatched)
      ? file.unmatched.filter((u): u is string => typeof u === 'string' && u.trim() !== '').map((u) => u.slice(0, 80))
      : [],
    source: typeof file.source === 'string' ? file.source.slice(0, 40) : '',
  };
};

/** Null when there is no file, which is the ordinary case — most schools have none. */
export async function loadLeagueSuggestion(
  slug: string,
  sport: string,
  known: ReadonlySet<string>,
): Promise<LeagueSuggestion | null> {
  try {
    const res = await fetch(`/oh/leagues/${slug}-${sport}.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    // A host can answer a missing file with a page of its own and a 200.
    return asLeagueSuggestion(await res.json().catch(() => null), slug, known);
  } catch {
    return null;
  }
}
