export const ADMIN_ANALYTICS_ALLOWED_ROLES = ['Admin'];

export function canAccessAdminAnalytics(roles = []) {
  return ADMIN_ANALYTICS_ALLOWED_ROLES.some((role) => roles.includes(role));
}

// The money cards over the orders page stay with the SubAdmin too.
export const ORDER_STATS_ALLOWED_ROLES = ['Admin', 'SubAdmin'];
export function canSeeOrderStats(roles = []) {
    return ORDER_STATS_ALLOWED_ROLES.some((role) => roles.includes(role));
}
