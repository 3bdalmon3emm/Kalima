import type { PrismaClient } from "../../../libs/db/prisma";
import { prisma } from "../../../libs/db/prisma";
import { role_enum } from "../generated/prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../../libs/errors";

// Staff shifts: the SubAdmin and the Moderator press "start shift" and "end
// shift"; there is no schedule, break or absence, only worked time. Days,
// weeks (Saturday first), months and years follow Cairo time.

export const SHIFT_ROLES: role_enum[] = [role_enum.SubAdmin, role_enum.Moderator];
export const AUTO_CLOSE_HOURS = 12;
const HOUR = 3600_000;
const TZ = "Africa/Cairo";
const PERIODS = ["day", "week", "month", "year"] as const;
export type ShiftPeriod = (typeof PERIODS)[number];

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const pad = (n: number) => String(n).padStart(2, "0");

// The Cairo wall clock at an instant.
function wall(ms: number) {
  const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
function offsetAt(ms: number) {
  const w = wall(ms);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}
// The instant Cairo's day y-m-d starts (m from 1; days past the month's end roll over).
function cairoMidnight(y: number, m: number, d: number) {
  const naive = Date.UTC(y, m - 1, d);
  const guess = naive - offsetAt(naive);
  return naive - offsetAt(guess);
}
const dayKey = (ms: number) => { const w = wall(ms); return `${w.y}-${pad(w.m)}-${pad(w.d)}`; };
const utcKey = (t: number) => new Date(t).toISOString().slice(0, 10);

function parseDate(date?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  const w = wall(Date.now());
  return { y: w.y, m: w.m, d: w.d };
}

// The period around a date and its columns: days, or months for a year.
function periodRange(period: ShiftPeriod, date?: string) {
  const { y, m, d } = parseDate(date);
  let first: { y: number; m: number; d: number };
  let days: number;
  if (period === "day") { first = { y, m, d }; days = 1; }
  else if (period === "week") {
    const back = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 1) % 7; // Saturday first
    first = { y, m, d: d - back }; days = 7;
  } else if (period === "month") {
    first = { y, m, d: 1 }; days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  } else {
    first = { y, m: 1, d: 1 }; days = Math.round((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / (24 * HOUR));
  }
  const from = cairoMidnight(first.y, first.m, first.d);
  const to = cairoMidnight(first.y, first.m, first.d + days);
  const columns = period === "year"
    ? Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`)
    : Array.from({ length: days }, (_, i) => utcKey(Date.UTC(first.y, first.m - 1, first.d + i)));
  return { from, to, columns, date: `${y}-${pad(m)}-${pad(d)}` };
}

type ShiftRow = { id: number; user_id: number; started_at: Date; ended_at: Date | null; auto_closed: boolean; edited_at: Date | null };

// Splits each shift on Cairo midnights inside [from, to): seconds per day per
// person, and the shifts that touch each day.
function splitByDay(shifts: ShiftRow[], from: number, to: number, now: number) {
  const out = new Map<number, Map<string, { seconds: number; shifts: any[] }>>();
  for (const s of shifts) {
    const start = s.started_at.getTime();
    const end = Math.min(s.ended_at ? s.ended_at.getTime() : now, to);
    let cursor = Math.max(start, from);
    const view = {
      id: s.id, started_at: s.started_at, ended_at: s.ended_at,
      open: !s.ended_at, auto_closed: s.auto_closed, edited: !!s.edited_at,
    };
    while (cursor < end) {
      const w = wall(cursor);
      const segEnd = Math.min(end, cairoMidnight(w.y, w.m, w.d + 1));
      if (segEnd <= cursor) break;
      const days = out.get(s.user_id) ?? new Map();
      out.set(s.user_id, days);
      const key = dayKey(cursor);
      const day = days.get(key) ?? { seconds: 0, shifts: [] };
      day.seconds += Math.round((segEnd - cursor) / 1000);
      day.shifts.push(view);
      days.set(key, day);
      cursor = segEnd;
    }
  }
  return out;
}

class StaffShiftService {
  constructor(private db: PrismaClient = prisma) {}

  // A shift left open for 12 hours ends 12 hours after it started.
  // (Through the model, not raw SQL: the tables live in the schema the
  // connection names, which raw SQL would not follow.)
  async closeStale() {
    const stale = await this.db.staff_shifts.findMany({
      where: { ended_at: null, started_at: { lt: new Date(Date.now() - AUTO_CLOSE_HOURS * HOUR) } },
      select: { id: true, started_at: true },
    });
    for (const s of stale) {
      await this.db.staff_shifts.updateMany({
        where: { id: s.id, ended_at: null },
        data: { ended_at: new Date(s.started_at.getTime() + AUTO_CLOSE_HOURS * HOUR), auto_closed: true },
      });
    }
  }

  private shiftsBetween(from: number, to: number, userIds?: number[]) {
    return this.db.staff_shifts.findMany({
      where: {
        ...(userIds && { user_id: { in: userIds } }),
        started_at: { lt: new Date(to) },
        OR: [{ ended_at: null }, { ended_at: { gt: new Date(from) } }],
      },
      orderBy: { started_at: "asc" },
    });
  }

  // The person's own card: the open shift, today, this week day by day, this month.
  async mine(userId: number) {
    await this.closeStale();
    const now = Date.now();
    const week = periodRange("week");
    const month = periodRange("month");
    const today = dayKey(now);
    const from = Math.min(week.from, month.from);
    const to = Math.max(week.to, month.to);
    const [open, shifts] = await Promise.all([
      this.db.staff_shifts.findFirst({ where: { user_id: userId, ended_at: null } }),
      this.shiftsBetween(from, to, [userId]),
    ]);
    const days = splitByDay(shifts, from, to, now).get(userId) ?? new Map();
    const sum = (keys: string[]) => keys.reduce((s, k) => s + (days.get(k)?.seconds || 0), 0);
    return {
      now: new Date(now),
      auto_close_hours: AUTO_CLOSE_HOURS,
      open_shift: open && { id: open.id, started_at: open.started_at },
      today: { date: today, seconds: days.get(today)?.seconds || 0, shifts: days.get(today)?.shifts || [] },
      week: {
        from: week.columns[0], to: week.columns[6],
        seconds: sum(week.columns),
        days: week.columns.map((k) => ({ date: k, seconds: days.get(k)?.seconds || 0, shifts: days.get(k)?.shifts || [] })),
      },
      month: { month: month.date.slice(0, 7), seconds: sum(month.columns) },
    };
  }

  async start(userId: number) {
    await this.closeStale();
    const open = await this.db.staff_shifts.findFirst({ where: { user_id: userId, ended_at: null } });
    if (open) throw new ConflictError("A shift is already running");
    try {
      return await this.db.staff_shifts.create({ data: { user_id: userId } });
    } catch (err: any) {
      if (err?.code === "P2002") throw new ConflictError("A shift is already running");
      throw err;
    }
  }

  async end(userId: number) {
    await this.closeStale();
    const open = await this.db.staff_shifts.findFirst({ where: { user_id: userId, ended_at: null } });
    if (!open) throw new BadRequestError("No shift is running");
    return this.db.staff_shifts.update({ where: { id: open.id }, data: { ended_at: new Date() } });
  }

  // Every SubAdmin and Moderator (and anyone else with shifts in the
  // period), with their time per day, or per month for a year.
  async report(periodInput: string, date?: string) {
    const period = (PERIODS as readonly string[]).includes(periodInput) ? (periodInput as ShiftPeriod) : "day";
    await this.closeStale();
    const now = Date.now();
    const range = periodRange(period, date);
    const shifts = await this.shiftsBetween(range.from, range.to);
    const withShifts = [...new Set(shifts.map((s) => s.user_id))];
    const [users, openShifts] = await Promise.all([
      this.db.users.findMany({
        where: {
          OR: [
            { is_deleted: { not: true }, user_roles: { some: { role: { in: SHIFT_ROLES } } } },
            { id: { in: withShifts } },
          ],
        },
        select: { id: true, name: true, email: true, phone: true, profile_pic_url: true, user_roles: { select: { role: true } } },
        orderBy: { name: "asc" },
      }),
      this.db.staff_shifts.findMany({ where: { ended_at: null }, select: { user_id: true, started_at: true } }),
    ]);
    const openBy = new Map(openShifts.map((s) => [s.user_id, s.started_at]));
    const byUser = splitByDay(shifts, range.from, range.to, now);

    const employees = users.map((u) => {
      const days = byUser.get(u.id) ?? new Map();
      const columns: Record<string, { seconds: number; days?: number; shifts?: any[] }> = {};
      if (period === "year") {
        for (const [key, day] of days) {
          const col = (columns[key.slice(0, 7)] ??= { seconds: 0, days: 0 });
          col.seconds += day.seconds;
          if (day.seconds > 0) col.days! += 1;
        }
      } else {
        for (const [key, day] of days) columns[key] = day;
      }
      const seconds = [...days.values()].reduce((s, d) => s + d.seconds, 0);
      const workedDays = [...days.values()].filter((d) => d.seconds > 0).length;
      const shiftIds = new Set([...days.values()].flatMap((d) => d.shifts.map((s: any) => s.id)));
      return {
        user: {
          id: u.id, name: u.name, email: u.email, phone: u.phone, profile_pic_url: u.profile_pic_url,
          role: u.user_roles.map((r) => r.role).find((r) => SHIFT_ROLES.includes(r)) ?? u.user_roles[0]?.role ?? null,
        },
        on_shift_since: openBy.get(u.id) ?? null,
        seconds,
        days_worked: workedDays,
        shifts: shiftIds.size,
        columns,
      };
    }).sort((a, b) => b.seconds - a.seconds || a.user.name.localeCompare(b.user.name));

    const total = employees.reduce((s, e) => s + e.seconds, 0);
    const dayCount = employees.reduce((s, e) => s + e.days_worked, 0);
    return {
      period,
      date: range.date,
      from: new Date(range.from),
      to: new Date(range.to),
      now: new Date(now),
      columns: range.columns,
      summary: {
        seconds: total,
        worked: employees.filter((e) => e.seconds > 0).length,
        on_shift: employees.filter((e) => e.on_shift_since).length,
        avg_day_seconds: dayCount ? Math.round(total / dayCount) : 0,
      },
      employees,
    };
  }

  // The Admin corrects or adds a shift (a forgotten end, a missed start).
  private async checkTimes(userId: number, start: Date, end: Date | null, ignoreId?: number) {
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) throw new BadRequestError("Invalid shift time");
    const now = Date.now() + 60_000;
    if (start.getTime() > now || (end && end.getTime() > now)) throw new BadRequestError("A shift cannot be in the future");
    if (end && end <= start) throw new BadRequestError("The shift must end after it starts");
    const overlap = await this.db.staff_shifts.findFirst({
      where: {
        user_id: userId,
        ...(ignoreId && { id: { not: ignoreId } }),
        ...(end ? { started_at: { lt: end } } : {}),
        OR: [{ ended_at: null }, { ended_at: { gt: start } }],
      },
    });
    if (overlap) throw new ConflictError("This shift overlaps another shift");
  }

  async add(adminId: number, body: { user_id?: number; started_at?: string; ended_at?: string | null }) {
    const userId = Number(body.user_id);
    if (!userId) throw new BadRequestError("Pick the employee");
    const start = new Date(body.started_at || "");
    const end = body.ended_at ? new Date(body.ended_at) : null;
    if (!end) throw new BadRequestError("The shift must end after it starts");
    await this.checkTimes(userId, start, end);
    return this.db.staff_shifts.create({
      data: { user_id: userId, started_at: start, ended_at: end, edited_by: adminId, edited_at: new Date() },
    });
  }

  async edit(adminId: number, id: number, body: { started_at?: string; ended_at?: string | null }) {
    const row = await this.db.staff_shifts.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("Shift not found");
    const start = body.started_at ? new Date(body.started_at) : row.started_at;
    const end = body.ended_at === undefined ? row.ended_at : body.ended_at ? new Date(body.ended_at) : null;
    await this.checkTimes(row.user_id, start, end, id);
    return this.db.staff_shifts.update({
      where: { id },
      data: { started_at: start, ended_at: end, auto_closed: false, edited_by: adminId, edited_at: new Date() },
    });
  }

  async remove(id: number) {
    const row = await this.db.staff_shifts.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("Shift not found");
    await this.db.staff_shifts.delete({ where: { id } });
  }
}

export const staffShiftService = new StaffShiftService();
