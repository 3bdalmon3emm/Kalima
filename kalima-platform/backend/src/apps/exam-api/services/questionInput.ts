import { ValidationError } from "../../../libs/errors";

// Checks and cleans the body of a question save. Every rule that depends on
// the question type lives here, so the service only stores what passed.

export const QUESTION_TYPES = ["mcq_single", "mcq_multi", "true_false", "essay", "matching", "passage"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard", "very_hard"] as const;
export const EXPLANATION_MODES = ["none", "combined_text", "per_option", "image"] as const;
export const FONTS = ["default", "amiri", "scheherazade", "naskh", "times"] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface OptionInput {
  id: number | null;
  text: string | null;
  image_id: number | null;
  label: string | null;
  is_correct: boolean;
  explanation_text: string | null;
}

export interface MatchingItemInput {
  id: number | null;
  // Client key used to pair items that do not have an id yet.
  key: string;
  side: "left" | "right";
  text: string | null;
  image_id: number | null;
  audio_id: number | null;
  match_key: string | null;
}

export interface QuestionInput {
  type: QuestionType;
  difficulty: (typeof DIFFICULTIES)[number] | null;
  category_id: number | null;
  subcategory_id: number | null;
  reference_no: string | null;
  stem_text: string | null;
  stem_image_id: number | null;
  stem_audio_id: number | null;
  explanation_mode: (typeof EXPLANATION_MODES)[number];
  explanation_text: string | null;
  explanation_image_id: number | null;
  model_answer_text: string | null;
  model_answer_image_id: number | null;
  font: (typeof FONTS)[number];
  options: OptionInput[];
  matching_items: MatchingItemInput[];
}

const text = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};
const id = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isInteger(n) && n > 0 ? n : null;
};

export function parseQuestionInput(body: any): QuestionInput {
  const errors: string[] = [];
  const type = body?.type;
  if (!QUESTION_TYPES.includes(type)) {
    throw new ValidationError(["Invalid question type"]);
  }
  const isPassage = type === "passage";

  const input: QuestionInput = {
    type,
    difficulty: isPassage ? null : body.difficulty ?? null,
    category_id: isPassage ? null : id(body.category_id),
    subcategory_id: isPassage ? null : id(body.subcategory_id),
    reference_no: text(body.reference_no),
    stem_text: text(body.stem_text),
    stem_image_id: id(body.stem_image_id),
    stem_audio_id: id(body.stem_audio_id),
    explanation_mode: isPassage ? "none" : body.explanation_mode ?? "none",
    explanation_text: text(body.explanation_text),
    explanation_image_id: id(body.explanation_image_id),
    model_answer_text: type === "essay" ? text(body.model_answer_text) : null,
    model_answer_image_id: type === "essay" ? id(body.model_answer_image_id) : null,
    font: body.font ?? "default",
    options: [],
    matching_items: [],
  };

  if (input.reference_no && input.reference_no.length > 50) errors.push("Reference number is too long");
  if (!input.stem_text && !input.stem_image_id && !input.stem_audio_id) {
    errors.push(isPassage ? "The passage needs text, an image or audio" : "The question needs text, an image or audio");
  }
  if (!isPassage && !DIFFICULTIES.includes(input.difficulty as any)) errors.push("Pick the difficulty");
  if (!EXPLANATION_MODES.includes(input.explanation_mode)) errors.push("Invalid explanation mode");
  if (!FONTS.includes(input.font)) errors.push("Invalid font");

  // Options: MCQ and true/false.
  if (type === "mcq_single" || type === "mcq_multi" || type === "true_false") {
    const raw = Array.isArray(body.options) ? body.options : [];
    input.options = raw.map((o: any) => ({
      id: id(o?.id),
      text: text(o?.text),
      image_id: id(o?.image_id),
      label: text(o?.label),
      is_correct: o?.is_correct === true,
      explanation_text: text(o?.explanation_text),
    }));
    const correct = input.options.filter((o) => o.is_correct).length;
    if (type === "true_false") {
      if (input.options.length !== 2) errors.push("A true/false question has exactly two options");
      if (input.options.some((o) => !o.text)) errors.push("Write the text of both options");
      if (correct !== 1) errors.push("Mark the correct answer");
    } else {
      if (input.options.length < 2) errors.push("Add at least two options");
      if (input.options.some((o) => !o.text && !o.image_id && !o.label)) {
        errors.push("Every option needs text, an image or a label");
      }
      if (input.options.some((o) => o.label && o.label.length > 20)) errors.push("Option label is too long");
      if (type === "mcq_single" && correct !== 1) errors.push("Mark exactly one correct option");
      if (type === "mcq_multi" && correct < 2) errors.push("Mark at least two correct options");
    }
  }

  // Matching: pairs left -> right, unpaired items are decoys.
  if (type === "matching") {
    const raw = Array.isArray(body.matching_items) ? body.matching_items : [];
    input.matching_items = raw.map((m: any, i: number) => ({
      id: id(m?.id),
      key: String(m?.key ?? m?.id ?? `item-${i}`),
      side: m?.side === "right" ? "right" : "left",
      text: text(m?.text),
      image_id: id(m?.image_id),
      audio_id: id(m?.audio_id),
      match_key: m?.match_key === null || m?.match_key === undefined || m?.match_key === "" ? null : String(m.match_key),
    }));
    const keys = new Set(input.matching_items.map((m) => m.key));
    if (keys.size !== input.matching_items.length) errors.push("Matching items need unique keys");
    if (input.matching_items.some((m) => !m.text && !m.image_id && !m.audio_id)) {
      errors.push("Every matching item needs text, an image or audio");
    }
    const byKey = new Map(input.matching_items.map((m) => [m.key, m]));
    const used = new Set<string>();
    for (const m of input.matching_items) {
      if (!m.match_key) continue;
      const partner = byKey.get(m.match_key);
      if (m.side !== "left" || !partner || partner.side !== "right") {
        errors.push("Pair each left item with a right item");
        break;
      }
      if (used.has(partner.key)) {
        errors.push("A right item can be paired only once");
        break;
      }
      used.add(partner.key);
    }
    if (used.size === 0) errors.push("Add at least one matching pair");
  }

  // Essay: a model answer is required.
  if (type === "essay" && !input.model_answer_text && !input.model_answer_image_id) {
    errors.push("Add the model answer as text or an image");
  }

  // Explanation.
  if (input.explanation_mode === "combined_text" && !input.explanation_text) errors.push("Write the explanation");
  if (input.explanation_mode === "image" && !input.explanation_image_id) errors.push("Upload the explanation image");
  if (input.explanation_mode === "per_option") {
    if (!input.options.length) errors.push("Per-option explanation is only for questions with options");
    else if (input.options.some((o) => !o.explanation_text)) errors.push("Write an explanation for every option");
  }
  if (input.explanation_mode !== "combined_text") input.explanation_text = null;
  if (input.explanation_mode !== "image") input.explanation_image_id = null;
  if (input.explanation_mode !== "per_option") input.options.forEach((o) => (o.explanation_text = null));

  if (errors.length) throw new ValidationError(errors);
  return input;
}
