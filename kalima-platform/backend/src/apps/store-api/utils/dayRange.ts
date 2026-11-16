// A range of whole days from ?from=YYYY-MM-DD to ?to=YYYY-MM-DD (both
// inclusive, Cairo time). Either end may be missing; with neither, there is
// no range. `lt` is the start of the day after `to`.

const CAIRO_OFFSET = "+02:00";

const parseDay = (v: unknown): Date | undefined => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00${CAIRO_OFFSET}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export type DayRange = { gte?: Date; lt?: Date };

export function dayRange(query: Record<string, unknown>): DayRange | null {
  const from = parseDay(query.from);
  const toDay = parseDay(query.to);
  if (!from && !toDay) return null;
  const lt = toDay ? new Date(toDay.getTime() + 24 * 60 * 60 * 1000) : undefined;
  return { ...(from && { gte: from }), ...(lt && { lt }) };
}
