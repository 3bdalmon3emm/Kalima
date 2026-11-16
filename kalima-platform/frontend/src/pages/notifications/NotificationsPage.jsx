import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '@/contexts/NotificationsContext';

import { CATEGORY_COLORS } from '@/contexts/NotificationsContext';
import { Button } from '@/components/ui/button';
import { Bell, Check, Filter, Calendar, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useRole } from '@/hooks/useRole';
import { getNotificationTarget } from '@/utils/notificationTarget';
export default function NotificationsPage() {
    const { t, i18n } = useTranslation('notifications');
    const { markAsRead, markAllAsRead, getMyNotifications } = useNotifications();
    const { hasAdminAccess, isTeacher } = useRole();

    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const navigate = useNavigate();

    const dateLocale = i18n.language === 'ar' ? ar : enUS;
    const fetchNotifications = async (pageNum = 1, append = false) => {
        setLoading(true);
        try {
            const { data } = await getMyNotifications({ page: pageNum, limit: 20 });
            const notificationData = data.data ?? data;
            const nextNotifications = notificationData.notifications ?? [];
            const pagination = data.pagination ?? notificationData.pagination;
            if (append) {
                setNotifications(prev => [...prev, ...nextNotifications]);
            } else {
                setNotifications(nextNotifications);
            }
            setHasMore((pagination?.page ?? 1) < (pagination?.pages ?? 1));
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const handleMarkRead = async (id) => {
        await markAsRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    };

    const handleMarkAllRead = async () => {
        await markAllAsRead();
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    };

    const handleNotificationClick = async (notification) => {
        if (!notification.is_read) {
            await handleMarkRead(notification.id);
        }

        const target = getNotificationTarget(notification, { hasAdminAccess, isTeacher });
        if (target) navigate(target);
    };

    return (
        <div className="container py-8 max-w-4xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Bell className="h-8 w-8 text-primary" />
                        {t('title')}
                    </h1>
                    <p className="text-muted-foreground mt-1 font-medium">
                        {t('unread_count', { count: notifications.filter(n => !n.is_read).length })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleMarkAllRead}
                        className="font-bold uppercase tracking-tighter"
                        disabled={!notifications.some(n => !n.is_read)}
                    >
                        <Check className={`h-4 w-4 mr-2 ${i18n.language === 'ar' ? 'scale-x-[-1]' : ''}`} />
                        {t('mark_all_read')}
                    </Button>
                </div>
            </div>

            <div className="bg-card/50 backdrop-blur-md border border-border rounded-3xl overflow-hidden shadow-xl">
                {loading && page === 1 ? (
                    <div className="p-20 flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="p-20 text-center text-muted-foreground flex flex-col items-center">
                        <Bell className="h-12 w-12 mb-4 opacity-10" />
                        <p className="text-lg font-bold">{t('no_notifications')}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border/50">
                        {notifications.map((notification) => (
                            <div
                                key={notification.id}
                                className={cn(
                                    "p-6 transition-all relative group cursor-pointer",
                                    notification.is_read ? "bg-transparent opacity-70" : "bg-primary/5 ring-1 ring-inset ring-primary/10"
                                )}
                                onClick={() => handleNotificationClick(notification)}
                            >
                                <div className="flex gap-4">
                                    <div
                                        className="w-1.5 h-1.5 rounded-full mt-2.5 shrink-0"
                                        style={{ backgroundColor: CATEGORY_COLORS[notification.category] || CATEGORY_COLORS[10] }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span
                                                        className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-muted/50"
                                                        style={{ color: CATEGORY_COLORS[notification.category] }}
                                                    >
                                                        {t(`categories.${notification.category}`)}
                                                    </span>
                                                    {!notification.is_read && (
                                                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                                    )}
                                                </div>
                                                <p className={cn(
                                                    "text-base leading-relaxed",
                                                    notification.is_read ? "text-foreground/80" : "text-foreground font-semibold"
                                                )}>
                                                    {notification.title || t(`keys.${notification.message_key}`, notification.message_key)}
                                                </p>
                                                {notification.title && notification.body && (
                                                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{notification.body}</p>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-xs">
                                                    <Calendar className="h-3 w-3" />
                                                    {format(new Date(notification.created_at), 'PPP', { locale: dateLocale })}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground/60 mt-1 uppercase font-bold">
                                                    {format(new Date(notification.created_at), 'p', { locale: dateLocale })}
                                                </div>
                                            </div>
                                        </div>

                                        {notification.entity_type && (
                                            <div className="mt-4 flex items-center justify-between">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 px-3 text-xs font-bold text-primary group-hover:bg-primary/10"
                                                >
                                                    {t('view')}
                                                    <ExternalLink className="h-3 w-3 ml-2" />
                                                </Button>

                                                {!notification.is_read && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleMarkRead(notification.id);
                                                        }}
                                                        className="h-8 text-[10px] uppercase font-black text-muted-foreground hover:text-foreground"
                                                    >
                                                        {t('mark_read')}
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {hasMore && (
                    <div className="p-6 border-t border-border flex justify-center">
                        <Button
                            variant="outline"
                            onClick={() => {
                                const nextPage = page + 1;
                                setPage(nextPage);
                                fetchNotifications(nextPage, true);
                            }}
                            loading={loading}
                        >
                            {t('load_more')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
