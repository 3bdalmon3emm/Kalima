import * as XLSX from "xlsx";
import { staffShiftService } from "./staff-shift.service";

// A month of attendance as an Excel workbook, for paying staff at the end of
// the month: one sheet per employee, titled with the month, then the month
// split into weeks (Saturday to Friday, like the attendance page). Each week
// lists every day (empty days included, so it prints as a full timesheet)
// and ends with its own total; the month total and the signatures close the
// sheet. Hours appear as h:mm and as a plain number to multiply by an
// hourly rate. Cairo time, Arabic, right to left.

const TZ = "Africa/Cairo";
const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekday = new Intl.DateTimeFormat("ar-EG", { timeZone: TZ, weekday: "long" });
const dayMonth = new Intl.DateTimeFormat("ar-EG", { timeZone: TZ, day: "numeric", month: "long" });
const monthName = new Intl.DateTimeFormat("ar-EG", { timeZone: TZ, month: "long", year: "numeric" });

const ROLE_AR: Record<string, string> = { SubAdmin: "نائب مدير", Moderator: "مشرف", Admin: "مدير" };
const ORDINAL = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];
const COLUMNS = ["التاريخ", "اليوم", "الشيفتات", "أول دخول", "آخر خروج", "ساعات اليوم (س:د)", "ساعات اليوم (رقم)", "ملاحظات"];
const WIDTHS = [12, 11, 36, 10, 10, 16, 16, 30];

export const hm = (seconds: number) => {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
const decimalHours = (seconds: number) => Math.round((seconds / 3600) * 100) / 100;
// The time as people in Egypt say it: "9:15 الصبح", "12 الضهر", "12 بالليل" (AM/PM read the wrong way round at 12).
const dayPart = (h: number) => (h >= 4 && h < 6 ? "الفجر" : h >= 6 && h < 12 ? "الصبح" : h >= 12 && h < 15 ? "الضهر" : h >= 15 && h < 18 ? "العصر" : h === 18 ? "المغرب" : "بالليل");
const at = (d: Date | string) => {
  const [h, m] = time.format(new Date(d)).split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${dayPart(h)}`;
};
// A day key "2026-11-26" read as noon Cairo, so the weekday never slips.
const dayDate = (key: string) => new Date(`${key}T12:00:00+02:00`);
// Saturday starts a week.
const isSaturday = (key: string) => dayDate(key).getUTCDay() === 6;

type Shift = { id: number; started_at: Date; ended_at: Date | null; open: boolean; auto_closed: boolean; edited: boolean };
type Day = { seconds: number; shifts?: Shift[] };

// The month's days in weeks: a new week on every Saturday.
function weeksOf(keys: string[]) {
  const weeks: string[][] = [];
  for (const key of keys) {
    if (!weeks.length || isSaturday(key)) weeks.push([]);
    weeks[weeks.length - 1].push(key);
  }
  return weeks;
}

// Excel sheet names: 31 characters, no []:*?/\ and unique.
function sheetName(name: string, used: Set<string>) {
  const base = (name || "موظف").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "موظف";
  let out = base;
  for (let n = 2; used.has(out); n++) out = `${base.slice(0, 26)} ${n}`;
  used.add(out);
  return out;
}

function employeeSheet(e: any, keys: string[], title: string) {
  const rows: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];
  // A row whose text spans the whole table width.
  const wide = (text: string) => {
    merges.push({ s: { r: rows.length, c: 0 }, e: { r: rows.length, c: COLUMNS.length - 1 } });
    rows.push([text]);
  };
  const columns = e.columns as Record<string, Day>;
  const shiftsOf = (list: string[]) => {
    const map = new Map<number, Shift>();
    for (const k of list) for (const s of columns[k]?.shifts ?? []) map.set(s.id, s);
    return map.size;
  };
  const totalOf = (list: string[]) => list.reduce((s, k) => s + (columns[k]?.seconds ?? 0), 0);
  const daysOf = (list: string[]) => list.filter((k) => (columns[k]?.seconds ?? 0) > 0).length;

  wide(`حضور وانصراف الموظفين - شهر ${title}`);
  wide(`الموظف: ${e.user.name}   |   الدور: ${ROLE_AR[e.user.role ?? ""] ?? e.user.role ?? ""}${e.user.phone ? `   |   الموبايل: ${e.user.phone}` : ""}`);
  wide(`إجمالي الشهر: ${hm(e.seconds)} ساعة (${decimalHours(e.seconds)})   |   ${e.days_worked} يوم حضور   |   ${shiftsOf(keys)} شيفت`);
  rows.push([]);

  weeksOf(keys).forEach((week, i) => {
    wide(`الأسبوع ${ORDINAL[i] ?? i + 1}: من ${weekday.format(dayDate(week[0]))} ${dayMonth.format(dayDate(week[0]))} إلى ${weekday.format(dayDate(week[week.length - 1]))} ${dayMonth.format(dayDate(week[week.length - 1]))}`);
    rows.push([...COLUMNS]);
    for (const key of week) {
      const day = columns[key];
      const list = [...(day?.shifts ?? [])].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
      const notes = [
        list.some((s) => s.open) && "شيفت لسه مفتوح",
        list.some((s) => s.auto_closed) && "اتقفل تلقائيًا بعد 12 ساعة",
        list.some((s) => s.edited) && "عدّله المدير",
      ].filter(Boolean).join("، ");
      const last = list[list.length - 1];
      rows.push([
        key,
        weekday.format(dayDate(key)),
        list.map((s) => `${at(s.started_at)} - ${s.ended_at ? at(s.ended_at) : "الآن"}`).join("  /  ") || "—",
        list.length ? at(list[0].started_at) : "",
        last ? (last.ended_at ? at(last.ended_at) : "الآن") : "",
        day?.seconds ? hm(day.seconds) : "",
        day?.seconds ? decimalHours(day.seconds) : "",
        notes,
      ]);
    }
    const seconds = totalOf(week);
    rows.push([`إجمالي الأسبوع ${ORDINAL[i] ?? i + 1}`, "", `${daysOf(week)} يوم حضور · ${shiftsOf(week)} شيفت`, "", "", hm(seconds), decimalHours(seconds), ""]);
    rows.push([]);
  });

  rows.push(["إجمالي الشهر", "", `${e.days_worked} يوم حضور · ${shiftsOf(keys)} شيفت`, "", "", hm(e.seconds), decimalHours(e.seconds), ""]);
  rows.push([]);
  rows.push([]);
  rows.push(["توقيع الموظف:", "", "", "", "توقيع المدير:"]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = WIDTHS.map((wch) => ({ wch }));
  ws["!merges"] = merges;
  return ws;
}

export async function attendanceWorkbook(month?: string) {
  const report = await staffShiftService.report("month", month ? `${month}-01` : undefined);
  const title = monthName.format(dayDate(report.columns[0]));
  const staff = report.employees.filter((e) => e.seconds > 0 || ["SubAdmin", "Moderator"].includes(e.user.role ?? ""));
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const e of staff) XLSX.utils.book_append_sheet(wb, employeeSheet(e, report.columns, title), sheetName(e.user.name, used));
  if (!staff.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[`لا يوجد حضور في شهر ${title}`]]), "فارغ");
  wb.Workbook = { ...(wb.Workbook || {}), Views: [{ RTL: true }] };

  return {
    filename: `attendance-${report.columns[0].slice(0, 7)}.xlsx`,
    buffer: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer),
  };
}
