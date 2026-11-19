/*
 * What a player is allowed to look like by the time a screen draws one.
 *
 * Two doors, and they are deliberately not equally strict. A share is written by
 * whoever holds a code, so it is rebuilt from a short list of fields and anything
 * else is left behind. A roster already on a phone is somebody's real roster, so
 * it is only repaired: a wrong-shaped field goes, every good value stays exactly
 * as it was, and a player is never lost for the sake of one bad field.
 */

import { newId } from './parse/rosterParse';
import type { Player, Side } from './types';

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A jersey typed into a spreadsheet can arrive as 7 rather than "7"; both mean the same. */
const asText = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;

const asSide = (v: unknown): Side => (v === 'O' || v === 'D' || v === 'ST' ? v : '');

/** The same limit roster_create holds a publisher to. */
const MOST_PLAYERS = 300;

const capped = (v: unknown, max: number): string => (asText(v) ?? '').trim().slice(0, max);

/** The range the roster parser itself accepts, so nothing a coach could paste is refused. */
const inRange = (v: unknown, low: number, high: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high ? v : undefined;

/*
 * Photo, home town, bio and season lines are left behind on purpose. Only a baked
 * roster has them, and a photo in a share is a request to any address the sender
 * likes, made from the phone of whoever opens that player's card.
 */
const sharedPlayer = (raw: unknown): Player | null => {
  if (!isRecord(raw)) return null;

  const number = capped(raw.number, 8);
  const firstName = capped(raw.firstName, 60);
  const lastName = capped(raw.lastName, 60);
  if (!number && !firstName && !lastName) return null;

  const heightIn = inRange(raw.heightIn, 48, 90);
  const weightLb = inRange(raw.weightLb, 80, 450);
  const grade = capped(raw.grade, 20);

  return {
    // Ids came off another phone and only have to be unique here. Nothing crosses
    // a share by id: stats are filed under the player's name.
    id: newId(),
    number,
    firstName,
    lastName,
    position: capped(raw.position, 20),
    side: asSide(raw.side),
    ...(heightIn !== undefined ? { heightIn } : {}),
    ...(weightLb !== undefined ? { weightLb } : {}),
    ...(grade ? { grade } : {}),
  };
};

export const sharedPlayers = (raw: unknown): Player[] =>
  Array.isArray(raw)
    ? raw
        .slice(0, MOST_PLAYERS)
        .map(sharedPlayer)
        .filter((p): p is Player => p !== null)
    : [];

/** Every photo a baked roster has ever carried is an https address on ESPN's image host. */
const SAFE_PHOTO = /^https:\/\/[^\s"'<>\\]+$/i;

const asLines = (v: unknown): Player['lines'] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const lines: NonNullable<Player['lines']> = [];
  for (const line of v) {
    if (!isRecord(line)) continue;
    const label = asText(line.label);
    const value = asText(line.value);
    if (label !== undefined && value !== undefined) lines.push({ label, value });
  }
  return lines;
};

const storedPlayer = (raw: unknown): Player | null => {
  if (!isRecord(raw)) return null;

  const number = asText(raw.number) ?? '';
  const firstName = asText(raw.firstName) ?? '';
  const lastName = asText(raw.lastName) ?? '';
  if (!number.trim() && !firstName.trim() && !lastName.trim()) return null;

  const finite = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const heightIn = finite(raw.heightIn);
  const weightLb = finite(raw.weightLb);
  const grade = asText(raw.grade);
  const lines = asLines(raw.lines);

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    number,
    firstName,
    lastName,
    position: asText(raw.position) ?? '',
    side: asSide(raw.side),
    ...(heightIn !== undefined ? { heightIn } : {}),
    ...(weightLb !== undefined ? { weightLb } : {}),
    ...(grade !== undefined ? { grade } : {}),
    ...(typeof raw.photo === 'string' && SAFE_PHOTO.test(raw.photo) ? { photo: raw.photo } : {}),
    ...(typeof raw.hometown === 'string' ? { hometown: raw.hometown } : {}),
    ...(typeof raw.bio === 'string' ? { bio: raw.bio } : {}),
    ...(lines ? { lines } : {}),
  };
};

export const repairStoredPlayers = (raw: unknown[]): Player[] =>
  raw.map(storedPlayer).filter((p): p is Player => p !== null);
