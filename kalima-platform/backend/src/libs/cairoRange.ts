// Date filters read the way people in Egypt mean them. A day written
// "2026-11-26" is that whole day in Cairo: from its first minute up to the
// next day's start, so a range "from the 1st to the 26th" includes every
// order of the 26th. A full timestamp (2026-11-26T21:59:59.999Z) is taken
// as it is. Cairo's offset is read for the date itself, summer time included.

const TZ = "Africa/Cairo";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function offsetAt(ms: number) {
  const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

// The instant a Cairo day starts ("2026-11-26" -> 2026-11-25T22:00:00Z).
export function cairoDayStart(day: string, addDays = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d + addDays);
  const guess = naive - offsetAt(naive);
  return new Date(naive - offsetAt(guess));
}

const valid = (d: Date) => !Number.isNaN(d.getTime());

// { gte, lt } or { gte, lte } for a created_at/confirmed_at filter, or
// undefined with neither end. Bad values are ignored.
export function cairoRange(start?: unknown, end?: unknown): { gte?: Date; lt?: Date; lte?: Date } | undefined {
  const s = typeof start === "string" && start ? start : start instanceof Date ? start.toISOString() : "";
  const e = typeof end === "string" && end ? end : end instanceof Date ? end.toISOString() : "";
  const out: { gte?: Date; lt?: Date; lte?: Date } = {};
  if (s) {
    const d = DATE_ONLY.test(s) ? cairoDayStart(s) : new Date(s);
    if (valid(d)) out.gte = d;
  }
  if (e) {
    if (DATE_ONLY.test(e)) out.lt = cairoDayStart(e, 1);
    else {
      const d = new Date(e);
      if (valid(d)) out.lte = d;
    }
  }
  return out.gte || out.lt || out.lte ? out : undefined;
}

export const isDateOnly = (v: unknown) => typeof v === "string" && DATE_ONLY.test(v);
