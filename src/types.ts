/** Which side of the ball a jersey number belongs to. '' when unknown or both ways. */
export type Side = 'O' | 'D' | 'ST' | '';

export type Player = {
  id: string;
  /** Kept as a string so "07" survives and two players can share a number (offense/defense). */
  number: string;
  firstName: string;
  lastName: string;
  /** "WR", or "WR/CB" for a player who goes both ways. */
  position: string;
  side: Side;
  /** Stored as inches; displayed as 6'1". */
  heightIn?: number;
  weightLb?: number;
  /** Whatever the roster used: "Jr", "11", "Soph". Kept verbatim. */
  grade?: string;

  /*
   * Only a baked roster carries these. A roster typed in by a coach has a
   * number and a name and that is the job; a published one can afford a face
   * and a paragraph, so the card shows them when they are there and looks
   * exactly as it always did when they are not.
   */
  /** Linked, not copied — the picture belongs to whoever took it. */
  photo?: string;
  hometown?: string;
  bio?: string;
  /** Season numbers, already formatted: the label is the short one. */
  lines?: Array<{ label: string; value: string }>;
};

export type Roster = {
  teamName: string;
  season: string;
  players: Player[];
  updatedAt: string;
};

export const emptyRoster = (): Roster => ({
  teamName: '',
  season: '',
  players: [],
  updatedAt: new Date().toISOString(),
});

export const fullName = (p: Player): string =>
  [p.firstName, p.lastName].filter(Boolean).join(' ').trim();

/** 73 -> `6'1"`. Returns '' when unknown. */
export const formatHeight = (inches?: number): string => {
  if (inches == null || !Number.isFinite(inches) || inches <= 0) return '';
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches % 12);
  // 5'12" would be nonsense; carry it.
  return inch === 12 ? `${ft + 1}'0"` : `${ft}'${inch}"`;
};

export const formatWeight = (lb?: number): string =>
  lb == null || !Number.isFinite(lb) || lb <= 0 ? '' : `${Math.round(lb)} lb`;

export const SIDE_LABEL: Record<Exclude<Side, ''>, string> = {
  O: 'Offense',
  D: 'Defense',
  ST: 'Special teams',
};
