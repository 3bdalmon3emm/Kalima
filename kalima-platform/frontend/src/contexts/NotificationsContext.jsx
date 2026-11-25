import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import socket, { connectSocket, disconnectSocket } from '@/api/socket';
import { useNotificationsNetwork } from '@/hooks/useNotifications';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/auth/useAuth';
import { useRole } from '@/hooks/useRole';
import { getNotificationTarget as resolveNotificationTarget } from '@/utils/notificationTarget';
import {
    getDesktopNotificationState,
    requestDesktopNotificationPermission,
    showDesktopNotification
} from '@/utils/desktopNotifications';

export const NotificationsContext = createContext();

export const NOTIFICATION_CATEGORIES = {
    ORDER_STATUS_CHANGE: 1,
    ORDER_ITEM_DELETED: 2,
    ORDER_DELETED: 3,
    NEW_ORDER: 4,
    NEW_ACCOUNT: 5,
    ORDER_GENERAL_EDIT: 7,
    SYSTEM_ANNOUNCEMENT: 8,
    ACCOUNT_UPDATE: 9,
    CUSTOM: 10
};

export const CATEGORY_COLORS = {
    1: '#3b82f6', // blue (Order Status)
    2: '#f59e0b', // amber (Item Deleted)
    3: '#ef4444', // red (Order Deleted)
    4: '#10b981', // emerald (New Order - Admin)
    5: '#6366f1', // indigo (New Account - Admin)
    7: '#8b5cf6', // violet (General Edit)
    8: '#ec4899', // pink (Announcement)
    9: '#14b8a6', // teal (Account Update)
    10: '#64748b' // slate (Custom)
};

