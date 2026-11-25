import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import LoadingSpinner from '@/components/ui/loading-spinner';

// Asks staff why before an action (return an order, remove an item, change
// an account's level, cancel an e-booklet order). The reason is required and
// shown to staff only. onConfirm(reason) may return a promise; the dialog
// closes when it resolves to anything but false.
export default function ReasonDialog({ open, onOpenChange, title, description, confirmLabel, destructive = false, onConfirm }) {
    const { t } = useTranslation('staffLog');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (open) setReason(''); }, [open]);

    const submit = async () => {
        if (reason.trim().length < 3) return;
        setBusy(true);
        try {
            const ok = await onConfirm(reason.trim());
            if (ok !== false) onOpenChange(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('reason.label')} <span className="text-destructive">*</span></label>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t('reason.placeholder')} autoFocus />
                    <p className="text-xs text-muted-foreground">{t('reason.hint')}</p>
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('reason.cancel')}</Button>
                    <Button variant={destructive ? 'destructive' : 'default'} onClick={submit} disabled={busy || reason.trim().length < 3}>
                        {busy && <LoadingSpinner className="h-4 w-4" />}{confirmLabel || t('reason.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
