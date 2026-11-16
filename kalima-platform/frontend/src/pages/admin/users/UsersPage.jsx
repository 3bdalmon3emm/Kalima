import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, UserCog, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { useAdminUsers } from '@/hooks/admin/useAdminUsers';
import useAuth from '@/hooks/auth/useAuth';
import useRole from '@/hooks/useRole';
import UserStatsCards from '@/components/admin/users/UserStatsCards';
import UserFilters from '@/components/admin/users/UserFilters';
import UsersTable from '@/components/admin/users/UsersTable';
import CreateUserDialog from '@/components/admin/users/CreateUserDialog';
import SendNotificationModal from '@/components/admin/notifications/SendNotificationModal';
import { startImpersonation } from '@/services/impersonationService';

export default function UsersPage() {
    const { t } = useTranslation('userManagement');
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const { isAdmin } = useRole();
    // Users picked to receive one notification together.
    const [selected, setSelected] = useState([]);
    const [notifyOpen, setNotifyOpen] = useState(false);

    const {
        users,
        loading,
        pagination,
        actionLoading,
        fetchUsers,
        approveUser,
        rejectUser,
        deleteUser,
        resetUserPassword,
    } = useAdminUsers();

    const [page, setPage]       = useState(1);
    const [search, setSearch]   = useState('');
    const [role, setRole]       = useState('');
    const [flag, setFlag] = useState('');
    const [impersonatingUserId, setImpersonatingUserId] = useState(null);

    // ── Fetch whenever filters / page change ──────────────────────────────
    const loadUsers = useCallback(() => {
        fetchUsers({ page, search, role, flag });
    }, [fetchUsers, page, search, role, flag]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    // ── Filter changes reset to page 1 ────────────────────────────────────
    const handleFiltersChange = useCallback(({ search: s, role: r, flag: f = '' }) => {
        setFlag(f);
        setSearch(s);
        setRole(r);
        setPage(1);
    }, []);

    const handlePageChange = (newPage) => {
        setPage(newPage);
    };

    // ── Actions (refresh list after) ──────────────────────────────────────
    const handleApprove = async (userId) => {
        await approveUser(userId);
        loadUsers();
    };

    const handleReject = async (userId) => {
        await rejectUser(userId);
        loadUsers();
    };

    const handleDelete = async (userId) => {
        await deleteUser(userId);
        loadUsers();
    };

    const handleResetPassword = async (userId, password) => {
        return await resetUserPassword(userId, password);
    };

    const handleImpersonate = async (userId) => {
        setImpersonatingUserId(userId);
        try {
            const result = await startImpersonation(userId);
            toast.success(t('messages.impersonationStarted'));
            window.dispatchEvent(new Event('auth-session-changed'));
            navigate(result.redirectTo, { replace: true });
            window.location.reload();
        } finally {
            setImpersonatingUserId(null);
        }
    };

    return (
        <div className="space-y-6" data-testid="admin-users-page">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Users className="h-8 w-8 text-primary" />
                        {t('title')}
                    </h1>
                    <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
                </div>

                <div className="flex items-center gap-3">
                    {pagination.total > 0 && (
                        <p className="text-sm text-muted-foreground hidden sm:block">
                            {t('totalUsers', { count: pagination.total })}
                        </p>
                    )}
                    {isAdmin && (
                        <Button variant="outline" asChild>
                            <Link to="/admin/impersonation-log"><UserCog className="h-4 w-4 me-2" />{t('impersonationLog.title')}</Link>
                        </Button>
                    )}
                    {selected.length > 0 && (
                        <Button onClick={() => setNotifyOpen(true)}>
                            <Bell className="h-4 w-4 me-2" />{t('notifySelected', { count: selected.length, defaultValue: 'Notify {{count}} selected' })}
                        </Button>
                    )}
                    <CreateUserDialog onSuccess={loadUsers} />
                </div>
            </div>

            {/* Stats */}
            <UserStatsCards />

            {/* Filters */}
            <UserFilters
                initialSearch={search}
                initialRole={role}
                onFiltersChange={handleFiltersChange}
            />

            {/* Table */}
            <UsersTable
                users={users}
                loading={loading}
                actionLoading={actionLoading}
                pagination={pagination}
                onPageChange={handlePageChange}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={handleDelete}
                onImpersonate={handleImpersonate}
                onResetPassword={handleResetPassword}
                currentUserId={currentUser?.id}
                impersonatingUserId={impersonatingUserId}
                selectedIds={selected}
                onToggleSelect={(id, on) => setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)))}
                onToggleAll={(on) => {
                    const ids = users.filter((u) => !u.is_deleted).map((u) => u.id);
                    setSelected((s) => (on ? [...new Set([...s, ...ids])] : s.filter((x) => !ids.includes(x))));
                }}
            />
            <SendNotificationModal open={notifyOpen} onOpenChange={setNotifyOpen} userIds={selected} onSent={() => setSelected([])} />
        </div>
    );
}
