import { outranks } from '@/lib/roleRank';

// Admin, SubAdmin and Moderator impersonate only accounts below their own
// rank; nobody else impersonates.
export function canImpersonateUser({ actorRoles = [], targetRoles = [] }) {
    return outranks(actorRoles, targetRoles);
}
