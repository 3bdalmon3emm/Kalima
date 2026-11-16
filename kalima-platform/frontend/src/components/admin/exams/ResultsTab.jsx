import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, LogOut, Minimize, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { exGet, formatMark } from './api';

const FILTERS = ['all', 'pending', 'done', 'in_progress'];

// Leaving the page, leaving full screen and copy attempts: grey at zero, red
// once it happened.
function Counter({ icon: Icon, value, title }) {
    return (
        <span title={title} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${value ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' : 'text-muted-foreground'}`}>
            <Icon className="h-3.5 w-3.5" />{value}
        </span>
    );
}

// Every attempt at the exam: the student, the score, how often they left the
// page or full screen or tried to copy, and a link to grade or review it.
export default function ResultsTab({ exam }) {
    const { t, i18n } = useTranslation('exams');
    const [filter, setFilter] = useState('all');
    const [data, setData] = useState(null);

    useEffect(() => {
        let cancelled = false;
        exGet(`/exams/${exam.id}/attempts`, filter === 'all' ? {} : { status: filter })
            .then((d) => !cancelled && setData({ ...d, filter }))
            .catch((err) => { if (!cancelled) { setData({ attempts: [], counts: {}, filter }); showError(err, t('errors.load')); } });
        return () => { cancelled = true; };
    }, [exam.id, filter]); // eslint-disable-line react-hooks/exhaustive-deps

    const when = (d) => (d ? new Date(d).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
    const total = Object.values(data?.counts || {}).reduce((s, n) => s + n, 0);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                    <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
                        {t(`results.filter.${f}`)}
                        <span className="opacity-70">({f === 'all' ? total : data?.counts?.[f] || 0})</span>
                    </Button>
                ))}
            </div>

            {data?.filter !== filter ? <div className="flex justify-center py-10"><LoadingSpinner /></div> : !data.attempts.length ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t('results.empty')}</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                                <th className="p-2 text-start font-medium">{t('results.student')}</th>
                                <th className="p-2 text-start font-medium">{t('results.attempt')}</th>
                                <th className="p-2 text-start font-medium">{t('results.status')}</th>
                                <th className="p-2 text-start font-medium">{t('results.score')}</th>
                                <th className="p-2 text-start font-medium">{t('results.submitted')}</th>
                                <th className="p-2 text-start font-medium">{t('results.behaviour')}</th>
                                <th className="p-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {data.attempts.map((a) => (
                                <tr key={a.id} className="border-t align-middle">
                                    <td className="p-2">
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                                                {a.student?.profile_pic_url ? <img src={a.student.profile_pic_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
                                            </div>
                                            <div className="min-w-0 leading-tight">
                                                <p className="truncate font-medium">{a.student?.name || '—'}</p>
                                                <p className="text-xs text-muted-foreground" dir="ltr">{a.student?.serial ? `#${a.student.serial}` : ''}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-2 tabular-nums">{a.attempt_no}</td>
                                    <td className="p-2">
                                        <Badge variant="outline" className={a.status === 'pending' ? 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : a.status === 'done' ? 'border-green-400 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300' : ''}>
                                            {t(`results.state.${a.status}`)}
                                        </Badge>
                                        {a.auto_submitted && <p className="mt-0.5 text-[11px] text-muted-foreground">{t('results.autoSubmitted')}</p>}
                                    </td>
                                    <td className="p-2 tabular-nums">
                                        {a.score === null ? '—' : (
                                            <span className={a.band === 'fail' ? 'font-semibold text-destructive' : 'font-semibold'}>
                                                {formatMark(a.score)} / {formatMark(a.total)} <span className="text-xs text-muted-foreground">({a.percent}%)</span>
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-2 text-xs text-muted-foreground">{when(a.submitted_at)}</td>
                                    <td className="p-2">
                                        <div className="flex gap-1">
                                            <Counter icon={LogOut} value={a.tab_leaves} title={t('results.tabLeaves')} />
                                            <Counter icon={Minimize} value={a.fullscreen_exits} title={t('results.fullscreenExits')} />
                                            <Counter icon={Copy} value={a.copy_attempts} title={t('results.copyAttempts')} />
                                        </div>
                                    </td>
                                    <td className="p-2 text-end">
                                        <Button size="sm" variant={a.status === 'pending' ? 'default' : 'outline'} asChild>
                                            <Link to={`/admin/exams/attempts/${a.id}`}>{a.status === 'pending' ? t('results.grade') : t('results.open')}</Link>
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><LogOut className="h-3.5 w-3.5" />{t('results.tabLeaves')}</span>
                <span className="inline-flex items-center gap-1"><Minimize className="h-3.5 w-3.5" />{t('results.fullscreenExits')}</span>
                <span className="inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" />{t('results.copyAttempts')}</span>
            </p>
        </div>
    );
}
