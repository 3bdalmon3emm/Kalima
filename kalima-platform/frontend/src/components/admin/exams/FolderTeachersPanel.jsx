import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, FileArchive, Plus, Trash2, UserRound, Users } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import TeacherAssignDialog from './TeacherAssignDialog';
import { ex, exGet, exSend } from './api';

export const formatDate = (v) => (v ? new Date(v).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function TeacherAvatar({ teacher, className = 'h-9 w-9' }) {
    return (
        <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ${className}`}>
            {teacher?.profile_pic_url ? <img src={teacher.profile_pic_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
        </span>
    );
}

// Teachers added on a folder: each one gets a link on every exam inside it,
// now and later. The ZIP holds the QR of every one of those links.
export default function FolderTeachersPanel({ folder }) {
    const { t } = useTranslation('exams');
    const [rows, setRows] = useState(null);
    const [dialog, setDialog] = useState(null);
    const [zipping, setZipping] = useState(null);

    const load = () => exGet(`/folders/${folder.id}/teachers`).then(setRows).catch((err) => showError(err, t('errors.load')));
    useEffect(() => { setRows(null); load(); }, [folder.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const zip = async (row) => {
        setZipping(row.id);
        try {
            const res = await axios.get(ex(`/folders/${folder.id}/teachers/${row.teacher.id}/qr.zip`), { responseType: 'blob' });
            const href = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = href;
            a.download = `${folder.name} - ${row.teacher.name}.zip`.replace(/[\\/:*?"<>|]+/g, ' ');
            a.click();
            URL.revokeObjectURL(href);
        } catch {
            toast.error(t('teachers.zipEmpty'));
        } finally {
            setZipping(null);
        }
    };

    const remove = async (row) => {
        if (!window.confirm(t('teachers.removeConfirm', { name: row.teacher.name }))) return;
        try {
            await exSend('delete', `/teacher-assignments/${row.id}`);
            toast.success(t('teachers.removed'));
            load();
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };

    return (
        <section className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5 text-primary" />{t('teachers.folderTitle')}</h2>
                    <p className="text-xs text-muted-foreground">{t('teachers.folderHint')}</p>
                </div>
                {!folder.hidden && <Button size="sm" onClick={() => setDialog({ type: 'add' })}><Plus className="h-4 w-4" />{t('teachers.add')}</Button>}
            </div>
            {!rows ? <div className="flex justify-center py-4"><LoadingSpinner /></div>
                : rows.length === 0 ? <p className="py-3 text-center text-sm text-muted-foreground">{t('teachers.none')}</p>
                    : (
                        <div className="divide-y">
                            {rows.map((row) => (
                                <div key={row.id} className="flex flex-wrap items-center gap-3 py-2">
                                    <TeacherAvatar teacher={row.teacher} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">{row.teacher.name}</p>
                                        <p className="text-xs text-muted-foreground">{formatDate(row.starts_at)} ← {formatDate(row.ends_at)}</p>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button variant="outline" size="sm" onClick={() => zip(row)} disabled={zipping === row.id}>
                                            {zipping === row.id ? <LoadingSpinner className="h-4 w-4" /> : <FileArchive className="h-4 w-4" />}{t('teachers.zip')}
                                        </Button>
                                        <Button variant="ghost" size="icon" title={t('teachers.editDates')} onClick={() => setDialog({ type: 'dates', row })}><CalendarClock className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" title={t('teachers.remove')} onClick={() => remove(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
            <TeacherAssignDialog
                open={dialog?.type === 'add'}
                onOpenChange={(o) => !o && setDialog(null)}
                onSubmit={async (body) => {
                    try { await exSend('post', `/folders/${folder.id}/teachers`, body); toast.success(t('teachers.added')); load(); } catch (err) { showError(err, t('errors.save')); throw err; }
                }}
            />
            <TeacherAssignDialog
                open={dialog?.type === 'dates'}
                onOpenChange={(o) => !o && setDialog(null)}
                teacher={dialog?.row?.teacher}
                initial={dialog?.row}
                title={t('teachers.editDates')}
                onSubmit={async ({ starts_at, ends_at }) => {
                    try { await exSend('patch', `/teacher-assignments/${dialog.row.id}`, { starts_at, ends_at }); toast.success(t('teachers.saved')); load(); } catch (err) { showError(err, t('errors.save')); throw err; }
                }}
            />
        </section>
    );
}
