import { useState, useCallback } from 'react';
import axiosInstance from '@/api/axios';
import useApiMutation from '../useApiMutation';
import { useTranslation } from 'react-i18next';

export const useAdminUsers = () => {
    const { t } = useTranslation('userManagement');
    const { mutate, loading: actionLoading } = useApiMutation();

    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });

    // ─── List Users ──────────────────────────────────────────────────────────
    const fetchUsers = useCallback(async (params = {}) => {
        setLoading(true);
        try {
            const { page = 1, limit = 20, search, role, portal, confirmed, flag } = params;
            const query = new URLSearchParams({ page, limit });
            if (search) query.set('search', search);
            if (role) query.set('role', role);
            if (flag) query.set('flag', flag);
            if (portal) query.set('portal', portal);
            if (confirmed !== undefined) query.set('confirmed', confirmed);

            const response = await axiosInstance.get(`/admin/users?${query.toString()}`);
            const data = response.data?.data;
            setUsers(data?.users || []);
            if (data?.pagination) {
                const p = data.pagination;
                setPagination({
                    page: p.page,
                    totalPages: p.totalPages,
                    total: p.total,
                    limit: p.limit,
                });
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // ─── Single User ─────────────────────────────────────────────────────────
    const fetchUserById = useCallback(async (userId) => {
        setLoading(true);
        try {
            const response = await axiosInstance.get(`/admin/users/${userId}`);
            setSelectedUser(response.data?.data || null);
        } catch (error) {
            console.error('Failed to fetch user:', error);
            setSelectedUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // ─── Update Single User ─────────────────────────────────────────────────────────
    const updateUser = useCallback(async (userId, data) => {
        setLoading(true);
        try {
            const response = await mutate({
                endpoint: `/admin/users/${userId}/profile`,
                method: 'patch',
                data,
            });
            setSelectedUser(response || null);
            return response;
        } catch (error) {
            console.error('Failed to update user:', error);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    // ─── Update User Flag ─────────────────────────────────────────────────────────
    const updateUserFlag = useCallback(async (userId, flag) => {
        setLoading(true);
        try {
            const response = await mutate({
                endpoint: `/admin/users/${userId}/flag`,
                method: 'patch',
                data: { flag },
            });
            setSelectedUser(response || null);
            return response;
        } catch (error) {
            console.error('Failed to update user flag:', error);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    // ─── Admin Password Reset ───────────────────────────────────────────────
    const resetUserPassword = useCallback(async (userId, password) => {
        try {
            return await mutate({
                endpoint: `/admin/users/${userId}/password`,
                method: 'patch',
                data: { password },
            });
        } catch (error) {
            console.error('Failed to reset user password:', error);
            return null;
        }
    }, [mutate]);

    // ─── Delete User ─────────────────────────────────────────────────────────
    const deleteUser = async (userId, reason) => {
        try {
            const res = await mutate({
                endpoint: `/admin/users/${userId}`,
                method: 'delete',
                data: reason ? { reason } : undefined,
                defaultSuccessMessage: t('messages.deleteSuccess'),
            });
            return res;
        } catch {
            return null;
        }
    };

    // ─── Approve / Reject ────────────────────────────────────────────────────
    const approveUser = async (userId) => {
        try {
            const res = await mutate({
                endpoint: `/admin/users/${userId}/approve`,
                method: 'post',
                defaultSuccessMessage: t('messages.approveSuccess'),
            });
            return res;
        } catch {
            return null;
        }
    };

    const rejectUser = async (userId) => {
        try {
            const res = await mutate({
                endpoint: `/admin/users/${userId}/reject`,
                method: 'post',
                defaultSuccessMessage: t('messages.rejectSuccess'),
            });
            return res;
        } catch {
            return null;
        }
    };

    // ─── Role Management ─────────────────────────────────────────────────────
    const assignRole = async (userId, portal, role) => {
        try {
            const res = await mutate({
                endpoint: `/admin/users/${userId}/roles`,
                method: 'post',
                data: { portal, role },
                defaultSuccessMessage: `Role ${role} on ${portal} assigned successfully`,
            });
            return res;
        } catch {
            return null;
        }
    };

    const revokeRole = async (userId, portal, role) => {
        try {
            const res = await mutate({
                endpoint: `/admin/users/${userId}/roles`,
                method: 'delete',
                data: { portal, role },
                defaultSuccessMessage: `Role ${role} on ${portal} revoked successfully`,
            });
            return res;
        } catch {
            return null;
        }
    };

    // ─── Create Users ─────────────────────────────────────────────────────────
    const _createUser = async (endpoint, data) => {
        try {
            const res = await mutate({ endpoint, method: 'post', data });
            return !!res?.success;
        } catch {
            return false;
        }
    };

    const createTeacherUser = (data) => _createUser('/admin/teachers', data);
    const createAdminUser = (data) => _createUser('auth/admin/create-admin', data);
    const createSubAdminUser = (data) => _createUser('auth/admin/create-subadmin', data);
    const createModeratorUser = (data) => _createUser('auth/admin/create-moderator', data);
    const createAssistantUser = (data) => _createUser('auth/admin/create-assistant', data);
    const createStudentUser = (data) => _createUser('/admin/students', data);
    const createParentUser = (data) => _createUser('/admin/parents', data);
    const createLecturerUser = (data) => _createUser('/admin/lecturers', data);
    return {
        // state
        users,
        selectedUser,
        loading,
        pagination,
        actionLoading,
        // actions
        fetchUsers,
        fetchUserById,
        updateUser,
        updateUserFlag,
        resetUserPassword,
        deleteUser,
        approveUser,
        rejectUser,
        assignRole,
        revokeRole,
        createTeacherUser,
        createAdminUser,
        createSubAdminUser,
        createModeratorUser,
        createAssistantUser,
        createStudentUser,
        createParentUser,
        createLecturerUser
    };
};