export const NotificationsProvider = ({ children }) => {
    const { t } = useTranslation('notifications');
    const { isAuthenticated } = useAuth();
    const { hasAdminAccess, isTeacher } = useRole();
    
    const {
        getMyNotifications,
        getUnreadCount,
        markAsRead,
        markAllAsRead,
        adminSendNotification,
        adminListAllNotifications,
        loading: apiLoading,
        error
    } = useNotificationsNetwork();

    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [desktopNotifications, setDesktopNotifications] = useState(() => getDesktopNotificationState());
    const isFirstLoad = useRef(true);
    const hasSeededNotificationsRef = useRef(false);
    const knownNotificationIdsRef = useRef(new Set());
    const shownDesktopNotificationIdsRef = useRef(new Set());

    const getNotificationKey = useCallback((notification) => {
        if (!notification) return null;
        if (notification.id !== undefined && notification.id !== null) return `id:${notification.id}`;

        return [
            notification.message_key,
            notification.entity_type,
            notification.entity_id,
            notification.created_at
        ].filter(Boolean).join(':') || null;
    }, []);

    const refreshDesktopNotificationState = useCallback(() => {
        const nextState = getDesktopNotificationState();
        setDesktopNotifications(nextState);
        return nextState;
    }, []);

    const getNotificationTarget = useCallback((notification) => {
        return resolveNotificationTarget(notification, { hasAdminAccess, isTeacher });
    }, [hasAdminAccess, isTeacher]);

    const showDesktopNotificationForNotification = useCallback((notification) => {
        const notificationKey = getNotificationKey(notification);
        if (!notificationKey || shownDesktopNotificationIdsRef.current.has(notificationKey)) return;

        const messageKey = notification.message_key;
        const message = t(`keys.${messageKey}`, messageKey);
        const notificationTarget = getNotificationTarget(notification);
        const shownNotification = showDesktopNotification({
            title: t('desktop.title', 'Kalima'),
            body: message,
            url: notificationTarget,
            tag: `kalima-notification-${notificationKey}`
        });

        if (shownNotification) {
            shownDesktopNotificationIdsRef.current.add(notificationKey);
        }
    }, [getNotificationKey, getNotificationTarget, t]);

    const requestDesktopNotifications = useCallback(async () => {
        const permission = await requestDesktopNotificationPermission();
        const nextState = refreshDesktopNotificationState();

        if (permission === 'granted') {
            toast.success(t('desktop.enabled', 'Desktop notifications enabled'));
        } else if (permission === 'denied') {
            toast.error(t('desktop.denied', 'Desktop notifications are blocked. Enable them from your browser settings.'));
        } else if (permission === 'unsupported') {
            toast.error(t('desktop.unsupported', 'Desktop notifications are not available in this browser or connection.'));
        } else {
            toast(t('desktop.dismissed', 'Desktop notification permission was not enabled.'));
        }

        return nextState.permission;
    }, [refreshDesktopNotificationState, t]);

    const fetchUnreadCount = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const { data } = await getUnreadCount();
            setUnreadCount((data.data ?? data).unread_count);
        } catch (error) {
            console.error('Failed to fetch unread count:', error);
        }
    }, [isAuthenticated, getUnreadCount]);

    const fetchInitialNotifications = useCallback(async ({ notifyDesktopForNew = false } = {}) => {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            // Read and unread alike: read ones stay in the bell, shown as read.
            const { data } = await getMyNotifications({ limit: 20 });
            const nextNotifications = (data.data ?? data).notifications || [];
            const newlyDiscoveredNotifications = [];

            nextNotifications.forEach((notification) => {
                const notificationKey = getNotificationKey(notification);
                if (!notificationKey) return;

                if (!knownNotificationIdsRef.current.has(notificationKey) && notifyDesktopForNew) {
                    newlyDiscoveredNotifications.push(notification);
                }

                knownNotificationIdsRef.current.add(notificationKey);
            });
            hasSeededNotificationsRef.current = true;

            setNotifications(nextNotifications);
            if (nextNotifications.some((notification) => ['purchase', 'e_booklet_purchase'].includes(notification.entity_type))) {
                window.dispatchEvent(new CustomEvent('kalima:orders-changed'));
            }
            newlyDiscoveredNotifications.reverse().forEach(showDesktopNotificationForNotification);
            await fetchUnreadCount();
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, fetchUnreadCount, getMyNotifications, getNotificationKey, showDesktopNotificationForNotification]);

    const handleMarkAsRead = async (id) => {
        try {
            await markAsRead(id);
            setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
            toast.success(t('marked_all_read', 'All notifications marked as read'));
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            connectSocket();
            
            if (isFirstLoad.current) {
                fetchInitialNotifications();
                isFirstLoad.current = false;
            }

            const onNotification = (notification) => {
                console.log('Received notification:', notification);
                const notificationKey = getNotificationKey(notification);
                let isNewNotification = true;

                if (notificationKey) {
                    isNewNotification = !knownNotificationIdsRef.current.has(notificationKey);
                    knownNotificationIdsRef.current.add(notificationKey);
                }

                setNotifications(prev => {
                    if (notificationKey && prev.some((item) => getNotificationKey(item) === notificationKey)) {
                        return prev;
                    }

                    return [notification, ...prev];
                });

                if (isNewNotification) {
                    setUnreadCount(prev => prev + 1);
                    showDesktopNotificationForNotification(notification);
                }

                if (['purchase', 'e_booklet_purchase'].includes(notification.entity_type)) {
                    window.dispatchEvent(new CustomEvent('kalima:orders-changed', { detail: notification }));
                }
                
                // Show toast
                const messageKey = notification.message_key;
                const message = t(`keys.${messageKey}`, messageKey);
                const notificationTarget = getNotificationTarget(notification) || (hasAdminAccess
                    ? `/admin/orders/${notification.entity_id}`
                    : isTeacher
                        ? '/teacher/orders'
                        : '/orders');
                
                toast(message, {
                    description: t('new_notification', 'You have a new notification'),
                    icon: '🔔',
                    action: notification.target_link || notification.entity_type === 'purchase' ? {
                        label: t('view', 'View'),
                        onClick: () => window.location.href = notificationTarget
                    } : undefined
                });
            };

            const onConnect = () => {
                if (hasAdminAccess) {
                    socket.emit('join', 'store_admins');
                }
                fetchInitialNotifications({ notifyDesktopForNew: hasSeededNotificationsRef.current });
            };

            socket.on('notification', onNotification);
            socket.on('connect', onConnect);

            if (socket.connected) {
                onConnect();
            }

            return () => {
                socket.off('notification', onNotification);
                socket.off('connect', onConnect);
            };
        } else {
            disconnectSocket();
            setNotifications([]);
            setUnreadCount(0);
            isFirstLoad.current = true;
            hasSeededNotificationsRef.current = false;
            knownNotificationIdsRef.current.clear();
            shownDesktopNotificationIdsRef.current.clear();
        }
    }, [isAuthenticated, hasAdminAccess, isTeacher, t, fetchInitialNotifications, getNotificationKey, getNotificationTarget, showDesktopNotificationForNotification]);

    useEffect(() => {
        refreshDesktopNotificationState();

        const refreshState = () => refreshDesktopNotificationState();
        window.addEventListener('focus', refreshState);
        document.addEventListener('visibilitychange', refreshState);

        return () => {
            window.removeEventListener('focus', refreshState);
            document.removeEventListener('visibilitychange', refreshState);
        };
    }, [refreshDesktopNotificationState]);

    const value = {
        notifications,
        unreadCount,
        loading: loading || apiLoading,
        error,
        desktopNotifications,
        requestDesktopNotifications,
        markAsRead: handleMarkAsRead,
        markAllAsRead: handleMarkAllAsRead,
        refresh: fetchInitialNotifications,
        adminSendNotification,
        adminListAllNotifications,
        getMyNotifications
    };

    return (
        <NotificationsContext.Provider value={value}>
            {children}
        </NotificationsContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationsContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationsProvider');
    }
    return context;
};
