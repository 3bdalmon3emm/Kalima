import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { ShoppingBag, BookOpen } from 'lucide-react';

import { useAdminUsers } from '@/hooks/admin/useAdminUsers';
import { useRole } from '@/hooks/useRole';
import useAuth from '@/hooks/auth/useAuth';
import { outranks } from '@/lib/roleRank';
import useLookups from '@/hooks/useLookups';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';

// Details Components
import DetailHeader from '@/components/admin/users/details/DetailHeader';
import MainInfoCard from '@/components/admin/users/details/MainInfoCard';
import UserAnalyticsCard from '@/components/admin/users/details/UserAnalyticsCard';
import UserRolesCard from '@/components/admin/users/details/UserRolesCard';
import TeacherCard from '@/components/admin/users/details/TeacherCard';
import StudentCard from '@/components/admin/users/details/StudentCard';
import LecturerCard from '@/components/admin/users/details/LecturerCard';
import AssistantCard from '@/components/admin/users/details/AssistantCard';
import AssistantTeachersCard from '@/components/admin/users/details/AssistantTeachersCard';
import ParentCard from '@/components/admin/users/details/ParentCard';
import UsersCreatedCard from '@/components/admin/users/details/UsersCreatedCard';
import ReasonDialog from '@/components/admin/staff-log/ReasonDialog';
import StaffActionLog from '@/components/admin/staff-log/StaffActionLog';

