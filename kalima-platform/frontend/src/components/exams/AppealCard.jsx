import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, MessageSquareWarning, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { formatMark } from '@/components/admin/exams/api';
import { Media } from '@/components/exams/QuestionView';

export const APPEAL_STYLE = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    accepted: 'bg-green-600 text-white',
    rejected: 'bg-red-600 text-white',
};

const when = (value, lang) => new Date(value).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

// One appeal: what the student wrote and sent, and the answer once given.
// With `decide` (the teacher, assistant or admin), a waiting appeal gets
// accept with a new mark in halves, or reject with a reason.
export default function AppealCard({ appeal, max, decide, onDecided, grader = false }) {
    const { t, i18n } = useTranslation('exams');
    const [mode, setMode] = useState(null);
    const [mark, setMark] = useState('');
    const [reply, setReply] = useState('');
    const [busy, setBusy] = useState(false);

    const markValue = Number(mark);
    const markOk = mark !== '' && Number.isFinite(markValue) && markValue >= 0 && markValue <= max && Number.isInteger(markValue * 2);

    const submit = async () => {
        if (mode === 'accept' && !markOk) { toast.error(t('grading.invalid')); return; }
        if (mode === 'reject' && !reply.trim()) { toast.error(t('appeals.reasonRequired')); return; }
        setBusy(true);
        try {
            const res = await decide(mode === 'accept' ? { accept: true, mark: markValue, reply } : { accept: false, reply });
            toast.success(t(mode === 'accept' ? 'appeals.acceptedToast' : 'appeals.rejectedToast'));
            setMode(null);
            onDecided?.(res);
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2 rounded-lg border-2 border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/20">
            <div className="flex flex-wrap items-center gap-2">
                <MessageSquareWarning className="h-4 w-4 text-amber-600" />
                <span className="font-semibold">{grader ? t('appeals.studentAppeal') : t('appeals.yourAppeal')}</span>
                <Badge className={APPEAL_STYLE[appeal.status]}>{t(`appeals.status.${appeal.status}`)}</Badge>
                <span className="ms-auto text-xs text-muted-foreground">{when(appeal.created_at, i18n.language)}</span>
            </div>
            {appeal.text && <p className="whitespace-pre-wrap">{appeal.text}</p>}
            {appeal.images?.length > 0 && (
                <div className="flex flex-wrap gap-2">{appeal.images.map((url) => <Media key={url} image={{ url }} className="max-h-40" />)}</div>
            )}

            {appeal.status !== 'pending' && (
                <div className={`rounded-md border p-2 ${appeal.status === 'accepted' ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30' : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'}`}>
                    <p className="font-medium">
                        {appeal.status === 'accepted'
                            ? t('appeals.acceptedLine', { from: formatMark(appeal.old_mark), to: formatMark(appeal.new_mark), max: formatMark(max) })
                            : t('appeals.rejectedLine')}
                    </p>
                    {appeal.reply && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{appeal.reply}</p>}
                    {appeal.decided_at && <p className="mt-1 text-xs text-muted-foreground">{when(appeal.decided_at, i18n.language)}</p>}
                </div>
            )}

            {appeal.status === 'pending' && decide && !mode && (
                <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { setMode('accept'); setMark(String(max)); }}><Check className="h-4 w-4" />{t('appeals.accept')}</Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setMode('reject')}><X className="h-4 w-4" />{t('appeals.reject')}</Button>
                </div>
            )}

            {mode && (
                <div className="space-y-2 rounded-md border bg-background p-3">
                    {mode === 'accept' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{t('appeals.newMark')}</span>
                            <Input type="number" min={0} max={max} step={0.5} className={`h-9 w-24 text-center font-bold ${mark !== '' && !markOk ? 'border-destructive' : ''}`}
                                value={mark} onChange={(e) => setMark(e.target.value)} />
                            <span className="text-muted-foreground">/ {formatMark(max)}</span>
                            {[max / 2, max].filter((v, i, all) => Number.isInteger(v * 2) && all.indexOf(v) === i).map((v) => (
                                <Button key={v} type="button" size="sm" variant="outline" className="h-8" onClick={() => setMark(String(v))}>{formatMark(v)}</Button>
                            ))}
                            <span className="text-xs text-muted-foreground">{t('appeals.was', { mark: formatMark(appeal.old_mark) })}</span>
                        </div>
                    )}
                    <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)}
                        placeholder={mode === 'accept' ? t('appeals.noteOptional') : t('appeals.reason')} />
                    <div className="flex gap-2">
                        <Button size="sm" onClick={submit} disabled={busy}>
                            {busy && <LoadingSpinner className="h-4 w-4" />}{mode === 'accept' ? t('appeals.confirmAccept') : t('appeals.confirmReject')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setMode(null)} disabled={busy}>{t('appeals.cancel')}</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
