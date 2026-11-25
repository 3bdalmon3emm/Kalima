/**
 * Users export with the admin's choice of account types and columns.
 *
 * The admin picks one or more account types (Student, Teacher, ...) and the
 * columns; every user who holds any of the picked types is one row. Columns
 * of a type the user does not hold stay empty. Passwords are never exported
 * (they are stored hashed).
 *
 * Rows can also be filtered by what is inside the columns: the account level,
 * gender and sign-up dates for every account, and per type its own values (a
 * teacher's stages, subject, governorate, district; a student's stage, grade,
 * track, governorate, district; ...). A type's filters only narrow that type.
 */

import { prisma } from "../../../libs/db/prisma";
import { toCSV, toExcel } from "../../../libs/export";
import { BadRequestError } from "../../../libs/errors";
import { Prisma, role_enum, user_flag_enum } from "../generated/prisma/client";

type Locale = "ar" | "en";

const ROLES = Object.values(role_enum) as string[];

// Every column, with its header in both languages, grouped by the account
// type it belongs to ("all" applies to every account).
const FIELDS = {
  all: {
    id: ["رقم الحساب", "Account ID"],
    name: ["الاسم", "Name"],
    email: ["البريد الإلكتروني", "Email"],
    phone: ["الهاتف", "Phone"],
    secondary_phone: ["هاتف ثانوي", "Secondary phone"],
    gender: ["النوع", "Gender"],
    flag: ["مستوى الحساب", "Account level"],
    roles: ["الأدوار", "Roles"],
    confirmed: ["مؤكد", "Confirmed"],
    email_verified: ["البريد مفعّل", "Email verified"],
    created_at: ["تاريخ التسجيل", "Signed up"],
  },
  Student: {
    student_serial: ["سيريال الطالب", "Student serial"],
    level: ["الصف الدراسي", "Grade"],
    stage: ["المرحلة الدراسية", "Stage"],
    faction: ["الشعبة", "Track"],
    student_government: ["محافظة الطالب", "Student governorate"],
    student_zone: ["إدارة الطالب", "Student district"],
    parent_phone: ["هاتف ولي الأمر", "Parent phone"],
    graduated: ["متخرج", "Graduated"],
  },
  Teacher: {
    teacher_serial: ["كود المعلم", "Teacher code"],
    subject: ["المادة", "Subject"],
    teaching_stages: ["المراحل التي يدرّسها", "Stages taught"],
    teacher_government: ["محافظة المعلم", "Teacher governorate"],
    teacher_zone: ["إدارة المعلم", "Teacher district"],
    teaches_at: ["أماكن التدريس", "Teaching places"],
  },
  Parent: {
    parent_government: ["محافظة ولي الأمر", "Parent governorate"],
    parent_zone: ["إدارة ولي الأمر", "Parent district"],
    children: ["الأبناء", "Children"],
  },
} as const;

const ALL_FIELDS = new Map<string, { group: string; label: readonly [string, string] }>(
  Object.entries(FIELDS).flatMap(([group, fields]) =>
    Object.entries(fields).map(([key, label]) => [key, { group, label }] as const),
  ),
);

const WORDS = {
  ar: {
    yes: "نعم", no: "لا", male: "ذكر", female: "أنثى",
    roles: { Admin: "مسؤول", SubAdmin: "مسؤول فرعي", Teacher: "معلم", Student: "طالب", Parent: "ولي أمر", Lecturer: "محاضر", Moderator: "مشرف", Assistant: "مساعد" } as Record<string, string>,
    flags: { ELITE: "نخبة", PRO: "احترافي", NORMAL: "عادي", OBSERVER: "مراقب", Warned: "منذر", SUSPICIOUS: "مشبوه", BANNED: "محظور" } as Record<string, string>,
    stages: { primary: "ابتدائي", preparatory: "إعدادي", secondary: "ثانوي" },
  },
  en: {
    yes: "Yes", no: "No", male: "Male", female: "Female",
    roles: {} as Record<string, string>,
    flags: {} as Record<string, string>,
    stages: { primary: "Primary", preparatory: "Preparatory", secondary: "Secondary" },
  },
};

const TEACHING_STAGES = ["primary", "preparatory", "secondary"] as const;

