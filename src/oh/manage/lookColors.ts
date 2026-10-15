/*
 * The Look card's colors as data: what a save sends, whether anything has
 * changed, and what the hint under the pickers says. Kept apart from
 * SchoolPage so the rules can be pinned by tests — the vitest environment has
 * no DOM to render the card in.
 */

import { lookNotes, type LightColors } from '../look';
import type { PanelColors } from './adminApi';

/** What a school with nothing stored starts from. */
export const DEFAULT_COLORS = { ground: '#04043a', accent: '#4fbaf7', text: '#ffffff' };

/** Everything the Look card holds, as the pickers have it now. `light` is null
 * while the box is unticked: the light page is then worked out from the dark. */
export type LookState = {
  ground: string;
  accent: string;
  text: string;
  /** Already squashed to single spaces and trimmed. */
  nickname: string;
  plate: string;
  light: LightColors | null;
};

/**
 * The colors object a save writes. `p_colors` replaces the whole stored
 * object, so leaving `light` out is how unticking the box takes the seller's
 * light page away — there is no separate "clear".
 */
export const panelColors = (s: LookState): PanelColors => ({
  ground: s.ground,
  accent: s.accent,
  text: s.text,
  ...(s.nickname ? { nickname: s.nickname } : {}),
  ...(s.plate ? { plate: s.plate } : {}),
  ...(s.light ? { light: { ground: s.light.ground, accent: s.light.accent, text: s.light.text } } : {}),
});

const sameLight = (a: LightColors | null | undefined, b: LightColors | null | undefined): boolean =>
  !a || !b ? !a && !b : a.ground === b.ground && a.accent === b.accent && a.text === b.text;

/** Whether the colors on screen differ from the ones stored — the crest is
 * the card's other half and is tracked on its own. */
export const colorsChanged = (stored: PanelColors | null, s: LookState): boolean =>
  s.ground !== (stored?.ground ?? DEFAULT_COLORS.ground) ||
  s.accent !== (stored?.accent ?? DEFAULT_COLORS.accent) ||
  s.text !== (stored?.text ?? DEFAULT_COLORS.text) ||
  s.nickname !== (stored?.nickname ?? '').replace(/\s+/g, ' ').trim() ||
  s.plate !== (stored?.plate ?? '') ||
  !sameLight(stored?.light, s.light);

/**
 * The hint under the pickers, naming the mode each moved color belongs to,
 * now that there can be two sets of swatches it might mean. Null when nothing
 * was moved. A light page nobody chose is never reported: it has no swatch
 * for the note to explain.
 */
export const colorHint = (s: LookState): string | null => {
  const dark = lookNotes({ ground: s.ground, accent: s.accent, text: s.text });
  const light = s.light ? lookNotes({ ground: s.ground, accent: s.accent, light: s.light }, 'light') : [];
  const say = (mode: string, notes: string[]) =>
    notes.length ? [`${mode}: ${notes.map((n) => n.charAt(0).toLowerCase() + n.slice(1)).join('; ')}.`] : [];
  const parts = [...say('Dark mode', dark), ...say('Light mode', light)];
  return parts.length ? parts.join(' ') : null;
};
