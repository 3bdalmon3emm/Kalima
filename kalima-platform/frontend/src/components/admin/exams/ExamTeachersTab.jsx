import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, Copy, Lock, LockOpen, Plus, QrCode, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import LinkQrDialog from '@/components/exams/LinkQrDialog';
import TeacherAssignDialog from './TeacherAssignDialog';
import { TeacherAvatar, formatDate } from './FolderTeachersPanel';
import { ex, examLink, exGet, exSend } from './api';

export const STATE_STYLE = {
    open: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    not_started: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    ended: 'bg-muted text-muted-foreground',
    closed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    not_published: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    archived: 'bg-muted text-muted-foreground',
    missing: 'bg-muted text-muted-foreground',
};

// Every teacher who has this exam (added on it or on a folder above it), with
// their own link: copy, QR, close/open, and dates that differ from the rest.
export default function ExamTeachersTab({ exam }) {
    const { t } = useTranslation('exams');
    const [rows, setRows] = useState(null);
    const [dialog, setDialog] = useState(null);

    const load = () => exGet(`/exams/${exam.id}/teachers`).then(setRows).catch((err) => showError(err, t('errors.load')));
    useEffect(() => { load(); }, [exam.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const act = async (fn, message) => {
        try {
            await fn();
            if (message) toast.success(message);
            load();
        } catch (err) {
            showError(err, t('errors.save'));
            throw err;
        }
    };

    if (!rows) return <div className="flex justify-center py-10"><LoadingSpinner /></div>;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{t('teachers.examHint')}</p>
                {!exam.archived_at && <Button size="sm" onClick={() => setDialog({ type: 'add' })}><Plus className="h-4 w-4" />{t('teachers.addOnExam')}</Button>}
            </div>
            {!exam.published_at && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{t('teachers.notPublishedHint')}</p>}
            {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">{t('teachers.none')}</p>
            ) : (
                <div className="space-y-3">
                    {rows.map((row) => (
                        <div key={row.teacher.id} className="space-y-3 rounded-lg border bg-card p-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <TeacherAvatar teacher={row.teacher} className="h-10 w-10" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold">{row.teacher.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {row.source.type === 'exam' ? t('teachers.sourceExam')
                                            : <>{t('teachers.sourceFolder')} <Link className="underline" to={`/admin/exams/folders/${row.source.folder_id}`}>{row.source.name}</Link></>}
                                    </p>
                                </div>
                                <Badge className={STATE_STYLE[row.state]}>{t(`teachers.states.${row.state}`)}</Badge>
                            </div>
                            {row.link && (
                                <>
                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                        <code className="max-w-full truncate rounded bg-muted px-2 py-1" dir="ltr">{examLink(row.link.code)}</code>
                                        <span className="text-muted-foreground">{formatDate(row.link.starts_at)} ← {formatDate(row.link.ends_at)}</span>
                                        {row.link.dates_custom && <Badge variant="outline">{t('teachers.customDates')}</Badge>}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(examLink(row.link.code)); toast.success(t('testLink.copied')); }}>
                                            <Copy className="h-4 w-4" />{t('testLink.copy')}
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => setDialog({ type: 'qr', row })}><QrCode className="h-4 w-4" />QR</Button>
                                        <Button variant="outline" size="sm" onClick={() => setDialog({ type: 'linkDates', row })}><CalendarClock className="h-4 w-4" />{t('teachers.linkDates')}</Button>
                                        {row.link.dates_custom && (
                                            <Button variant="ghost" size="sm" onClick={() => act(() => exSend('patch', `/links/${row.link.id}`, { reset_dates: true }), t('teachers.saved')).catch(() => {})}>
                                                <RotateCcw className="h-4 w-4" />{t('teachers.resetDates')}
                                            </Button>
                                        )}
                                        {row.link.closed_at ? (
                                            <Button variant="outline" size="sm" onClick={() => act(() => exSend('patch', `/links/${row.link.id}`, { closed: false }), t('teachers.opened')).catch(() => {})}>
                                                <LockOpen className="h-4 w-4" />{t('teachers.open')}
                                            </Button>
                                        ) : (
                                            <Button variant="outline" size="sm" className="text-destructive" onClick={() => act(() => exSend('patch', `/links/${row.link.id}`, { closed: true }), t('teachers.closed')).catch(() => {})}>
                                                <Lock className="h-4 w-4" />{t('teachers.close')}
                                            </Button>
                                        )}
                                        {row.source.type === 'exam' ? (
                                            <Button variant="ghost" size="sm" className="text-destructive"
                                                onClick={() => window.confirm(t('teachers.removeConfirm', { name: row.teacher.name })) && act(() => exSend('delete', `/teacher-assignments/${row.assignment_id}`), t('teachers.removed')).catch(() => {})}>
                                                <Trash2 className="h-4 w-4" />{t('teachers.remove')}
                                            </Button>
                                        ) : (
                                            // Added through a folder: removing takes the teacher off that whole folder.
                                            <Button variant="ghost" size="sm" className="text-destructive"
                                                onClick={() => window.confirm(t('teachers.removeFolderConfirm', { name: row.teacher.name, folder: row.source.name })) && act(() => exSend('delete', `/teacher-assignments/${row.assignment_id}`), t('teachers.removed')).catch(() => {})}>
                                                <Trash2 className="h-4 w-4" />{t('teachers.removeFromFolder')}
                                            </Button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <TeacherAssignDialog
                open={dialog?.type === 'add'}
                onOpenChange={(o) => !o && setDialog(null)}
                onSubmit={(body) => act(() => exSend('post', `/exams/${exam.id}/teachers`, body), t('teachers.added'))}
            />
            <TeacherAssignDialog
                open={dialog?.type === 'linkDates'}
                onOpenChange={(o) => !o && setDialog(null)}
                teacher={dialog?.row?.teacher}
                initial={dialog?.row?.link}
                title={t('teachers.linkDates')}
                onSubmit={({ starts_at, ends_at }) => act(() => exSend('patch', `/links/${dialog.row.link.id}`, { starts_at, ends_at }), t('teachers.saved'))}
            />
            <LinkQrDialog
                open={dialog?.type === 'qr'}
                onOpenChange={(o) => !o && setDialog(null)}
                code={dialog?.row?.link?.code}
                pngPath={dialog?.row?.link && ex(`/links/${dialog.row.link.id}/qr.png`)}
                fileName={dialog?.row ? `${exam.name} - ${dialog.row.teacher.name}` : 'qr'}
            />
        </div>
    );
}
