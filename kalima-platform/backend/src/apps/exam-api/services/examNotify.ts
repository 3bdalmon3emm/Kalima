import type { Server as SocketIOServer } from "socket.io";
import { prisma } from "../../../libs/db/prisma";
import { NOTIFICATION_CATEGORY, notification_key_enum, notificationService } from "../../store-api/services/notification.service";

// In-platform notifications of exams, sent from requests and from the
// background (the auto-submit sweeper, re-grades). Every send is fire and
// forget: a failed notification never fails the grading behind it.

let io: SocketIOServer | null = null;
export function setExamIo(server: SocketIOServer) {
  io = server;
}

const log = (err: unknown) => console.error("[exams] notification failed", err);

async function attemptInfo(attemptId: number) {
  return prisma.ex_attempts.findUnique({
    where: { id: attemptId },
    select: { id: true, exam_id: true, student_user_id: true, link: { select: { code: true, teacher_user_id: true } } },
  });
}

async function parentsOf(studentId: number) {
  const rows = await prisma.parent_children.findMany({ where: { student_user_id: studentId }, select: { parent_user_id: true } });
  return rows.map((r) => r.parent_user_id);
}

async function teamOf(teacherId: number) {
  const rows = await prisma.teacher_assistants.findMany({ where: { teacher_user_id: teacherId }, select: { assistant_user_id: true } });
  return [teacherId, ...rows.map((r) => r.assistant_user_id)];
}

// A user gets one notification per kind and entity (a unique index), so
// news that can happen again (a score raised twice, an essay edited twice)
// is sent without an entity; the link still opens the right page.
const send = (users: number[], key: notification_key_enum, attemptId: number, targetLink?: string, repeatable = false) => {
  if (!users.length) return;
  notificationService
    .sendToUsers(io, users, NOTIFICATION_CATEGORY.CUSTOM, key, {
      ...(!repeatable && { entityType: "exam_attempt", entityId: attemptId }),
      ...(targetLink && { targetLink }),
    })
    .catch(log);
};

export const examNotify = {
  // The result shows: to the student (unless they just saw it on submit) and
  // to their parents.
  async resultReady(attemptId: number, toStudent: boolean) {
    try {
      const a = await attemptInfo(attemptId);
      if (!a) return;
      if (toStudent) send([a.student_user_id], notification_key_enum.EXAM_RESULT_READY, a.id, `/e/${a.link.code}/result/${a.id}`);
      send(await parentsOf(a.student_user_id), notification_key_enum.EXAM_RESULT_READY, a.id);
    } catch (err) { log(err); }
  },

  // A re-grade raised the score (a lower one changes quietly).
  async scoreRaised(attemptId: number) {
    try {
      const a = await attemptInfo(attemptId);
      if (a) send([a.student_user_id], notification_key_enum.EXAM_SCORE_RAISED, a.id, `/e/${a.link.code}/result/${a.id}`, true);
    } catch (err) { log(err); }
  },

  // A submitted attempt waits for essay marks: the teacher and assistants.
  async essayToGrade(attemptId: number) {
    try {
      const a = await attemptInfo(attemptId);
      if (a?.link.teacher_user_id) send(await teamOf(a.link.teacher_user_id), notification_key_enum.EXAM_ESSAY_TO_GRADE, a.id, `/teacher/exams/attempts/${a.id}`);
    } catch (err) { log(err); }
  },

  // An essay question was edited after it was marked: each teacher with a
  // marked answer to it hears once per exam, and may change the marks.
  async essayEdited(questionId: number) {
    try {
      const rows = await prisma.ex_attempt_answers.findMany({
        where: { question_id: questionId, graded_by: { not: null } },
        select: { attempt: { select: { exam_id: true, link: { select: { teacher_user_id: true } } } } },
      });
      const seen = new Set<string>();
      for (const r of rows) {
        const teacher = r.attempt.link.teacher_user_id;
        const key = `${teacher}:${r.attempt.exam_id}`;
        if (!teacher || seen.has(key)) continue;
        seen.add(key);
        notificationService
          .sendToUser(io, teacher, NOTIFICATION_CATEGORY.CUSTOM, notification_key_enum.EXAM_ESSAY_EDITED,
            { targetLink: `/teacher/exams/${r.attempt.exam_id}` })
          .catch(log);
      }
    } catch (err) { log(err); }
  },
};
