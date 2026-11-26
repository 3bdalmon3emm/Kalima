import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { Eye, CheckCircle2, XCircle, Trash2, ChevronLeft, ChevronRight, HeartHandshake, UserCog, KeyRound, ImageDown } from 'lucide-react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { canImpersonateUser } from '@/utils/impersonationPermissions';
import { outranks, STAFF_RANK } from '@/lib/roleRank';
import AccountLevelBadge from '@/components/admin/AccountLevelBadge';
import { Checkbox } from '@/components/ui/checkbox';
import { largestPhotoUrl } from '@/lib/profilePhoto';
import { useRole } from '@/hooks/useRole';
import AppreciationQrButton from './AppreciationQrButton';

export default function UsersTable({
    users = [],
    loading,
    actionLoading,
    pagination,
    onPageChange,
    onApprove,
    onReject,
    onDelete,
    onImpersonate,
    onResetPassword,
    currentUserId,
    impersonatingUserId,
    selectedIds,
    onToggleSelect,
    onToggleAll,
}) {
    const { t, i18n } = useTranslation('userManagement');
    const isRtl = i18n.dir() === 'rtl';

    const { storeRoles } = useRole();

    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [selectedUserForPassword, setSelectedUserForPassword] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const handleOpenPasswordDialog = (user) => {
        setSelectedUserForPassword(user);
        setNewPassword('');
        setNewPasswordConfirmation('');
        setPasswordError('');
        setPasswordDialogOpen(true);
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 8) {
            setPasswordError(t('details.passwordMinLength', 'Password must be at least 8 characters.'));
            return;
        }
        if (newPassword !== newPasswordConfirmation) {
            setPasswordError(t('createDialog.passwordMismatch', 'Passwords do not match'));
            return;
        }
        if (!selectedUserForPassword?.id || !onResetPassword) return;

        const result = await onResetPassword(selectedUserForPassword.id, newPassword);
        if (result?.success) {
            setPasswordDialogOpen(false);
            setSelectedUserForPassword(null);
            setNewPassword('');
            setNewPasswordConfirmation('');
            setPasswordError('');
        }
    };

    // ── Skeleton rows ──────────────────────────────────────────────────────
    if (loading && users.length === 0) {
        return (
            <div className="rounded-md border" data-testid="users-table-skeleton">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {[...Array(6)].map((_, i) => (
                                <TableHead key={i}><Skeleton className="h-4 w-24" /></TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {[...Array(8)].map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 w-32" /></div></TableCell>
                                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                                <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    }

    // ── Empty state ────────────────────────────────────────────────────────
    if (!loading && users.length === 0) {
        return (
            <div className="rounded-md border flex flex-col items-center justify-center py-16 text-center" data-testid="users-table-empty">
                <p className="text-lg font-semibold">{t('noUsers')}</p>
                <p className="text-muted-foreground text-sm mt-1">{t('noUsersDescription')}</p>
            </div>
        );
    }

    const { page, totalPages, total } = pagination;
    const from = (page - 1) * (pagination.limit ?? 20) + 1;
    const to = Math.min(page * (pagination.limit ?? 20), total);

    return (
        <div className="space-y-4">
            <div className="rounded-md border" data-testid="users-table">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {onToggleSelect && (
                                <TableHead className="w-10">
                                    <Checkbox
                                        checked={users.length > 0 && users.filter((u) => !u.is_deleted).every((u) => selectedIds?.includes(u.id))}
                                        onCheckedChange={(v) => onToggleAll?.(!!v)}
                                        aria-label={t('selectAll', 'Select all')}
                                    />
                                </TableHead>
                            )}
                            <TableHead>{t('table.user')}</TableHead>
                            <TableHead>{t('table.email')}</TableHead>
                            <TableHead>{t('table.phone')}</TableHead>
                            <TableHead>{t('table.role')}</TableHead>
                            <TableHead>{t('table.status')}</TableHead>
                            <TableHead actions>{t('table.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => {
                            // The badge reads the roles table (what filters and counts use), the
                            // highest staff role first; the old users.role column is only a fallback.
                            const roleList = user.user_roles?.map(({ role }) => role) ?? [];
                            const primaryRole = [...roleList].sort((x, y) => (STAFF_RANK[y] || 0) - (STAFF_RANK[x] || 0))[0] || user.role;
                            const isTeacher = String(primaryRole).toLowerCase() === 'teacher';
                            const isCurrentUser = Number(user.id) === Number(currentUserId);
                            const targetRoles = [
                                user.role,
                                ...(user.user_roles?.map(({ role }) => role) ?? []),
                            ].filter(Boolean);
                            // Staff act only on accounts below their own rank.
                            const canManage = !isCurrentUser && outranks(storeRoles, targetRoles);
                            const canEditPassword = !user.is_deleted && canManage;
                            const canImpersonate = canImpersonateUser({ actorRoles: storeRoles, targetRoles });
                            const displayEmail = user.email?.includes('_deleted_')
                                ? user.email.split('_deleted_')[0]
                                : user.email;
                            const displayPhone = user.phone?.includes('_deleted_')
                                ? user.phone.split('_deleted_')[0]
                                : user.phone;

                            return (
                                <TableRow key={user.id} data-testid={`users-table-row-${user.id}`}>
                                    {onToggleSelect && (
                                        <TableCell className="w-10">
                                            <Checkbox
                                                checked={!!selectedIds?.includes(user.id)}
                                                disabled={user.is_deleted}
                                                onCheckedChange={(v) => onToggleSelect(user.id, !!v)}
                                            />
                                        </TableCell>
                                    )}
                                    {/* User */}
                                    <TableCell truncate title={user.name || undefined}>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-9 w-9 shrink-0">
                                                <AvatarImage src={user.profile_pic_url} alt={user.name} className="object-cover" />
                                                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm uppercase">
                                                    {user.name?.charAt(0) || 'U'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0">
                                                <p className="font-medium text-sm truncate max-w-[160px]">{user.name}</p>
                                                {user.student_serial && (
                                                    <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">#{user.student_serial}</p>
                                                )}
                                                {user.created_at && (
                                                    <p className="text-xs text-muted-foreground tabular-nums">
                                                        {format(new Date(user.created_at), 'PP', { locale: isRtl ? arSA : undefined })}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* Email */}
                                    <TableCell truncate title={displayEmail || undefined}>
                                        <span className="text-sm truncate max-w-[200px] block" dir="ltr">
                                            {displayEmail || '—'}
                                        </span>
                                    </TableCell>

                                    {/* Phone */}
                                    <TableCell truncate title={displayPhone || undefined}>
                                        <span className="text-sm" dir="ltr">{displayPhone || '—'}</span>
                                    </TableCell>

                                    {/* Role */}
                                    <TableCell status>
                                        <div className="flex flex-wrap items-center gap-1">
                                            {primaryRole ? (
                                                <Badge variant="secondary">{t(`roles.${primaryRole}`, primaryRole)}</Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">—</span>
                                            )}
                                            {user.flag && user.flag !== 'NORMAL' && <AccountLevelBadge level={user.flag} />}
                                        </div>
                                    </TableCell>

                                    {/* Verification status */}
                                    <TableCell status>
                                        {user.is_deleted ? (
                                            <Badge variant="destructive">{t('status.deleted')}</Badge>
                                        ) : user.is_email_verified ? (
                                            <Badge variant="default" className="bg-success/15 text-success border-success/30">{t('status.verified')}</Badge>
                                        ) : (
                                            <Badge variant="outline">{t('status.pending')}</Badge>
                                        )}
                                    </TableCell>

                                    {/* Actions */}
                                    <TableCell actions>
                                        <div className="flex items-center justify-end gap-1">
                                            {/* View */}
                                                 <Button
                                                     variant="ghost"
                                                     size="icon"
                                                     className="h-8 w-8"
                                                     asChild
                                                     title={t('actions.view')}
                                                     data-testid={`users-table-view-${user.id}`}
                                                 >
                                                <Link to={`/admin/users/${user.id}`}>
                                                    <Eye className="h-4 w-4" />
                                                </Link>
                                            </Button>

                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                asChild
                                                title={t('actions.appreciation')}
                                                data-testid={`users-table-appreciation-${user.id}`}
                                            >
                                                <Link to={`/admin/users/${user.id}/appreciation`}>
                                                    <HeartHandshake className="h-4 w-4" />
                                                </Link>
                                            </Button>

                                            {isTeacher && !user.is_deleted && (
                                                <AppreciationQrButton userId={user.id} />
                                            )}

                                            {/* The profile photo at its largest size */}
                                            {user.profile_pic_url && (
                                                <Button variant="ghost" size="icon" className="h-8 w-8" asChild title={t('actions.downloadPhoto', 'Download photo')}>
                                                    <a href={largestPhotoUrl(user.profile_pic_url)} target="_blank" rel="noopener noreferrer" download>
                                                        <ImageDown className="h-4 w-4" />
                                                    </a>
                                                </Button>
                                            )}

                                             {!user.is_deleted && onImpersonate && canImpersonate && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                    onClick={() => onImpersonate(user.id)}
                                                    disabled={actionLoading || isCurrentUser || impersonatingUserId === user.id}
                                                    title={isCurrentUser ? t('actions.currentUser') : t('actions.impersonate')}
                                                    data-testid={`users-table-impersonate-${user.id}`}
                                                >
                                                    {impersonatingUserId === user.id ? <LoadingSpinner className="h-4 w-4" /> : <UserCog className="h-4 w-4" />}
                                                </Button>
                                            )}

                                            {/* Edit Password */}
                                            {!user.is_deleted && canEditPassword && onResetPassword && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                    onClick={() => handleOpenPasswordDialog(user)}
                                                    disabled={actionLoading}
                                                    title={t('actions.changePassword')}
                                                    data-testid={`users-table-password-${user.id}`}
                                                >
                                                    <KeyRound className="h-4 w-4" />
                                                </Button>
                                            )}

                                            {/* Approve */}
                                            {!user.is_deleted && !user.confirmed && canManage && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-success hover:text-success hover:bg-success/10"
                                                    onClick={() => onApprove(user.id)}
                                                    disabled={actionLoading}
                                                    title={t('actions.approve')}
                                                    data-testid={`users-table-approve-${user.id}`}
                                                >
                                                    <CheckCircle2 className={"h-4 w-4" + (isRtl ? " scale-x-[-1]" : "")} />
                                                </Button>
                                            )}

                                            {/* Reject */}
                                            {!user.is_deleted && user.confirmed && canManage && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-warning hover:text-warning hover:bg-warning/10"
                                                    onClick={() => onReject(user.id)}
                                                    disabled={actionLoading}
                                                    title={t('actions.reject')}
                                                    data-testid={`users-table-reject-${user.id}`}
                                                >
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            )}

                                            {/* Delete */}
                                            {!user.is_deleted && canManage && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                            disabled={actionLoading}
                                                            title={t('actions.delete')}
                                                            data-testid={`users-table-delete-${user.id}`}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent dir={i18n.dir()}>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>{t('details.confirmDeleteTitle')}</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                {t('details.confirmDeleteDesc')}
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel disabled={actionLoading}>{t('actions.cancel')}</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => onDelete(user.id)}
                                                                disabled={actionLoading}
                                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                            >
                                                                {actionLoading ? <LoadingSpinner className="h-4 w-4" /> : t('actions.delete')}
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between" data-testid="users-table-pagination">
                    <p className="text-sm text-muted-foreground">
                        {t('pagination.showing', { from, to, total })}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1 || loading}
                            data-testid="users-table-prev-page"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            {t('pagination.previous')}
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            {t('pagination.page')} {page} {t('pagination.of')} {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages || loading}
                            data-testid="users-table-next-page"
                        >
                            {t('pagination.next')}
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Change Password Dialog */}
            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                <DialogContent dir={i18n.dir()}>
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>{t('details.changePasswordTitle')}</DialogTitle>
                            <DialogDescription>
                                {t('details.changePasswordDescription', { name: selectedUserForPassword?.name || '' })}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                            <label htmlFor="user-table-new-password" className="text-sm font-medium">
                                {t('details.newPassword')}
                            </label>
                            <input
                                id="user-table-new-password"
                                type="password"
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(e) => {
                                    setNewPassword(e.target.value);
                                    setPasswordError('');
                                }}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                required
                                data-testid="users-table-password-input"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="user-table-confirm-password" className="text-sm font-medium">
                                {t('details.confirmNewPassword')}
                            </label>
                            <input
                                id="user-table-confirm-password"
                                type="password"
                                autoComplete="new-password"
                                value={newPasswordConfirmation}
                                onChange={(e) => {
                                    setNewPasswordConfirmation(e.target.value);
                                    setPasswordError('');
                                }}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                required
                                data-testid="users-table-confirm-password-input"
                            />
                        </div>
                        {passwordError && (
                            <p className="text-sm text-destructive" data-testid="users-table-password-error">
                                {passwordError}
                            </p>
                        )}
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setPasswordDialogOpen(false)}
                                disabled={actionLoading}
                                data-testid="users-table-password-cancel"
                            >
                                {t('actions.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                disabled={actionLoading}
                                data-testid="users-table-password-submit"
                            >
                                {actionLoading && <LoadingSpinner className="h-4 w-4 me-2" />}
                                {t('actions.changePassword')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
