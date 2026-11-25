import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { shiftsApi, fromLocalInput, toLocalInput } from './api';

// The Admin corrects a shift (times, or delete it) or adds a missed one.
// state: { shift, employee } to edit, or { add: true, employees, date } to add.
export default function ShiftDialog({ state, onClose, onSaved }) {
    const { t } = useTranslation('shifts');
    const [form, setForm] = useState({ user_id: '', start: '', end: '' });
    const [busy, setBusy] = useState(false);
    const editing = state?.shift;

    useEffect(() => {
        if (!state) return;
        if (editing) setForm({ user_id: String(state.employee?.id || ''), start: toLocalInput(editing.started_at), end: toLocalInput(editing.ended_at) });
        else setForm({ user_id: '', start: `${state.date}T09:00`, end: `${state.date}T17:00` });
    }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

    const save = async () => {
        if (!editing && !form.user_id) { toast.error(t('dialog.pickEmployee')); return; }
        if (!form.start || (!editing && !form.end)) { toast.error(t('dialog.fillTimes')); return; }
        setBusy(true);
        try {
            const body = { started_at: fromLocalInput(form.start), ended_at: form.end ? fromLocalInput(form.end) : null };
            if (editing) await shiftsApi.send('patch', `/${editing.id}`, body);
            else await shiftsApi.send('post', '/', { ...body, user_id: Number(form.user_id) });
            toast.success(t('dialog.saved'));
            onSaved();
            onClose();
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!window.confirm(t('dialog.deleteConfirm'))) return;
        setBusy(true);
        try {
            await shiftsApi.send('delete', `/${editing.id}`);
            toast.success(t('dialog.deleted'));
            onSaved();
            onClose();
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{editing ? t('dialog.editTitle') : t('dialog.addTitle')}</DialogTitle>
                    <DialogDescription>{editing ? state.employee?.name : t('dialog.addHint')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    {!editing && (
                        <div className="space-y-1.5">
                            <Label>{t('dialog.employee')}</Label>
                            <Select value={form.user_id} onValueChange={set('user_id')}>
                                <SelectTrigger><SelectValue placeholder={t('dialog.pickEmployee')} /></SelectTrigger>
                                <SelectContent>
                                    {(state?.employees || []).map((e) => <SelectItem key={e.user.id} value={String(e.user.id)}>{e.user.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label>{t('dialog.start')}</Label>
                        <Input type="datetime-local" value={form.start} onChange={set('start')} dir="ltr" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t('dialog.end')}</Label>
                        <Input type="datetime-local" value={form.end} onChange={set('end')} dir="ltr" />
                        {editing && <p className="text-xs text-muted-foreground">{t('dialog.endHint')}</p>}
                    </div>
                    {editing?.auto_closed && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{t('dialog.autoClosedNote')}</p>}
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                    {editing ? <Button variant="ghost" className="text-destructive" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />{t('dialog.delete')}</Button> : <span />}
                    <Button onClick={save} disabled={busy}>{busy && <LoadingSpinner className="h-4 w-4" />}{t('dialog.save')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
