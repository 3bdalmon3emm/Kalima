import { paging } from "../services/paging";

// ?year=&subject_id=&type=&page= for a student's exams overview.
export const overviewArgs = (q: any) => {
  const year = q.year === undefined ? undefined : Number(q.year);
  const subject = q.subject_id === undefined || q.subject_id === "" ? undefined : Number(q.subject_id);
  return [
    Number.isInteger(year) ? year : undefined,
    { subject: Number.isInteger(subject) ? subject : undefined, type: typeof q.type === "string" ? q.type : undefined },
    paging(q, 10),
  ] as const;
};
