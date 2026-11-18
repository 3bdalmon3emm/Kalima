import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Ban, ChevronLeft, Copy, LogOut, Minimize, RotateCcw, Save, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { adminApi, formatMark, teacherApi } from '@/components/admin/exams/api';
import ReopenDialog from '@/components/exams/ReopenDialog';
import { passageNumbers } from '@/components/exams/api';
import { ReviewItem } from '@/pages/exams/ExamResultPage';
import AppealCard from '@/components/exams/AppealCard';

// One attempt for the grader: the student's answers next to the right ones,
// and a mark box (in halves) under every essay. The teacher (or assistant)
// sees the same page for the students of their own links. The admin can
// also cancel a question here for the whole exam, which reaches questions a
// random redo drew that the exam's questions tab does not list.
export default function ExamAttemptReviewPage({ teacher = false }) {
    const { id } = useParams();
    const { t } = useTranslation('exams');
    const api = teacher ? teacherApi : adminApi;
    const [data, setData] = useState(null);
    const [reopen, setReopen] = useState(false);
    const [marks, setMarks] = useState({});
    const [saving, setSaving] = useState(false);

    const take = (d) => {
        setData(d);
        setMarks(Object.fromEntries(d.review.filter((r) => r.question?.type === 'essay').map((r) => [r.question_id, r.earned === null ? '' : String(r.earned)])));
    };
    useEffect(() => { api.get(`/attempts/${id}`).then(take).catch((err) => showError(err, t('errors.load'))); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const passages = useMemo(() => new Map((data?.passages || []).map((p) => [p.id, p])), [data]);
    const passageInfo = useMemo(() => {
        const byId = new Map((data?.review || []).map((r) => [r.question_id, r.question?.passage_id]));
        return passageNumbers([...byId.keys()], (qid) => byId.get(qid));
    }, [data]);

    if (!data) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

    const essays = data.review.filter((r) => r.question?.type === 'essay');
    const invalid = (r) => {
        const v = marks[r.question_id];
        if (v === '' || v === undefined) return false;
        const n = Number(v);
        return !Number.isFinite(n) || n < 0 || n > r.mark || !Number.isInteger(n * 2);
    };
    const changed = essays.filter((r) => marks[r.question_id] !== '' && marks[r.question_id] !== undefined && Number(marks[r.question_id]) !== r.earned);
    const left = essays.filter((r) => marks[r.question_id] === '' || marks[r.question_id] === undefined).length;

    const save = async () => {
        if (essays.some(invalid)) { toast.error(t('grading.invalid')); return; }
        setSaving(true);
        try {
            const res = await api.send('put', `/attempts/${id}/grades`, { grades: changed.map((r) => ({ question_id: r.question_id, mark: Number(marks[r.question_id]) })) });
            take(res.data);
            toast.success(res.data.status === 'done' ? t('grading.done') : t('grading.saved'));
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setSaving(false);
        }
    };

    const cancelBox = (r) => {
        const undo = r.cancelled;
        const run = async () => {
            if (!window.confirm(t(undo ? 'cancel.restoreConfirm' : 'cancel.confirm'))) return;
            try {
                const res = await api.send(undo ? 'delete' : 'post', `/exams/${data.exam.id}/questions/${r.question_id}/cancel`);
                toast.success(t(undo ? 'cancel.restored' : 'cancel.done', { count: res.data.attempts }));
                take(await api.get(`/attempts/${id}`));
            } catch (err) {
                showError(err, t('errors.save'));
            }
        };
        return (
            <div className="mx-4 mb-4 flex justify-end">
                <Button size="sm" variant="outline" onClick={run}>
                    {undo ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4 text-orange-600" />}
                    {t(undo ? 'cancel.restore' : 'cancel.button')}
                </Button>
            </div>
        );
    };

    const gradeBox = (r) => (
        <div className={`mx-4 mb-4 flex flex-wrap items-center gap-3 rounded-lg border-2 p-3 ${invalid(r) ? 'border-destructive' : 'border-primary/40 bg-primary/5'}`}>
            <span className="text-sm font-semibold">{t('grading.mark')}</span>
            <Input
                type="number"
                min={0}
                max={r.mark}
                step={0.5}
                className="h-9 w-24 text-center text-base font-bold"
                value={marks[r.question_id] ?? ''}
                onChange={(e) => setMarks((m) => ({ ...m, [r.question_id]: e.target.value }))}
            />
            <span className="text-sm text-muted-foreground">/ {formatMark(r.mark)}</span>
            <div className="flex flex-wrap gap-1">
                {[0, r.mark / 2, r.mark].filter((v, i, all) => Number.isInteger(v * 2) && all.indexOf(v) === i).map((v) => (
                    <Button key={v} type="button" size="sm" variant="outline" className="h-8" onClick={() => setMarks((m) => ({ ...m, [r.question_id]: String(v) }))}>
                        {formatMark(v)}
                    </Button>
                ))}
            </div>
            <span className="text-xs text-muted-foreground">{t('grading.halves')}</span>
        </div>
    );

    return (
        <div className="space-y-5 pb-24">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <Link to={teacher ? '/teacher/exams' : '/admin/exams'} className="hover:text-foreground">{teacher ? t('teacher.title') : t('title')}</Link>
                <ChevronLeft className="h-4 w-4" />
                <Link to={teacher ? `/teacher/exams/${data.exam.id}` : `/admin/exams/${data.exam.id}?tab=results`} className="hover:text-foreground">{data.exam.name}</Link>
            </nav>

            <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted">
                    {data.student?.profile_pic_url ? <img src={data.student.profile_pic_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-6 w-6 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold">{data.student?.name}</p>
                    <p className="text-sm text-muted-foreground">
                        {data.student?.serial && <span dir="ltr">#{data.student.serial} · </span>}
                        {t('results.attempt')} {data.attempt_no}
                        {data.link.teacher && <> · {data.link.teacher}</>}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t(`results.state.${data.status}`)}</Badge>
                    {data.score !== null && <Badge className={data.band === 'fail' ? 'bg-destructive' : 'bg-green-600'}>{formatMark(data.score)} / {formatMark(data.total)} ({data.percent}%)</Badge>}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={t('results.tabLeaves')}><LogOut className="h-3.5 w-3.5" />{data.tab_leaves}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={t('results.fullscreenExits')}><Minimize className="h-3.5 w-3.5" />{data.fullscreen_exits}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={t('results.copyAttempts')}><Copy className="h-3.5 w-3.5" />{data.copy_attempts}</span>
                    <Button size="sm" variant="outline" onClick={() => setReopen(true)}><RotateCcw className="h-4 w-4" />{t('reopen.button')}</Button>
                </div>
            </div>

            {data.status === 'in_progress' && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{t('grading.running')}</p>}

            <div className="space-y-3">
                {data.review.map((r, i) => {
                    const pid = r.question?.passage_id;
                    const first = pid && data.review[i - 1]?.question?.passage_id !== pid;
                    return (
                        <ReviewItem
                            key={r.question_id}
                            item={r}
                            label={String(i + 1)}
                            passage={first ? passages.get(pid) : null}
                            passageN={passageInfo.get(r.question_id)?.n}
                            shown
                            grader
                            extra={(
                                <>
                                    {r.question?.type === 'essay' && data.status !== 'in_progress' && gradeBox(r)}
                                    {(r.appeals || []).map((a) => (
                                        <AppealCard key={a.id} appeal={a} max={r.mark} grader
                                            decide={async (body) => (await api.send('post', `/appeals/${a.id}/decision`, body)).data}
                                            onDecided={() => api.get(`/attempts/${id}`).then(take)} />
                                    ))}
                                    {!teacher && data.status !== 'in_progress' && cancelBox(r)}
                                </>
                            )}
                        />
                    );
                })}
            </div>

            <ReopenDialog open={reopen} onOpenChange={setReopen} studentName={data.student?.name} send={(body) => api.send('post', `/attempts/${id}/reopen`, body)} />

            {essays.length > 0 && data.status !== 'in_progress' && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
                    <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
                        <span className="flex-1 text-sm text-muted-foreground">{left ? t('grading.left', { count: left }) : t('grading.allMarked')}</span>
                        <Button onClick={save} disabled={saving || !changed.length}>{saving ? <LoadingSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}{t('grading.save')}</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
