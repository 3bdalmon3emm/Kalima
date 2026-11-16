import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock, FileQuestion, Hourglass, Maximize, Trophy, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { translateBackendMessage } from '@/lib/utils';
import { examGet, examSend, requestFullscreen, setAttemptToken } from '@/components/exams/api';
import { formatMark } from '@/components/admin/exams/api';

// The start page of an exam link: who gives it, what it is, the student's
// past attempts, and the button to start, resume or redo.
export default function ExamStartPage() {
    const { code } = useParams();
    const { t, i18n } = useTranslation('exams');
    const navigate = useNavigate();
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        examGet(`/links/${code}`).then(setInfo).catch((err) => setError(translateBackendMessage(err.response?.data?.message) || t('errors.load')));
    }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

    const go = async () => {
        requestFullscreen();
        setStarting(true);
        try {
            if (info.next.action === 'resume') {
                navigate(`/e/${code}/attempt/${info.next.attempt_id}`);
                return;
            }
            const attempt = await examSend('post', `/links/${code}/start`);
            setAttemptToken(attempt.id, attempt.session_token);
            navigate(`/e/${code}/attempt/${attempt.id}`);
        } catch (err) {
            setError(translateBackendMessage(err.response?.data?.message) || t('errors.save'));
            setStarting(false);
        }
    };

    const dateText = (d) => new Date(d).toLocaleString(i18n.language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    if (error && !info) return <div className="mx-auto max-w-xl p-8 text-center text-destructive">{error}</div>;
    if (!info) return <div className="flex justify-center py-24"><LoadingSpinner /></div>;
    const { exam, teacher } = info;
    const action = info.next.action;

    return (
        <div className="min-h-screen bg-muted/30" dir={i18n.dir()}>
            <div className="mx-auto max-w-3xl pb-12">
                <div className="relative">
                    <div className="h-40 sm:h-56 bg-gradient-to-l from-primary/80 via-primary/60 to-primary/30 sm:rounded-b-2xl" />
                    <div className="absolute -bottom-12 start-6 flex items-end gap-4">
                        <div className="h-24 w-24 rounded-full border-4 border-background bg-muted overflow-hidden flex items-center justify-center shadow">
                            {teacher?.profile_pic_url
                                ? <img src={teacher.profile_pic_url} alt="" className="h-full w-full object-cover" />
                                : <UserRound className="h-12 w-12 text-muted-foreground" />}
                        </div>
                        <p className="mb-2 font-semibold text-lg">{teacher?.name || t('start.testLink')}</p>
                    </div>
                </div>

                <div className="mt-16 px-4 sm:px-6 space-y-6">
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-bold">{exam.name}</h1>
                            <Badge variant="secondary">{t(`types.${exam.type}`)}</Badge>
                            {exam.subject && <Badge variant="outline">{exam.subject.title}</Badge>}
                        </div>
                        {exam.description && <p className="text-muted-foreground whitespace-pre-line">{exam.description}</p>}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg border bg-card p-3"><Clock className="h-5 w-5 text-primary mb-1" /><p className="text-xs text-muted-foreground">{t('start.duration')}</p><p className="font-semibold">{exam.duration_minutes ? t('start.minutes', { count: exam.duration_minutes }) : t('start.noDuration')}</p></div>
                        <div className="rounded-lg border bg-card p-3"><Trophy className="h-5 w-5 text-primary mb-1" /><p className="text-xs text-muted-foreground">{t('start.total')}</p><p className="font-semibold">{formatMark(exam.total)}</p></div>
                        <div className="rounded-lg border bg-card p-3"><FileQuestion className="h-5 w-5 text-primary mb-1" /><p className="text-xs text-muted-foreground">{t('start.questions')}</p><p className="font-semibold">{exam.question_count}</p></div>
                    </div>

                    <p className="text-sm text-muted-foreground">{t('start.window', { start: dateText(info.starts_at), end: dateText(info.ends_at) })}</p>

                    {info.attempts.length > 0 && (
                        <div className="space-y-2">
                            <h2 className="font-semibold">{t('start.yourAttempts')}</h2>
                            {info.attempts.map((a) => (
                                <Link key={a.id} to={a.status === 'in_progress' ? '#' : `/e/${code}/result/${a.id}`} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm hover:border-primary/50">
                                    <span>{t('start.attemptNo', { n: a.attempt_no })}</span>
                                    <span className="font-medium">
                                        {a.status === 'done' ? `${formatMark(a.score)} / ${formatMark(a.total)}` : t(`status.${a.status}`)}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}

                    {info.state !== 'open' && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{t(`start.state.${info.state}`)}</div>
                    )}
                    {info.state === 'open' && action === 'wait' && (
                        <div className="rounded-lg border bg-card p-4 flex items-center gap-2"><Hourglass className="h-5 w-5 text-primary" />{t('start.waitGrading')}</div>
                    )}
                    {info.state === 'open' && action === 'none' && info.attempts.length > 0 && (
                        <div className="rounded-lg border bg-card p-4">{t('start.finished')}</div>
                    )}

                    {['start', 'resume', 'redo'].includes(action) && (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm flex gap-2">
                                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                                <span>{t('start.warning')}</span>
                            </div>
                            {action === 'redo' && info.next.required && <p className="text-sm font-medium text-amber-600">{t('start.redoRequired')}</p>}
                            {error && <p className="text-sm text-destructive">{error}</p>}
                            <Button size="lg" className="w-full sm:w-auto" onClick={go} disabled={starting}>
                                {starting ? <LoadingSpinner className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                                {t(`start.${action}`)}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
