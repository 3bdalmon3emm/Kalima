import type { PrismaClient } from "../../../libs/db/prisma";
import { prisma } from "../../../libs/db/prisma";

// The impersonation log for the Admin: who entered whose account, when, and
// when they left (no end when the session simply expired).
class ImpersonationLogService {
  constructor(private db: PrismaClient = prisma) {}

  async list(page = 1, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const [rows, total] = await Promise.all([
      this.db.impersonation_logs.findMany({ orderBy: [{ started_at: "desc" }, { id: "desc" }], skip, take }),
      this.db.impersonation_logs.count(),
    ]);
    const ids = [...new Set(rows.flatMap((r) => [r.actor_user_id, r.target_user_id]))];
    const users = await this.db.users.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, profile_pic_url: true, user_roles: { select: { role: true } } },
    });
    const byId = new Map(users.map((u) => [u.id, { id: u.id, name: u.name, email: u.email, profile_pic_url: u.profile_pic_url, roles: u.user_roles.map((r) => r.role) }]));
    return {
      logs: rows.map((r) => ({
        id: r.id,
        started_at: r.started_at,
        ended_at: r.ended_at,
        actor: byId.get(r.actor_user_id) ?? { id: r.actor_user_id },
        target: byId.get(r.target_user_id) ?? { id: r.target_user_id },
      })),
      pagination: { page: Math.max(page, 1), limit: take, total, totalPages: Math.max(Math.ceil(total / take), 1) },
    };
  }
}

export const impersonationLogService = new ImpersonationLogService();
