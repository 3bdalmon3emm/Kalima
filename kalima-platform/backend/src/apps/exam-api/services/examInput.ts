import { ValidationError } from "../../../libs/errors";

// Parsing and checks for exam settings and draw rules sent by the admin.

export const EXAM_TYPES = ["exam", "homework"] as const;
export const EXAM_MODES = ["manual", "random"] as const;
export const DIFFICULTY_KEYS = ["easy", "medium", "hard", "very_hard"] as const;
export const SHOW_ANSWERS = ["after_last", "immediately", "after_end", "never"] as const;

export interface ExamSettings {
  name?: string;
  description?: string | null;
  serial?: string | null;
  subject_id?: number | null;
  type?: (typeof EXAM_TYPES)[number];
  mode?: (typeof EXAM_MODES)[number];
  target_total?: number | null;
  duration_minutes?: number | null;
  pass_percent?: number;
  redo_percent?: number | null;
  max_redos?: number;
  redo_required?: boolean;
  redo_new_questions?: boolean;
  shuffle?: boolean;
  show_answers?: (typeof SHOW_ANSWERS)[number];
}

export interface RuleInput {
  folder_ids: number[];
  category_id: number | null;
  subcategory_id: number | null;
  easy_count: number;
  medium_count: number;
  hard_count: number;
  very_hard_count: number;
  easy_mark: number;
  medium_mark: number;
  hard_mark: number;
  very_hard_mark: number;
}

const text = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};

const isMark = (n: number) => Number.isFinite(n) && n > 0 && n <= 1000 && Math.round(n * 100) === n * 100;

// Settings of a new exam (`creating`) or the fields being changed. A new exam
// takes the defaults of its type: an exam is shuffled, a homework keeps a
// fixed order and has no duration.
export function parseExamSettings(body: any, creating: boolean): ExamSettings {
  const errors: string[] = [];
  const out: ExamSettings = {};
  const has = (key: string) => body && body[key] !== undefined;

  if (creating || has("name")) {
    out.name = text(body?.name) ?? undefined;
    if (!out.name) errors.push("name is required");
    else if (out.name.length > 255) errors.push("name is too long");
  }
  if (has("description")) out.description = text(body.description);
  if (has("serial")) {
    out.serial = text(body.serial);
    if (out.serial && out.serial.length > 50) errors.push("Serial is too long");
  }
  if (has("subject_id")) {
    const n = body.subject_id === null || body.subject_id === "" ? null : Number(body.subject_id);
    if (n !== null && (!Number.isInteger(n) || n <= 0)) errors.push("Invalid subject_id");
    out.subject_id = n;
  }
  if (creating || has("type")) {
    if (!EXAM_TYPES.includes(body?.type)) errors.push("Pick exam or homework");
    else out.type = body.type;
  }
  if (creating || has("mode")) {
    if (!EXAM_MODES.includes(body?.mode)) errors.push("Pick manual or random");
    else out.mode = body.mode;
  }
  if (has("target_total")) {
    const n = body.target_total === null || body.target_total === "" ? null : Number(body.target_total);
    if (n !== null && !isMark(n)) errors.push("Invalid target total");
    out.target_total = n;
  }
  if (has("duration_minutes")) {
    const n = body.duration_minutes === null || body.duration_minutes === "" ? null : Number(body.duration_minutes);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 1440)) errors.push("Duration must be 1 to 1440 minutes");
    out.duration_minutes = n;
  }
  if (has("pass_percent")) {
    const n = Number(body.pass_percent);
    if (!Number.isInteger(n) || n < 0 || n > 100) errors.push("Pass mark must be 0 to 100");
    out.pass_percent = n;
  }
  if (has("redo_percent")) {
    const n = body.redo_percent === null || body.redo_percent === "" ? null : Number(body.redo_percent);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 100)) errors.push("Redo mark must be 1 to 100");
    out.redo_percent = n;
  }
  if (has("max_redos")) {
    const n = Number(body.max_redos);
    if (!Number.isInteger(n) || n < 0 || n > 50) errors.push("Redos must be 0 to 50");
    out.max_redos = n;
  }
  if (has("show_answers")) {
    if (!SHOW_ANSWERS.includes(body.show_answers)) errors.push("Invalid show answers choice");
    else out.show_answers = body.show_answers;
  }
  for (const key of ["redo_required", "redo_new_questions", "shuffle"] as const) {
    if (has(key)) out[key] = body[key] === true || body[key] === "true";
  }

  if (creating && out.type) {
    if (!has("shuffle")) out.shuffle = out.type === "exam";
    if (out.type === "homework" && !has("duration_minutes")) out.duration_minutes = null;
  }

  if (errors.length) throw new ValidationError(errors);
  return out;
}

export function parseRules(raw: unknown): RuleInput[] {
  if (!Array.isArray(raw)) throw new ValidationError(["rules must be a list"]);
  const errors: string[] = [];
  const rules = raw.map((r: any, i) => {
    const n = i + 1;
    const folderIds = Array.isArray(r?.folder_ids) ? [...new Set(r.folder_ids.map(Number))] as number[] : [];
    if (!folderIds.length || folderIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      errors.push(`Rule ${n}: pick at least one folder`);
    }
    const optional = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    const rule: RuleInput = {
      folder_ids: folderIds,
      category_id: optional(r?.category_id),
      subcategory_id: optional(r?.subcategory_id),
      easy_count: 0, medium_count: 0, hard_count: 0, very_hard_count: 0,
      easy_mark: 1, medium_mark: 1, hard_mark: 1, very_hard_mark: 1,
    };
    for (const d of DIFFICULTY_KEYS) {
      const count = Number(r?.[`${d}_count`] ?? 0);
      const mark = Number(r?.[`${d}_mark`] ?? 1);
      if (!Number.isInteger(count) || count < 0 || count > 500) errors.push(`Rule ${n}: invalid question count`);
      if (!isMark(mark)) errors.push(`Rule ${n}: invalid mark`);
      (rule as any)[`${d}_count`] = count;
      (rule as any)[`${d}_mark`] = mark;
    }
    if (DIFFICULTY_KEYS.every((d) => !(rule as any)[`${d}_count`])) errors.push(`Rule ${n}: set how many questions to draw`);
    return rule;
  });
  if (errors.length) throw new ValidationError([...new Set(errors)]);
  return rules;
}

export function parseMark(raw: unknown): number {
  const n = Number(raw);
  if (!isMark(n)) throw new ValidationError(["Invalid mark"]);
  return n;
}
