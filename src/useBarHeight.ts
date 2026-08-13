import { useEffect, type RefObject } from 'react';

/**
 * Tell the group headers how far down to stick.
 *
 * `.control-bar` pins at the top of a screen and `.group-head` pins directly
 * under it, which means the header needs the bar's height — and the bar does
 * not have a fixed one. It grows when the position chips open on the Team
 * list, and it differs between screens: the Team bar carries a search row, a
 * segment and a count, the Schedule bar carries a year and a segment. A guess
 * is wrong on one screen or the other and wrong on both the moment a control
 * wraps, so the bar measures itself and publishes the answer as `--bar-h` on
 * the scrolling `.screen` around it.
 *
 * Pass the same `deps` you would pass an effect that has to re-find the bar —
 * anything that unmounts and remounts it.
 */
export function useBarHeight(bar: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const el = bar.current;
    if (!el) return;

    const publish = () =>
      el.closest<HTMLElement>('.screen')?.style.setProperty('--bar-h', `${el.offsetHeight}px`);

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