export default function UserDetailPage() {
    const { id } = useParams();
    const { t, i18n } = useTranslation('userManagement');
    const { t: tLog } = useTranslation('staffLog');
    const isRtl = i18n.dir() === 'rtl';
    const { isAdmin, storeRoles } = useRole();
    const { user: currentUser } = useAuth();
    const { governments, zones, getZonesByGovernment, subjects, levels, zonesLoading } = useLookups();

    const {
        selectedUser,
        loading,
        actionLoading,
        fetchUserById,
        updateUser,
        updateUserFlag,
        resetUserPassword,
        assignRole,
        revokeRole,
        deleteUser,
        approveUser,
        rejectUser
    } = useAdminUsers();

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        secondary_phone: '',
        gender: '',
        teachers: {},
        students: {},
        lecturers: {},
        assistants: {},
        parents: {},
    });

    useEffect(() => {
        fetchUserById(id);
    }, [id, fetchUserById]);

    useEffect(() => {
        if (selectedUser) {
            const displayEmail = selectedUser.email?.includes('_deleted_') ? selectedUser.email.split('_deleted_')[0] : selectedUser.email;
            const displayPhone = selectedUser.phone?.includes('_deleted_') ? selectedUser.phone.split('_deleted_')[0] : selectedUser.phone;

            setFormData({
                name: selectedUser.name || '',
                email: displayEmail || '',
                phone: displayPhone || '',
                secondary_phone: selectedUser.secondary_phone || '',
                gender: selectedUser.gender?.toUpperCase() || '',
                // Roles data
                teachers: (Array.isArray(selectedUser.teachers) ? selectedUser.teachers[0] : selectedUser.teachers) || { is_primary: false, is_preparatory: false, is_secondary: false },
                students: (Array.isArray(selectedUser.students) ? selectedUser.students[0] : selectedUser.students) || {},
                lecturers: (Array.isArray(selectedUser.lecturers) ? selectedUser.lecturers[0] : selectedUser.lecturers) || {},
                assistants: (Array.isArray(selectedUser.assistants) ? selectedUser.assistants[0] : selectedUser.assistants) || {},
                parents: (Array.isArray(selectedUser.parents) ? selectedUser.parents[0] : selectedUser.parents) || {},
            });
        }
    }, [selectedUser]);

    // Fetch initial zones when entering edit mode or when user data is loaded
    useEffect(() => {
        if (isEditing || selectedUser) {
            const rolesWithGov = ['teachers', 'students', 'lecturers', 'assistants', 'parents'];
            const roleWithGov = rolesWithGov.find(role => formData[role]?.government_id);
            if (roleWithGov && formData[roleWithGov].government_id) {
                getZonesByGovernment(formData[roleWithGov].government_id);
            }
        }
    }, [isEditing, selectedUser?.id, getZonesByGovernment]);

    /* ── handlers ── */
    const handleSave = async () => {
        const { teachers, students, lecturers, assistants, parents, ...restData } = formData;
        
        const relationsToOmit = ['government', 'zones', 'subjects', 'levels', 'user', 'academy', 'created_by_user'];
        
        const cleanData = (data) => {
            if (!data) return {};
            return Object.fromEntries(
                Object.entries(data).filter(([key, value]) => !relationsToOmit.includes(key) && value !== null)
            );
        };

        const payload = {
            ...cleanData(restData),
            ...cleanData(teachers),
            ...cleanData(students),
            ...cleanData(lecturers),
            ...cleanData(assistants),
            ...cleanData(parents),
        };

        const success = await updateUser(id, payload);
        if (success) {
            setIsEditing(false);
            fetchUserById(id);
        }
    };

    const handleRevokeRole = async (portal, role) => {
        await revokeRole(id, portal, role);
        fetchUserById(id);
    };

    const handleAssignRole = async (portal, role) => {
        await assignRole(id, portal, role);
        fetchUserById(id);
    };

    const handleDeleteUser = async (reason) => {
        const res = await deleteUser(id, reason);
        if (res?.success) {
            fetchUserById(id);
        }
    };

    const handleApprove = async () => {
        const res = await approveUser(id);
        if (res?.success) {
            fetchUserById(id);
        }
    };

    const handleReject = async () => {
        const res = await rejectUser(id);
        if (res?.success) {
            fetchUserById(id);
        }
    };

    // A level change asks why first; the reason goes to the level history.
    const [flagChange, setFlagChange] = useState(null);
    const [logKey, setLogKey] = useState(0);
    const handleUpdateFlag = (flag) => setFlagChange(flag);
    const confirmFlag = async (reason) => {
        const res = await updateUserFlag(id, flagChange, reason);
        if (!res) return false;
        fetchUserById(id);
        setLogKey((k) => k + 1);
        return true;
    };

    const handleResetPassword = async (password) => resetUserPassword(id, password);

    /* ── loading / not-found states ── */
    if (loading && !selectedUser) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <LoadingSpinner className="h-8 w-8 text-primary" />
            </div>
        );
    }

    if (!selectedUser) {
        return (
            <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-center">
                <p className="text-xl text-muted-foreground">{t('details.userNotFound', 'User not found.')}</p>
                <Button variant="outline" onClick={() => window.history.back()}>
                    {t('details.back')}
                </Button>
            </div>
        );
    }

    /* ── derived values ── */
    const analytics = selectedUser.user_analytics || {};
    const teachers = selectedUser.teachers ? (Array.isArray(selectedUser.teachers) ? selectedUser.teachers : [selectedUser.teachers]) : [];
    const teachesAt = selectedUser.teaches_at || [];
    const students = selectedUser.students ? (Array.isArray(selectedUser.students) ? selectedUser.students : [selectedUser.students]) : [];
    const lecturers = selectedUser.lecturers ? (Array.isArray(selectedUser.lecturers) ? selectedUser.lecturers : [selectedUser.lecturers]) : [];
    const assistants = selectedUser.assistants ? (Array.isArray(selectedUser.assistants) ? selectedUser.assistants : [selectedUser.assistants]) : [];
    const parents = selectedUser.parents ? (Array.isArray(selectedUser.parents) ? selectedUser.parents : [selectedUser.parents]) : [];
    const roles = selectedUser.user_roles || [];
    const userCreated = selectedUser.userCreated || {};

    const hasRole = (portal, roleName) => roles.some(r => r.portal.toLowerCase() === portal.toLowerCase() && r.role.toLowerCase() === roleName.toLowerCase());
    const isTeacher = hasRole('academy', 'Teacher') || hasRole('store', 'Teacher');
    const isStudent = hasRole('academy', 'Student') || hasRole('store', 'Student');
    const isLecturer = hasRole('academy', 'Lecturer') || hasRole('store', 'Lecturer');
    const isAssistant = hasRole('academy', 'Assistant') || hasRole('store', 'Assistant');
    const isParent = hasRole('academy', 'Parent') || hasRole('store', 'Parent');

    const analyticsStats = [
        {
            icon: ShoppingBag,
            label: t('details.totalSpent'),
            value: `${Number(analytics.total_spent ?? 0).toLocaleString()} ${t('details.currency')}`,
            color: 'text-chart-3',
        },
        {
            icon: BookOpen,
            label: t('details.purchases'),
            value: analytics.number_of_purchases ?? 0,
            color: 'text-primary',
        }
    ];

    const createdEntries = Object.entries(userCreated).filter(([, v]) => v > 0);
    const displayEmail = selectedUser.email?.includes('_deleted_') ? selectedUser.email.split('_deleted_')[0] : selectedUser.email;
    const displayPhone = selectedUser.phone?.includes('_deleted_') ? selectedUser.phone.split('_deleted_')[0] : selectedUser.phone;
    const displaySecondaryPhone = selectedUser.secondary_phone?.includes('_deleted_') ? selectedUser.secondary_phone.split('_deleted_')[0] : selectedUser.secondary_phone;

    const targetRoles = [selectedUser?.role, ...(selectedUser?.user_roles?.map(r => r.role) || [])].filter(Boolean);
    // Staff act only on accounts below their own rank; the Admin may also edit
    // any profile.
    const isSelf = Number(selectedUser.id) === Number(currentUser?.id);
    const canManage = !isSelf && outranks(storeRoles, targetRoles);
    const canResetPassword = !selectedUser.is_deleted && canManage;

    return (
        <div className="space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500" dir={isRtl ? 'rtl' : 'ltr'}>

            {/* Header */}
            <DetailHeader
                user={selectedUser}
                isEditing={isEditing}
                onEdit={() => setIsEditing(true)}
                onCancel={() => setIsEditing(false)}
                onSave={handleSave}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={handleDeleteUser}
                onUpdateFlag={handleUpdateFlag}
                onResetPassword={handleResetPassword}
                actionLoading={actionLoading}
                canResetPassword={canResetPassword}
                canManage={canManage}
                canEdit={isAdmin || canManage}
                isRtl={isRtl}
                t={t}
            />

            <ReasonDialog
                open={!!flagChange}
                onOpenChange={(o) => !o && setFlagChange(null)}
                title={tLog('flagDialog.title')}
                description={flagChange ? tLog('flagDialog.description', { level: t(`details.flags.${flagChange}`, flagChange) }) : ''}
                onConfirm={confirmFlag}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Analytics & Roles */}
                <div className="lg:col-span-1 space-y-6 order-2 lg:order-1">
                    <UserAnalyticsCard stats={analyticsStats} t={t} />

                    <UserRolesCard
                        roles={roles}
                        onRevoke={handleRevokeRole}
                        onAssign={handleAssignRole}
                        hasAdminAccess={canManage}
                        t={t}
                    />

                    <StaffActionLog entityType="user" entityId={Number(id)} refreshKey={logKey} title={tLog('flagTitle')} emptyText={tLog('flagEmpty')} />

                    <UsersCreatedCard createdEntries={createdEntries} t={t} />

                    {/* Metadata Card */}
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                            <span>{t('details.joined')}</span>
                            <span className="font-mono tabular-nums">
                                {selectedUser.created_at && format(new Date(selectedUser.created_at), 'PP p', { locale: isRtl ? arSA : undefined })}
                            </span>
                        </div>
                        {students[0]?.sequenced_id && (
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                                <span>{t('details.studentSerial')}</span>
                                <span className="font-mono tabular-nums text-sm text-foreground" dir="ltr">#{students[0].sequenced_id}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Column: User Details */}
                <div className="lg:col-span-2 space-y-6 order-1 lg:order-2">

                    {/* Basic Info */}
                    <MainInfoCard
                        user={selectedUser}
                        isEditing={isEditing}
                        formData={formData}
                        setFormData={setFormData}
                        t={t}
                        displayEmail={displayEmail}
                        displayPhone={displayPhone}
                        displaySecondaryPhone={displaySecondaryPhone}
                    />

                    {/* Teacher Details */}
                    {isTeacher && (
                        <TeacherCard
                            teachers={teachers}
                            isEditing={isEditing}
                            formData={formData}
                            setFormData={setFormData}
                            t={t}
                            subjects={subjects}
                            governments={governments}
                            zones={zones}
                            zonesLoading={zonesLoading}
                            getZonesByGovernment={getZonesByGovernment}
                            teachesAt={teachesAt}
                        />
                    )}

                    {/* Student Details */}
                    {isStudent && (
                        <StudentCard
                            students={students}
                            isEditing={isEditing}
                            formData={formData}
                            setFormData={setFormData}
                            t={t}
                            levels={levels}
                            governments={governments}
                            zones={zones}
                            zonesLoading={zonesLoading}
                            getZonesByGovernment={getZonesByGovernment}
                        />
                    )}

                    {/* Lecturer Details */}
                    {isLecturer && (
                        <LecturerCard
                            lecturers={lecturers}
                            isEditing={isEditing}
                            formData={formData}
                            setFormData={setFormData}
                            t={t}
                            levels={levels}
                            governments={governments}
                            zones={zones}
                            zonesLoading={zonesLoading}
                            getZonesByGovernment={getZonesByGovernment}
                        />
                    )}

                    {/* Assistant Details */}
                    {isAssistant && (
                        <AssistantCard
                            assistants={assistants}
                            isEditing={isEditing}
                            formData={formData}
                            setFormData={setFormData}
                            t={t}
                            levels={levels}
                            governments={governments}
                            zones={zones}
                            zonesLoading={zonesLoading}
                            getZonesByGovernment={getZonesByGovernment}
                        />
                    )}

                    {isAssistant && <AssistantTeachersCard assistantId={selectedUser.id} />}

                    {/* Parent Details */}
                    {isParent && (
                        <ParentCard
                            parents={parents}
                            isEditing={isEditing}
                            formData={formData}
                            setFormData={setFormData}
                            t={t}
                            levels={levels}
                            governments={governments}
                            zones={zones}
                            zonesLoading={zonesLoading}
                            getZonesByGovernment={getZonesByGovernment}
                        />
                    )}

                </div>
            </div>
        </div>
    );
}
