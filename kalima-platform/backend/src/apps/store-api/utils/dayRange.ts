// A range from ?from=YYYY-MM-DD to ?to=YYYY-MM-DD (both days inclusive, Cairo
// time). Optional ?from_time=HH:MM and ?to_time=HH:MM narrow it to the hour:
// from that minute of the first day up to the end of that minute on the last
// day. Either end may be missing; with neither, there is no range.

const CAIRO_OFFSET = "+02:00";
const DAY = 24 * 60 * 60 * 1000;

const parseDay = (v: unknown, time = "00:00"): Date | undefined => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T${time}:00${CAIRO_OFFSET}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const parseTime = (v: unknown): string | undefined => {
  if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return undefined;
  return v;
};

export type DayRange = { gte?: Date; lt?: Date };

export function dayRange(query: Record<string, unknown>): DayRange | null {
  const fromTime = parseTime(query.from_time);
  const toTime = parseTime(query.to_time);
  const from = parseDay(query.from, fromTime);
  const toStart = parseDay(query.to, toTime);
  if (!from && !toStart) return null;
  // Without a time the whole last day counts; with one, up to the end of that minute.
  const lt = toStart ? new Date(toStart.getTime() + (toTime ? 60 * 1000 : DAY)) : undefined;
  return { ...(from && { gte: from }), ...(lt && { lt }) };
}
