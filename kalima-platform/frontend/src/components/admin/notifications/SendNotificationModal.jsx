import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

// The admin writes the whole notification: a title and a text. It goes to
// one user (`userId`) or several (`userIds`), inside the platform only.
export default function SendNotificationModal({ open, onOpenChange, userId, userIds, entityType, entityId, onSent }) {
    const { t } = useTranslation('notifications');
    const { adminSendNotification } = useNotifications();
    const [sending, setSending] = useState(false);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const targets = userIds?.length ? userIds : userId ? [userId] : [];

    const handleSend = async () => {
        setSending(true);
        try {
            await adminSendNotification({
                user_ids: targets,
                category: 10,
                message_key: 'CUSTOM',
                title: title.trim(),
                body: body.trim(),
                entity_type: entityType,
                entity_id: entityId,
            });
            toast.success(t('admin.send_success'));
            setTitle('');
            setBody('');
            onOpenChange(false);
            onSent?.();
        } catch (error) {
            console.error('Failed to send notification:', error);
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] rounded-3xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black flex items-center gap-2">
                        <Bell className="h-6 w-6 text-primary" />
                        {t('admin.send_notification')}
                    </DialogTitle>
                    <DialogDescription className="font-medium text-muted-foreground">
                        {t('admin.send_to', { count: targets.length, defaultValue: 'To {{count}} user(s), inside the platform.' })}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-bold">{t('admin.title_label', 'Title')}</label>
                        <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t('admin.title_placeholder', 'For example: Your order is ready')} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-bold">{t('admin.body_label', 'Message')}</label>
                        <Textarea value={body} rows={5} maxLength={5000} onChange={(e) => setBody(e.target.value)} placeholder={t('admin.body_placeholder', 'Write what the user should read')} />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        onClick={handleSend}
                        className="w-full h-12 rounded-xl font-bold"
                        disabled={sending || !title.trim() || !body.trim() || !targets.length}
                    >
                        <Send className="h-4 w-4 me-2" />
                        {t('admin.send_notification')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
