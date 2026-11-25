import type { Request } from "express";
import type { PrismaClient } from "../../../libs/db/prisma";
import { prisma } from "../../../libs/db/prisma";
import { BadRequestError } from "../../../libs/errors";

// Who did what to an account or an order, and why: flag changes, returns,
// items removed from orders, deleted orders, cancelled or rejected e-booklet
// orders. Staff read it; no customer-facing endpoint does.

export type StaffEntity = "user" | "purchase" | "e_booklet_purchase";
export type StaffActor = { actorId: number | null; asUserId: number | null };

// The real person behind a request: when staff view as another account the
// token carries that account, and the person is the impersonation's actor.
export function staffActor(req: Request): StaffActor {
  const user = (req as any).user || {};
  const imp = user.impersonation;
  if (imp?.actorUserId) return { actorId: Number(imp.actorUserId), asUserId: Number(user.userId) || null };
  return { actorId: Number(user.userId) || null, asUserId: null };
}

// A reason the person typed: required, trimmed, at most 1000 characters.
export function requireReason(value: unknown): string {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < 3) throw new BadRequestError("Write the reason");
  return reason.slice(0, 1000);
}

class StaffActionLogService {
  constructor(private db: PrismaClient = prisma) {}

  record(entry: { entityType: StaffEntity; entityId: number; action: string; reason?: string | null; actor: StaffActor; meta?: Record<string, unknown> }, db: any = this.db) {
    return db.staff_action_logs.create({
      data: {
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        reason: entry.reason ?? null,
        actor_user_id: entry.actor.actorId,
        as_user_id: entry.actor.asUserId,
        meta: (entry.meta ?? undefined) as any,
      },
    });
  }

  // An entity's history, newest first, with the names of the people.
  async list(entityType: string, entityId: number, actions?: string[]) {
    const rows = await this.db.staff_action_logs.findMany({
      where: { entity_type: entityType, entity_id: entityId, ...(actions?.length && { action: { in: actions } }) },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 200,
    });
    const ids = [...new Set(rows.flatMap((r) => [r.actor_user_id, r.as_user_id]).filter((x): x is number => !!x))];
    const users = ids.length
      ? await this.db.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, user_roles: { select: { role: true } } } })
      : [];
    const byId = new Map(users.map((u) => [u.id, { id: u.id, name: u.name, roles: [...new Set(u.user_roles.map((r) => r.role))] }]));
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      reason: r.reason,
      meta: r.meta,
      created_at: r.created_at,
      actor: r.actor_user_id ? byId.get(r.actor_user_id) ?? { id: r.actor_user_id, name: null } : null,
      as_user: r.as_user_id ? byId.get(r.as_user_id) ?? { id: r.as_user_id, name: null } : null,
    }));
  }
}

export const staffActionLogService = new StaffActionLogService();
