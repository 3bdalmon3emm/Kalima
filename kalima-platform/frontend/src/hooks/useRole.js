export function useRole() {
    const getPortalAccess = () => {
        try {
            const stored = localStorage.getItem('portalAccess');
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    };

    /**
     * Reads the `confirmed` field from the stored user object.
     * Admins and SubAdmins are always treated as confirmed so they're never blocked.
     */
    const getConfirmed = (roles) => {
        try {
            const stored = localStorage.getItem('user');
            if (!stored) return true; // unauthenticated — no restriction
            const user = JSON.parse(stored);
            // Admins / SubAdmins bypass confirmation requirements
            if (roles?.includes('Admin') || roles?.includes('SubAdmin') || roles?.includes('Moderator')) return true;
            // confirmed defaults to true if the field is absent (older sessions)
            return user.confirmed !== false;
        } catch {
            return true;
        }
    };

    const portalAccess = getPortalAccess();

    const storeAccess = portalAccess?.store || { hasAccess: false, roles: [] };
    const storeRoles = storeAccess.roles || [];

    const academyAccess = portalAccess?.academy || { hasAccess: false, roles: [] };
    const academyRoles = academyAccess.roles || [];

    const isAdmin = storeRoles.includes("Admin");
    const isSubAdmin = storeRoles.includes("SubAdmin");
    const isModerator = storeRoles.includes("Moderator");
    // Any staff role opens the admin dashboard.
    const isStaff = isAdmin || isSubAdmin || isModerator;
    const isTeacher = storeRoles.includes("Teacher");
    const isAssistant = storeRoles.includes("Assistant");
    const isStudent = storeRoles.includes("Student") || academyRoles.includes("Student");
    const isParent = storeRoles.includes("Parent") || academyRoles.includes("Parent");
    const hasAdminAccess = isStaff;
    const hasStoreAccess = portalAccess ? storeAccess.hasAccess : true;
    const hasAcademyAccess = portalAccess ? academyAccess.hasAccess : true;

    /**
     * Whether the current user's account has been approved by an admin.
     * Admins / SubAdmins are always considered confirmed.
     * Defaults to `true` for unauthenticated visitors (no restriction).
     */
    const isConfirmed = getConfirmed(storeRoles);

    return {
        isAdmin,
        isSubAdmin,
        isModerator,
        isStaff,
        isTeacher,
        isAssistant,
        isStudent,
        isParent,
        hasAdminAccess,
        hasStoreAccess,
        hasAcademyAccess,
        isConfirmed,
        portalAccess,
        storeRoles,
        academyRoles,
    };
}

export default useRole;
