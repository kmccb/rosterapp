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
