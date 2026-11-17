import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';

// Reopen the exam for one student: more attempts, more minutes (added to a
// running attempt, or kept for the next one) and/or a later end date.
export default function ReopenDialog({ open, onOpenChange, studentName, send }) {
    const { t } = useTranslation('exams');
    const [form, setForm] = useState({ extra_attempts: '1', extra_minutes: '', ends_at: '' });
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (open) setForm({ extra_attempts: '1', extra_minutes: '', ends_at: '' }); }, [open]);

    const submit = async () => {
        setSaving(true);
        try {
            await send({
                extra_attempts: Number(form.extra_attempts) || 0,
                extra_minutes: Number(form.extra_minutes) || 0,
                ...(form.ends_at && { ends_at: new Date(form.ends_at).toISOString() }),
            });
            toast.success(t('reopen.done'));
            onOpenChange(false);
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setSaving(false);
        }
    };

    const nothing = !Number(form.extra_attempts) && !Number(form.extra_minutes) && !form.ends_at;
    const field = (name, label, props) => (
        <div className="space-y-1">
            <Label>{label}</Label>
            <Input {...props} value={form[name]} onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))} />
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{t('reopen.title', { name: studentName || '' })}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    {field('extra_attempts', t('reopen.attempts'), { type: 'number', min: 0, max: 10 })}
                    {field('extra_minutes', t('reopen.minutes'), { type: 'number', min: 0, max: 600, placeholder: '0' })}
                    {field('ends_at', t('reopen.endsAt'), { type: 'datetime-local' })}
                    <p className="text-xs text-muted-foreground">{t('reopen.hint')}</p>
                </div>
                <DialogFooter>
                    <Button onClick={submit} disabled={saving || nothing}>{saving && <LoadingSpinner className="h-4 w-4" />}{t('reopen.submit')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
