import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft, ChevronUp, FileText, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { adminApi, formatMark, teacherApi } from '@/components/admin/exams/api';
import AppealCard from '@/components/exams/AppealCard';
import { ReviewItem } from '@/pages/exams/ExamResultPage';

// Every appeal in one place: waiting ones first (oldest first), answered
// ones in their own tab. The teacher and assistant see their own links'
// appeals; the admin sees all of them.
export default function ExamAppealsPage({ teacher = false }) {
    const { t } = useTranslation('exams');
    const api = teacher ? teacherApi : adminApi;
    const [status, setStatus] = useState('pending');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [details, setDetails] = useState({});

    const load = () => api.get('/appeals', { status, page }).then(setData).catch((err) => showError(err, t('errors.load')));
    useEffect(() => { setData(null); load(); }, [status, page]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = async (id) => {
        if (openId === id) { setOpenId(null); return; }
        setOpenId(id);
        if (!details[id]) {
            try {
                const d = await api.get(`/appeals/${id}`);
                setDetails((all) => ({ ...all, [id]: d }));
            } catch (err) {
                showError(err, t('errors.load'));
            }
        }
    };

    const pages = useMemo(() => {
        if (!data) return 1;
        const total = status === 'pending' ? data.counts.pending : data.counts.answered;
        return Math.max(Math.ceil(total / data.page_size), 1);
    }, [data, status]);

    const base = teacher ? '/teacher/exams' : '/admin/exams';

    return (
        <div className="space-y-5">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <Link to={base} className="hover:text-foreground">{teacher ? t('teacher.title') : t('title')}</Link>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-foreground">{t('appeals.title')}</span>
            </nav>
            <div>
                <h1 className="text-2xl font-bold">{t('appeals.title')}</h1>
                <p className="text-sm text-muted-foreground">{t(teacher ? 'appeals.subtitleTeacher' : 'appeals.subtitleAdmin')}</p>
            </div>

            <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); setOpenId(null); }}>
                <TabsList>
                    <TabsTrigger value="pending">{t('appeals.tabPending')}{data ? ` (${data.counts.pending})` : ''}</TabsTrigger>
                    <TabsTrigger value="answered">{t('appeals.tabAnswered')}{data ? ` (${data.counts.answered})` : ''}</TabsTrigger>
                </TabsList>
            </Tabs>

            {!data ? <div className="flex justify-center py-16"><LoadingSpinner /></div>
                : data.appeals.length === 0 ? <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">{t(status === 'pending' ? 'appeals.noneWaiting' : 'appeals.noneAnswered')}</p>
                    : (
                        <div className="space-y-3">
                            {data.appeals.map((a) => {
                                const d = details[a.id];
                                return (
                                    <div key={a.id} className="space-y-3 rounded-xl border bg-card p-4">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                                                {a.student?.profile_pic_url ? <img src={a.student.profile_pic_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-muted-foreground" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold">{a.student?.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {a.student?.serial && <span dir="ltr">#{a.student.serial} · </span>}
                                                    {a.exam.name} · {t('appeals.questionN', { n: a.question.n })} · {t('results.attempt')} {a.attempt.attempt_no}
                                                    {!teacher && a.teacher && <> · {a.teacher}</>}
                                                </p>
                                            </div>
                                            <Badge variant="outline" dir="ltr">{t('appeals.score')} {formatMark(a.attempt.score)} / {formatMark(a.attempt.total)}</Badge>
                                            <Button size="sm" variant="outline" asChild>
                                                <Link to={`${base}/attempts/${a.attempt.id}`}><FileText className="h-4 w-4" />{t('appeals.paper')}</Link>
                                            </Button>
                                        </div>

                                        <AppealCard appeal={a} max={a.question.mark} grader
                                            decide={async (body) => (await api.send('post', `/appeals/${a.id}/decision`, body)).data}
                                            onDecided={() => { setDetails((all) => ({ ...all, [a.id]: undefined })); load(); }} />

                                        <Button variant="ghost" size="sm" onClick={() => toggle(a.id)}>
                                            {openId === a.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                            {t('appeals.showQuestion')}
                                        </Button>
                                        {openId === a.id && (d ? (d.item && (
                                            <ReviewItem item={{ ...d.item, appeals: [] }} label={String(a.question.n)} passage={d.passage} shown grader />
                                        )) : <div className="flex justify-center py-6"><LoadingSpinner /></div>)}
                                    </div>
                                );
                            })}
                            {pages > 1 && (
                                <div className="flex items-center justify-center gap-3">
                                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('appeals.prev')}</Button>
                                    <span className="text-sm text-muted-foreground">{page} / {pages}</span>
                                    <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t('appeals.next')}</Button>
                                </div>
                            )}
                        </div>
                    )}
        </div>
    );
}
