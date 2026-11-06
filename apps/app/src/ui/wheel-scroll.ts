/**
Where a sideways scroller goes for a mouse wheel turn (F-DAT-02/05-006: a row of chips has no
scrollbar and a wheel only turns vertically): the vertical delta moves it sideways, clamped to its
range. `null` leaves the wheel to the page: a turn that is already sideways, a scroller with
nothing to scroll, or one that is at the end the wheel is pushing towards.
*/
export const wheelTarget = ({
  deltaX,
  deltaY,
  left,
  max,
}: {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly left: number;
  /** The most it can scroll: content width less its own. */
  readonly max: number;
}): null | number => {
  if (max <= 0 || Math.abs(deltaY) <= Math.abs(deltaX)) {
    return null;
  }
  const next = Math.min(max, Math.max(0, left + deltaY));
  return next === left ? null : next;
};
