import axiosInstance from '@/api/axios';

const ORIGINAL_SESSION_KEY = 'impersonationOriginalSession';
const IMPERSONATION_SESSION_KEY = 'impersonationSession';

export function getImpersonationSession() {
    try {
        const stored = localStorage.getItem(IMPERSONATION_SESSION_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

export function isImpersonating() {
    return !!getImpersonationSession();
}

function getCurrentSessionSnapshot() {
    return {
        user: localStorage.getItem('user'),
        accessToken: localStorage.getItem('accessToken'),
        refreshToken: localStorage.getItem('refreshToken'),
        portalAccess: localStorage.getItem('portalAccess'),
    };
}

function restoreStorageValue(key, value) {
    if (value === null || value === undefined) {
        localStorage.removeItem(key);
        return;
    }
    localStorage.setItem(key, value);
}

export function getDefaultRouteForPortalAccess(portalAccess) {
    const storeRoles = portalAccess?.store?.roles || [];
    const academyRoles = portalAccess?.academy?.roles || [];
    const roles = [...storeRoles, ...academyRoles];

    if (roles.includes('Admin') || roles.includes('SubAdmin') || roles.includes('Moderator')) return '/admin/dashboard';
    if (roles.includes('Teacher')) return '/teacher/profile';
    if (roles.includes('Student')) return '/student/profile';
    if (roles.includes('Parent')) return '/parent/profile';
    return '/market';
}

export async function startImpersonation(targetUserId) {
    if (!localStorage.getItem(ORIGINAL_SESSION_KEY)) {
        localStorage.setItem(ORIGINAL_SESSION_KEY, JSON.stringify(getCurrentSessionSnapshot()));
    }

    const response = await axiosInstance.post('/auth/admin/impersonation/start', { targetUserId });
    const data = response.data?.data;

    if (!data?.tokens?.accessToken || !data?.tokens?.refreshToken || !data?.user) {
        throw new Error('Invalid impersonation response');
    }

    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('accessToken', data.tokens.accessToken);
    localStorage.setItem('refreshToken', data.tokens.refreshToken);
    localStorage.setItem('portalAccess', JSON.stringify(data.portalAccess || {}));
    localStorage.setItem(IMPERSONATION_SESSION_KEY, JSON.stringify(data.impersonation || {}));

    return {
        ...data,
        redirectTo: getDefaultRouteForPortalAccess(data.portalAccess),
    };
}

export async function stopImpersonation() {
    try {
        await axiosInstance.post('/auth/admin/impersonation/stop');
    } catch (error) {
        // Restore the original local session even if the lightweight stop audit/check fails.
        // The backend still protects impersonation actions by the active token.
        console.warn('Failed to notify backend about stopping impersonation', error);
    }

    const originalSession = JSON.parse(localStorage.getItem(ORIGINAL_SESSION_KEY) || '{}');

    restoreStorageValue('user', originalSession.user);
    restoreStorageValue('accessToken', originalSession.accessToken);
    restoreStorageValue('refreshToken', originalSession.refreshToken);
    restoreStorageValue('portalAccess', originalSession.portalAccess);

    localStorage.removeItem(ORIGINAL_SESSION_KEY);
    localStorage.removeItem(IMPERSONATION_SESSION_KEY);

    return '/admin/dashboard';
}
