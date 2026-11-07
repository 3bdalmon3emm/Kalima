import type { PrismaClient } from "../../../libs/db/prisma";
import { prisma } from "../../../libs/db/prisma";

// The school year closes on 30/6. From 1/7 (Cairo time) every student moves to
// the next level: next by stage order, then by level order inside the stage.
// A student on the last level of the last stage becomes a graduate instead.

const TIME_ZONE = "Africa/Cairo";
const CHECK_EVERY_MS = 60 * 60 * 1000;

export type PromotionResult =
  | { ran: false }
  | { ran: true; year: number; promoted: number; graduated: number; notices: number };

// "YYYY-MM-DD" for the given instant, in Cairo.
function cairoDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

// The instant a Cairo calendar day starts ("YYYY-MM-DD").
function cairoDayStart(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset" })
    .formatToParts(utcMidnight)
    .find((p) => p.type === "timeZoneName")?.value; // e.g. "GMT+3"
  const hours = Number(offset?.replace("GMT", "") || 0);
  return new Date(utcMidnight.getTime() - hours * 60 * 60 * 1000);
}

// The promotion year that is due at `now`, if its date has come.
export function duePromotionYear(now: Date): number | null {
  const [year, month] = cairoDate(now).split("-").map(Number);
  return month >= 7 ? year : null;
}

class PromotionService {
  constructor(private db: PrismaClient = prisma) {}

  // Where each level moves. Only levels placed in a stage take part; the
  // target is the next active level, and none means the student graduates.
  private async buildPlan() {
    const levels = await this.db.levels.findMany({
      where: { stage_id: { not: null } },
      select: { id: true, active: true },
      orderBy: [
        { stages: { sort_order: "asc" } },
        { sort_order: { sort: "asc", nulls: "last" } },
        { title: "asc" },
      ],
    });

    const moves: { from: number; to: number }[] = [];
    const graduateFrom: number[] = [];
    levels.forEach((level, i) => {
      const next = levels.slice(i + 1).find((l) => l.active !== false);
      if (next) moves.push({ from: level.id, to: next.id });
      else graduateFrom.push(level.id);
    });
    return { moves, graduateFrom };
  }

  // Runs the promotion of `year` once. A second call for the same year does
  // nothing, so several servers or restarts can call it safely.
  async runYearlyPromotion(year: number): Promise<PromotionResult> {
    const { moves, graduateFrom } = await this.buildPlan();

    return this.db.$transaction(async (tx) => {
      const claimed = await tx.level_promotions.createMany({
        data: [{ year }],
        skipDuplicates: true,
      });
      if (claimed.count === 0) return { ran: false } as const;

      // Last year's notices that were never opened are no longer relevant.
      await tx.students.updateMany({
        where: { promotion_notice: true },
        data: { promotion_notice: false },
      });

      // June sign-ups may have picked the level they were about to enter.
      const { count: notices } = await tx.students.updateMany({
        where: {
          graduated: false,
          level_id: { not: null },
          users: {
            created_at: {
              gte: cairoDayStart(`${year}-06-01`),
              lt: cairoDayStart(`${year}-07-01`),
            },
          },
        },
        data: { promotion_notice: true },
      });

      // Graduate first, so nobody promoted into the last level graduates the
      // same day.
      const { count: graduated } = await tx.students.updateMany({
        where: { graduated: false, level_id: { in: graduateFrom } },
        data: { graduated: true },
      });

      // Every target comes later in the order than its source, so moving the
      // latest levels first means no student moves twice.
      let promoted = 0;
      for (const move of [...moves].reverse()) {
        const { count } = await tx.students.updateMany({
          where: { graduated: false, level_id: move.from },
          data: { level_id: move.to },
        });
        promoted += count;
      }

      await tx.level_promotions.update({
        where: { year },
        data: { promoted, graduated },
      });

      return { ran: true, year, promoted, graduated, notices } as const;
    });
  }

  async runIfDue(now: Date = new Date()): Promise<PromotionResult> {
    const year = duePromotionYear(now);
    if (year === null) return { ran: false };
    return this.runYearlyPromotion(year);
  }

  // Checks on start and then every hour, so a server that was down on 1/7
  // still promotes once it is back.
  startScheduler(): void {
    const check = () => {
      this.runIfDue()
        .then((result) => {
          if (result.ran) {
            console.log(
              `[promotion] ${result.year}: promoted ${result.promoted}, graduated ${result.graduated}, June notices ${result.notices}`,
            );
          }
        })
        .catch((err) => console.error("[promotion] failed:", err));
    };
    check();
    setInterval(check, CHECK_EVERY_MS).unref();
  }
}

export const promotionService = new PromotionService();
