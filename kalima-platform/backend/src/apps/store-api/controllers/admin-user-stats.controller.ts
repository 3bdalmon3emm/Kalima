import { dayRange } from "../utils/dayRange";
import { Request, Response, NextFunction } from "express";
import { prisma } from "../../../libs/db/prisma";
import { role_enum } from "../generated/prisma/client";

export const adminUserStatsController = {
  /**
   * GET /admin/users/stats/created-accounts
   * Replicates legacy Created Accounts Statistics
   * Calculates how many accounts of each role were created by each user.
   */
  async getCreatedAccountsStats(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      // Accounts each staff member created, by their real roles (user_roles),
      // live accounts only, optionally between ?from and ?to (days, inclusive).
      const range = dayRange(req.query as Record<string, unknown>);
      const created = await prisma.users.findMany({
        where: {
          created_by: { not: null },
          OR: [{ is_deleted: false }, { is_deleted: null }],
          ...(range && { created_at: range }),
        },
        select: { id: true, created_by: true, role: true, user_roles: { select: { role: true } } },
      });
      // One row per creator and role; an account counts once in the total.
      const stats: Array<{ created_by: number; role: string; _count: { id: number } }> = [];
      const totals = new Map<number, number>();
      const counts = new Map<string, number>();
      for (const u of created) {
        const roles = new Set<string>(u.user_roles.map((r) => r.role));
        if (!roles.size && u.role) roles.add(u.role);
        for (const r of roles) counts.set(`${u.created_by}:${r}`, (counts.get(`${u.created_by}:${r}`) || 0) + 1);
        totals.set(u.created_by as number, (totals.get(u.created_by as number) || 0) + 1);
      }
      for (const [key, n] of counts) {
        const [creator, role] = key.split(":");
        stats.push({ created_by: Number(creator), role, _count: { id: n } });
      }

      // Fetch the details of the creator users
      const creatorIds = Array.from(new Set(stats.map(s => s.created_by).filter(id => id !== null))) as number[];
      
      const creators = await prisma.users.findMany({
        where: { id: { in: creatorIds } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      const creatorMap = new Map();
      creators.forEach(c => creatorMap.set(c.id, c));

      // Aggregate data per creator
      const result: any[] = [];
      const statsByCreator = new Map<number, any>();

      stats.forEach((stat) => {
        const creatorId = stat.created_by as number;
        if (!statsByCreator.has(creatorId)) {
          const creatorInfo = creatorMap.get(creatorId);
          statsByCreator.set(creatorId, {
            user: creatorInfo ? {
              id: creatorInfo.id,
              name: creatorInfo.name,
              email: creatorInfo.email,
              role: creatorInfo.role,
            } : { id: creatorId, name: 'Unknown' },
            byRole: {
              Admin: 0,
              SubAdmin: 0,
              Moderator: 0,
              Teacher: 0,
              Student: 0,
              Parent: 0,
              Lecturer: 0,
              Assistant: 0,
            },
            totalAccounts: 0,
          });
        }

        const creatorData = statsByCreator.get(creatorId);
        creatorData.byRole[stat.role] = stat._count.id;
        creatorData.totalAccounts = totals.get(creatorId) || 0;
      });

      // Filter out roles with 0 value or format as requested
      for (const [_, data] of statsByCreator.entries()) {
        result.push(data);
      }

      // Sort by absolute highest totals
      result.sort((a, b) => b.totalAccounts - a.totalAccounts);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  }
};