// The catalogue for the export page: the account types, per type the columns
// it can pick, and the values its filters choose from.
export async function usersExportOptions() {
  const [governments, zones, stages, levels, subjects, factions] = await Promise.all([
    prisma.government.findMany({ where: { active: { not: false } }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.zones.findMany({ where: { active: { not: false } }, select: { id: true, title: true, government_id: true }, orderBy: { title: "asc" } }),
    prisma.stages.findMany({ select: { id: true, title: true, title_ar: true }, orderBy: { sort_order: "asc" } }),
    prisma.levels.findMany({
      where: { active: { not: false } },
      select: { id: true, title: true, title_ar: true, stage_id: true },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
    }),
    prisma.subjects.findMany({ where: { active: { not: false } }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.students.findMany({ where: { faction: { not: null } }, distinct: ["faction"], select: { faction: true } }),
  ]);
  return {
    roles: ROLES,
    fields: Object.fromEntries(Object.entries(FIELDS).map(([group, fields]) => [group, Object.keys(fields)])),
    lookups: {
      flags: Object.values(user_flag_enum),
      teaching_stages: TEACHING_STAGES,
      governments,
      zones,
      stages,
      levels,
      subjects,
      factions: factions.map((f) => f.faction).filter((f): f is string => !!f && !!f.trim()).sort(),
    },
  };
}

// Filter values arrive as lists; keep the ids (or the allowed words) only.
const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);
const words = (v: unknown, allowed?: readonly string[]) =>
  Array.isArray(v) ? v.map(String).filter((w) => w.trim() && (!allowed || allowed.includes(w))) : [];
const dateOf = (v: unknown, end = false) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (end) d.setUTCDate(d.getUTCDate() + 1);
  return d;
};
const place = (f: any) => ({
  ...(ids(f?.government).length ? { government_id: { in: ids(f.government) } } : {}),
  ...(ids(f?.zone).length ? { zone_id: { in: ids(f.zone) } } : {}),
});

// What a user of the given type must match to be exported, beyond holding it.
function roleFilter(role: string, f: any): Prisma.usersWhereInput | null {
  if (role === "Student") {
    const where: Prisma.studentsWhereInput = { ...place(f) };
    if (ids(f?.level).length) where.level_id = { in: ids(f.level) };
    else if (ids(f?.stage).length) where.levels = { stage_id: { in: ids(f.stage) } };
    if (words(f?.faction).length) where.faction = { in: words(f.faction) };
    if (f?.graduated === "yes" || f?.graduated === "no") where.graduated = f.graduated === "yes";
    return Object.keys(where).length ? { students: { is: where } } : null;
  }
  if (role === "Teacher") {
    const where: Prisma.teachersWhereInput = { ...place(f) };
    if (ids(f?.subject).length) where.subject_id = { in: ids(f.subject) };
    const stages = words(f?.stage, TEACHING_STAGES);
    if (stages.length) where.OR = stages.map((st) => ({ [`is_${st}`]: true }));
    return Object.keys(where).length ? { teachers: { is: where } } : null;
  }
  if (role === "Parent") {
    const where: Prisma.parentsWhereInput = place(f);
    return Object.keys(where).length ? { parents: { is: where } } : null;
  }
  return null;
}

export async function buildUsersExport(body: any, locale: Locale) {
  const roles = Array.isArray(body?.roles) ? body.roles.filter((r: unknown) => ROLES.includes(String(r))) : [];
  if (!roles.length) throw new BadRequestError("Pick at least one account type");
  const fields: string[] = Array.isArray(body?.fields)
    ? [...ALL_FIELDS.keys()].filter((key) => body.fields.includes(key))
    : [];
  if (!fields.length) throw new BadRequestError("Pick at least one column");

  // Every picked type, narrowed by its own filters; the shared filters
  // (level, gender, sign-up dates) apply to all of them.
  const filters = body?.filters ?? {};
  const common = filters.all ?? {};
  const where: Prisma.usersWhereInput = {
    is_deleted: { not: true },
    OR: roles.map((role: string) => {
      const holds: Prisma.usersWhereInput = { OR: [{ role: role as role_enum }, { user_roles: { some: { role: role as role_enum } } }] };
      const own = roleFilter(role, filters[role]);
      return own ? { AND: [holds, own] } : holds;
    }),
  };
  const flags = words(common.flag, Object.values(user_flag_enum));
  if (flags.length) where.flag = { in: flags as user_flag_enum[] };
  const genders = words(common.gender, ["male", "female"]);
  if (genders.length) where.gender = { in: genders as ("male" | "female")[] };
  const from = dateOf(common.from);
  const to = dateOf(common.to, true);
  if (from || to) where.created_at = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };

  const users = await prisma.users.findMany({
    where,
    orderBy: { id: "asc" },
    select: {
      id: true, name: true, email: true, phone: true, secondary_phone: true, gender: true,
      flag: true, role: true, confirmed: true, is_email_verified: true, created_at: true,
      user_roles: { select: { role: true } },
      students: {
        select: {
          sequenced_id: true, faction: true, parent_phone_number: true, graduated: true,
          levels: { select: { title: true, title_ar: true, stages: { select: { title: true, title_ar: true } } } },
          government: { select: { title: true } },
          zones: { select: { title: true } },
        },
      },
      teachers: {
        select: {
          serial: true, is_primary: true, is_preparatory: true, is_secondary: true,
          subjects: { select: { title: true } },
          government: { select: { title: true } },
          zones: { select: { title: true } },
        },
      },
      parents: {
        select: {
          government: { select: { title: true } },
          zones: { select: { title: true } },
          parent_children: { select: { students: { select: { sequenced_id: true, users: { select: { name: true } } } } } },
        },
      },
    },
  });

  // Teaching places come from their own table, for the teachers only.
  const places = new Map<number, string[]>();
  if (fields.includes("teaches_at")) {
    const rows = await prisma.teaches_at.findMany({
      where: { user_id: { in: users.map((u) => u.id) }, active: { not: false } },
      select: { user_id: true, location_name: true },
    });
    for (const r of rows) if (r.location_name) places.set(r.user_id, [...(places.get(r.user_id) ?? []), r.location_name]);
  }

  const w = WORDS[locale];
  const yesNo = (v: boolean | null | undefined) => (v ? w.yes : w.no);
  const named = (x: { title: string; title_ar?: string | null } | null | undefined) =>
    (x ? (locale === "ar" && x.title_ar) || x.title : "");

  const rows = users.map((u) => {
    const held = new Set([u.role, ...u.user_roles.map((r) => r.role)].filter(Boolean) as string[]);
    const s = u.students;
    const t = u.teachers;
    const p = u.parents;
    const value: Record<string, unknown> = {
      id: u.id,
      name: u.name,
      email: u.email ?? "",
      phone: u.phone ?? "",
      secondary_phone: u.secondary_phone ?? "",
      gender: u.gender ? w[u.gender] : "",
      flag: w.flags[u.flag] ?? u.flag,
      roles: [...held].map((r) => w.roles[r] ?? r).join("، "),
      confirmed: yesNo(u.confirmed),
      email_verified: yesNo(u.is_email_verified),
      created_at: u.created_at ? u.created_at.toISOString().slice(0, 10) : "",
      student_serial: s?.sequenced_id ?? "",
      level: named(s?.levels),
      stage: named(s?.levels?.stages),
      faction: s?.faction ?? "",
      student_government: s?.government?.title ?? "",
      student_zone: s?.zones?.title ?? "",
      parent_phone: s?.parent_phone_number ?? "",
      graduated: s ? yesNo(s.graduated) : "",
      teacher_serial: t?.serial ?? "",
      subject: t?.subjects?.title ?? "",
      teaching_stages: t
        ? [t.is_primary && w.stages.primary, t.is_preparatory && w.stages.preparatory, t.is_secondary && w.stages.secondary].filter(Boolean).join("، ")
        : "",
      teacher_government: t?.government?.title ?? "",
      teacher_zone: t?.zones?.title ?? "",
      teaches_at: (places.get(u.id) ?? []).join("، "),
      parent_government: p?.government?.title ?? "",
      parent_zone: p?.zones?.title ?? "",
      children: (p?.parent_children ?? [])
        .map((c) => `${c.students.users.name}${c.students.sequenced_id ? ` (${c.students.sequenced_id})` : ""}`)
        .join("، "),
    };
    return Object.fromEntries(fields.map((key) => [key, value[key]]));
  });

  const headers = fields.map((key) => ALL_FIELDS.get(key)!.label[locale === "ar" ? 0 : 1]);
  return { columns: fields, headers, rows };
}

export async function usersExportFile(body: any, format: "xlsx" | "csv", locale: Locale) {
  const { columns, headers, rows } = await buildUsersExport(body, locale);
  const day = new Date().toISOString().split("T")[0];
  if (format === "csv") {
    return { buffer: toCSV(rows, { columns, headers }), contentType: "text/csv; charset=utf-8", filename: `users-${day}.csv` };
  }
  return {
    buffer: toExcel(rows, { sheetName: "users", columns, headers, rtl: locale === "ar" }),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `users-${day}.xlsx`,
  };
}
