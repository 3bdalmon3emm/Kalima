import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, FileArchive, Plus, Trash2, UserRound, Users } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import TeacherAssignDialog from './TeacherAssignDialog';
import { ex, exGet, exSend } from './api';
import Pager, { usePagedList } from '@/components/exams/Pager';

export const formatDate = (v) => (v ? new Date(v).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// A teacher matches a search by name, email or phone.
export const teacherMatches = (teacher, term) => {
    const needle = term.trim().toLowerCase();
    return !needle || [teacher?.name, teacher?.email, teacher?.phone].some((v) => v && String(v).toLowerCase().includes(needle));
};

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
    const [dialog, setDialog] = useState(null);
    const [zipping, setZipping] = useState(null);
    const list = usePagedList(({ q, page }) => exGet(`/folders/${folder.id}/teachers`, { q, page }), [folder.id], (err) => showError(err, t('errors.load')));
    const { term, setTerm, data, reload: load } = list;
    const rows = data?.items;
    const shown = rows;

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
            {(data?.total > 0 || !!list.q) && (
                <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('teachers.searchTeachers')} />
            )}
            {!rows ? <div className="flex justify-center py-4"><LoadingSpinner /></div>
                : shown.length === 0 ? <p className="py-3 text-center text-sm text-muted-foreground">{t(list.q ? 'search.none' : 'teachers.none')}</p>
                    : (
                        <div className="divide-y">
                            {shown.map((row) => (
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
            <Pager data={data} onPage={list.setPage} />
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

// The folder's teachers in a side list (from the folder page or a folder
// card's menu), so a long list never pushes the exams down.
export function FolderTeachersDialog({ folder, open, onOpenChange }) {
    const { t, i18n } = useTranslation('exams');
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            {/* Like the cart: slide in and out from the page's end side (left in Arabic, right in English). */}
            <SheetContent side={i18n.dir() === 'rtl' ? 'left' : 'right'} className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader><SheetTitle>{folder?.name}</SheetTitle><SheetDescription className="sr-only">{t('teachers.folderTitle')}</SheetDescription></SheetHeader>
                <div className="px-4 pb-6">{folder && <FolderTeachersPanel folder={folder} />}</div>
            </SheetContent>
        </Sheet>
    );
}

// Adds a teacher on a folder straight from its card's menu.
export function AddFolderTeacherDialog({ folder, open, onOpenChange }) {
    const { t } = useTranslation('exams');
    return (
        <TeacherAssignDialog
            open={open}
            onOpenChange={onOpenChange}
            title={folder ? `${t('teachers.add')} - ${folder.name}` : undefined}
            onSubmit={async (body) => {
                try { await exSend('post', `/folders/${folder.id}/teachers`, body); toast.success(t('teachers.added')); } catch (err) { showError(err, t('errors.save')); throw err; }
            }}
        />
    );
}
