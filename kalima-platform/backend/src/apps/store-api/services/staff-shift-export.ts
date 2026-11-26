import * as XLSX from "xlsx";
import { staffShiftService } from "./staff-shift.service";

// A month of attendance as an Excel workbook, for paying staff at the end of
// the month: a summary sheet (one row per employee, with the hours both as
// h:mm and as a plain number to multiply by an hourly rate), then one sheet
// per employee with every day of the month (empty days included, so the
// sheet prints as a full timesheet) and a total row. Cairo time, Arabic,
// right to left.

const TZ = "Africa/Cairo";
const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekday = new Intl.DateTimeFormat("ar-EG", { timeZone: TZ, weekday: "long" });
const monthName = new Intl.DateTimeFormat("ar-EG", { timeZone: TZ, month: "long", year: "numeric" });

const ROLE_AR: Record<string, string> = { SubAdmin: "نائب مدير", Moderator: "مشرف", Admin: "مدير" };

export const hm = (seconds: number) => {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
const decimalHours = (seconds: number) => Math.round((seconds / 3600) * 100) / 100;
const at = (d: Date | string) => time.format(new Date(d));
// A day key "2026-11-26" read as noon Cairo, so the weekday never slips.
const dayDate = (key: string) => new Date(`${key}T12:00:00+02:00`);

type Shift = { id: number; started_at: Date; ended_at: Date | null; open: boolean; auto_closed: boolean; edited: boolean };

function sheetFrom(rows: (string | number)[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

// Excel sheet names: 31 characters, no []:*?/\ and unique.
function sheetName(name: string, used: Set<string>) {
  const base = (name || "موظف").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "موظف";
  let out = base;
  for (let n = 2; used.has(out); n++) out = `${base.slice(0, 26)} ${n}`;
  used.add(out);
  return out;
}

export async function attendanceWorkbook(month?: string) {
  const report = await staffShiftService.report("month", month ? `${month}-01` : undefined);
  const title = monthName.format(dayDate(report.columns[0]));
  const staff = report.employees.filter((e) => e.seconds > 0 || ["SubAdmin", "Moderator"].includes(e.user.role ?? ""));
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  const summary: (string | number)[][] = [
    [`حضور وانصراف الموظفين - ${title}`],
    [],
    ["الموظف", "الدور", "البريد الإلكتروني", "الموبايل", "أيام الحضور", "عدد الشيفتات", "إجمالي الساعات (س:د)", "إجمالي الساعات (رقم)", "متوسط اليوم (س:د)", "شيفتات اتقفلت تلقائيًا", "شيفتات عدّلها المدير"],
  ];
  const details: { name: string; ws: XLSX.WorkSheet }[] = [];

  for (const e of staff) {
    const days = report.columns.map((key) => ({ key, day: (e.columns as Record<string, { seconds: number; shifts?: Shift[] }>)[key] }));
    const shifts = new Map<number, Shift>();
    for (const { day } of days) for (const s of day?.shifts ?? []) shifts.set(s.id, s);
    const auto = [...shifts.values()].filter((s) => s.auto_closed).length;
    const edited = [...shifts.values()].filter((s) => s.edited).length;
    summary.push([
      e.user.name, ROLE_AR[e.user.role ?? ""] ?? e.user.role ?? "", e.user.email ?? "", e.user.phone ?? "",
      e.days_worked, shifts.size, hm(e.seconds), decimalHours(e.seconds),
      e.days_worked ? hm(e.seconds / e.days_worked) : "0:00", auto, edited,
    ]);

    const rows: (string | number)[][] = [
      [`${e.user.name} - ${title}`],
      [`${ROLE_AR[e.user.role ?? ""] ?? ""}${e.user.phone ? ` · ${e.user.phone}` : ""}`],
      [],
      ["التاريخ", "اليوم", "الشيفتات", "أول دخول", "آخر خروج", "ساعات اليوم (س:د)", "ساعات اليوم (رقم)", "ملاحظات"],
    ];
    for (const { key, day } of days) {
      const list = day?.shifts ?? [];
      const notes = [
        list.some((s) => s.open) && "شيفت لسه مفتوح",
        list.some((s) => s.auto_closed) && "اتقفل تلقائيًا بعد 12 ساعة",
        list.some((s) => s.edited) && "عدّله المدير",
      ].filter(Boolean).join("، ");
      rows.push([
        key,
        weekday.format(dayDate(key)),
        list.map((s) => `${at(s.started_at)} - ${s.ended_at ? at(s.ended_at) : "الآن"}`).join("  /  ") || "—",
        list.length ? at(list[0].started_at) : "",
        list.length ? (list[list.length - 1].ended_at ? at(list[list.length - 1].ended_at!) : "الآن") : "",
        day?.seconds ? hm(day.seconds) : "",
        day?.seconds ? decimalHours(day.seconds) : "",
        notes,
      ]);
    }
    rows.push([]);
    rows.push(["الإجمالي", "", `${e.days_worked} يوم حضور · ${shifts.size} شيفت`, "", "", hm(e.seconds), decimalHours(e.seconds), ""]);
    rows.push([]);
    rows.push(["توقيع الموظف:", "", "", "", "توقيع المدير:"]);
    details.push({ name: e.user.name, ws: sheetFrom(rows, [12, 12, 34, 10, 10, 16, 16, 30]) });
  }

  const total = staff.reduce((s, e) => s + e.seconds, 0);
  summary.push([]);
  summary.push(["الإجمالي", "", "", "", "", "", hm(total), decimalHours(total)]);
  XLSX.utils.book_append_sheet(wb, sheetFrom(summary, [24, 12, 28, 14, 11, 12, 18, 18, 16, 18, 18]), sheetName("الملخص", used));
  for (const d of details) XLSX.utils.book_append_sheet(wb, d.ws, sheetName(d.name, used));
  wb.Workbook = { ...(wb.Workbook || {}), Views: [{ RTL: true }] };

  return {
    filename: `attendance-${report.columns[0].slice(0, 7)}.xlsx`,
    buffer: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer),
  };
}
