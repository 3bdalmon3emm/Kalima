// Who may act on whom among staff accounts. Admin > SubAdmin > Moderator >
// everyone else; an account with several roles counts as its highest. Staff
// act only on accounts strictly below their own rank, and grant only roles
// strictly below it, so nobody can raise themselves or touch an equal or a
// superior.

export const STAFF_RANK: Record<string, number> = {
  Admin: 3,
  SubAdmin: 2,
  Moderator: 1,
};

type RoleLike = string | { role: string };

const names = (roles: RoleLike[] | undefined | null) =>
  (roles ?? []).map((r) => (typeof r === "string" ? r : r?.role)).filter(Boolean) as string[];

export function rankOf(roles: RoleLike[] | undefined | null): number {
  return names(roles).reduce((best, r) => Math.max(best, STAFF_RANK[r] ?? 0), 0);
}

export const isStaff = (roles: RoleLike[] | undefined | null) => rankOf(roles) > 0;

// The actor may act on the target (edit, delete, reject, change roles or
// password, impersonate).
export function outranks(actorRoles: RoleLike[] | undefined | null, targetRoles: RoleLike[] | undefined | null): boolean {
  const actor = rankOf(actorRoles);
  return actor > 0 && actor > rankOf(targetRoles);
}

// The actor may give or take this role.
export function canGrant(actorRoles: RoleLike[] | undefined | null, role: string): boolean {
  const actor = rankOf(actorRoles);
  return actor > 0 && (STAFF_RANK[role] ?? 0) < actor;
}
