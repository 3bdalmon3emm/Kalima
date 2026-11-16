// Who may act on whom among staff accounts, the same rule as the backend's
// libs/auth/roleRank: Admin > SubAdmin > Moderator > everyone else, and an
// account with several roles counts as its highest. The backend has the final
// say; this only decides which buttons show.

export const STAFF_RANK = { Admin: 3, SubAdmin: 2, Moderator: 1 };
export const STAFF_ROLES = Object.keys(STAFF_RANK);

const names = (roles) => (roles || []).map((r) => (typeof r === 'string' ? r : r?.role)).filter(Boolean);

export const rankOf = (roles) => names(roles).reduce((best, r) => Math.max(best, STAFF_RANK[r] || 0), 0);

export const isStaff = (roles) => rankOf(roles) > 0;

// Edit, delete, reject, change roles or password, impersonate.
export function outranks(actorRoles, targetRoles) {
    const actor = rankOf(actorRoles);
    return actor > 0 && actor > rankOf(targetRoles);
}

// Give or take this role.
export function canGrant(actorRoles, role) {
    const actor = rankOf(actorRoles);
    return actor > 0 && (STAFF_RANK[role] || 0) < actor;
}
