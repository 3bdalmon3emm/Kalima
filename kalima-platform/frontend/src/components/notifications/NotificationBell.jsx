import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellRing, Check, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications, CATEGORY_COLORS } from '@/contexts/NotificationsContext';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { useRole } from '@/hooks/useRole';
import { getNotificationTarget } from '@/utils/notificationTarget';

export default function NotificationBell() {
    const { t, i18n } = useTranslation('notifications');
    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        desktopNotifications,
        requestDesktopNotifications
    } = useNotifications();
    const { hasAdminAccess, isTeacher } = useRole();
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState(null);
    const triggerRef = useRef(null);
    const navigate = useNavigate();

    const dateLocale = i18n.language === 'ar' ? ar : enUS;
    const handleNotificationClick = async (notification) => {
        if (!notification.is_read) {
            await markAsRead(notification.id);
        }
        
        setIsOpen(false);
        
        const target = getNotificationTarget(notification, { hasAdminAccess, isTeacher });
        if (target) navigate(target);
    };

    const handleEnableDesktopNotifications = async (event) => {
        event.stopPropagation();
        await requestDesktopNotifications();
    };

    useEffect(() => {
        if (!isOpen) return;

        const updateDropdownPosition = () => {
            const triggerRect = triggerRef.current?.getBoundingClientRect();
            if (!triggerRect) return;

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const margin = 12;
            const gap = 8;
            const width = viewportWidth < 768
                ? viewportWidth - (margin * 2)
                : Math.min(384, viewportWidth - (margin * 2));
            const maxLeft = viewportWidth - width - margin;
            const preferredLeft = i18n.language === 'ar'
                ? triggerRect.left
                : triggerRect.right - width;
            const left = Math.min(Math.max(preferredLeft, margin), maxLeft);
            const top = Math.min(triggerRect.bottom + gap, viewportHeight - 120);

            setDropdownPosition({
                left,
                top,
                width,
                maxHeight: Math.max(240, viewportHeight - top - margin),
            });
        };

        updateDropdownPosition();
        window.addEventListener('resize', updateDropdownPosition);
        window.addEventListener('scroll', updateDropdownPosition, true);

        return () => {
            window.removeEventListener('resize', updateDropdownPosition);
            window.removeEventListener('scroll', updateDropdownPosition, true);
        };
    }, [i18n.language, isOpen]);

    const dropdown = (
        <AnimatePresence>
            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-[90] bg-black/5"
                        onClick={() => setIsOpen(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className={cn(
                            "fixed bg-card/80 backdrop-blur-xl border border-border shadow-2xl rounded-2xl z-[100] overflow-hidden flex flex-col",
                            i18n.language === 'ar' ? "origin-top-left" : "origin-top-right"
                        )}
                        style={dropdownPosition || { left: 12, right: 12, top: 72 }}
                    >
                        <div className="p-4 border-b border-border flex items-center justify-between bg-primary/5">
                            <h3 className="font-bold text-sm uppercase tracking-wider">{t('title')}</h3>
                            <div className="flex items-center gap-1">
                                {desktopNotifications?.canRequest && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={handleEnableDesktopNotifications}
                                                    className="h-8 w-8 text-primary hover:bg-primary/10"
                                                    aria-label={t('desktop.enable')}
                                                >
                                                    <BellRing className="h-4 w-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {t('desktop.enable')}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                                {unreadCount > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={markAllAsRead}
                                        className="h-7 text-[10px] uppercase font-bold"
                                    >
                                        <Check className="h-3 w-3 mr-1" />
                                        {t('mark_all_read')}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[100px]">
                            {notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <Bell className="h-8 w-8 mb-2 opacity-20" />
                                    <p className="text-xs font-medium">{t('no_notifications')}</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border/50">
                                    {notifications.map((notification) => (
                                        <div
                                            key={notification.id}
                                            onClick={() => handleNotificationClick(notification)}
                                            className={`p-4 transition-colors cursor-pointer relative group ${notification.is_read ? 'bg-background hover:bg-muted/50' : 'bg-primary/10 hover:bg-primary/15'}`}
                                        >
                                            <div className="flex gap-3">
                                                <div
                                                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${notification.is_read ? 'opacity-0' : ''}`}
                                                    style={{ backgroundColor: CATEGORY_COLORS[notification.category] || CATEGORY_COLORS[10] }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    {notification.title ? (
                                                        <>
                                                            <p className={`text-xs text-foreground line-clamp-1 ${notification.is_read ? 'font-medium' : 'font-bold'}`}>{notification.title}</p>
                                                            {notification.body && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed whitespace-pre-line">{notification.body}</p>}
                                                        </>
                                                    ) : (
                                                        <p className={`text-xs text-foreground line-clamp-2 leading-relaxed ${notification.is_read ? 'font-medium' : 'font-semibold'}`}>
                                                            {t(`keys.${notification.message_key}`, notification.message_key)}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center justify-between mt-2">
                                                        <span className="text-[10px] text-muted-foreground font-medium">
                                                            {notification.created_at ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: dateLocale }) : ''}
                                                        </span>
                                                        {notification.entity_type && (
                                                            <ExternalLink className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-2 border-t border-border bg-muted/30">
                            <Button
                                variant="ghost"
                                className="w-full h-8 text-xs font-bold text-primary hover:bg-primary/10"
                                onClick={() => {
                                    setIsOpen(false);
                                    navigate('/notifications');
                                }}
                            >
                                {t('view_all')}
                            </Button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return (
        <div className="relative">
            <Button
                ref={triggerRef}
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(!isOpen)}
                className="relative hover:bg-primary/10 hover:text-primary h-9 w-9"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className={cn(
                        "absolute -top-1 w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center z-10 animate-pulse",
                        i18n.language === 'ar' ? 'left-0' : 'right-0'
                    )}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </Button>

            {typeof document !== 'undefined' ? createPortal(dropdown, document.body) : dropdown}
        </div>
    );
}
