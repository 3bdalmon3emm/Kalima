export const ADMIN_ANALYTICS_ALLOWED_ROLES = ['Admin', 'SubAdmin', 'Moderator'];

export function canAccessAdminAnalytics(roles = []) {
  return ADMIN_ANALYTICS_ALLOWED_ROLES.some((role) => roles.includes(role));
}
