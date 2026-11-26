import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Minus, TrendingDown, TrendingUp, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import Pager from './Pager';

// "My exams" for a student, and the same view of a child for their parent
// and of any student for the admin: the school year, the year at a glance,
// the performance indicator (one card per subject and type) and every exam
// taken with all its attempts, a page at a time. load(params) asks the
// server with { year, subject_id, type, page }; the year, subject and type
// are chosen on the server so the indicator and the summary cover every
// exam, not just the page. resultHref(row, attempt) says where an attempt
// opens; none means it does not open.

const ALL = 'all';

// "2026/2027", kept left to right inside Arabic text.
export const yearLabel = (y) => `\u2066${y}/${y + 1}\u2069`;

// A small line chart of the percents in date order, 0-100.
function LineChart({ points }) {
    const w = 280;
    const h = 90;
    const pad = 8;
    const x = (i) => (points.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (points.length - 1));
    const y = (p) => h - pad - (p / 100) * (h - 2 * pad);
    const line = points.map((p, i) => `${x(i)},${y(p.percent)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" role="img" dir="ltr">
            {[0, 50, 100].map((g) => (
                <line key={g} x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} className="stroke-border" strokeDasharray={g === 50 ? '3 3' : undefined} strokeWidth="1" />
            ))}
            {points.length > 1 && <polyline points={line} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
            {points.map((p, i) => (
                <circle key={i} cx={x(i)} cy={y(p.percent)} r="3.5" className="fill-primary">
                    <title>{`${p.name}: ${p.percent}%`}</title>
                </circle>
            ))}
        </svg>
    );
}

function Trend({ trend, t }) {
    const map = {
        up: { Icon: TrendingUp, cls: 'text-green-600 dark:text-green-400' },
        down: { Icon: TrendingDown, cls: 'text-destructive' },
        steady: { Icon: Minus, cls: 'text-muted-foreground' },
    };
    const { Icon, cls } = map[trend];
    return <span className={`inline-flex items-center gap-1 text-sm font-semibold ${cls}`}><Icon className="h-4 w-4" />{t(`mine.trend.${trend}`)}</span>;
}

export default function ExamsOverview({ load, resultHref }) {
    const { t, i18n } = useTranslation('exams');
    const [year, setYear] = useState(null);
    const [subject, setSubject] = useState(ALL);
    const [type, setType] = useState(ALL);
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const dateFmt = useMemo(() => new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), [i18n.language]);

    useEffect(() => {
        let cancelled = false;
        const params = { page, ...(year !== null && { year }), ...(subject !== ALL && { subject_id: subject }), ...(type !== ALL && { type }) };
        load(params).then((d) => !cancelled && setData(d)).catch((err) => { if (!cancelled) { setData((prev) => prev); showError(err, t('errors.load')); } });
        return () => { cancelled = true; };
    }, [year, subject, type, page]); // eslint-disable-line react-hooks/exhaustive-deps

    // Another year starts over with every subject; any new filter starts at
    // the first page.
    const onYear = (y) => { setYear(y); setSubject(ALL); setPage(1); };
    const onSubject = (v) => { setSubject(v); setPage(1); };
    const onType = (v) => { setType(v); setPage(1); };

    if (!data) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
    const subjects = (data.subjects || []).map((x) => [x.id, x.title ?? t('mine.noSubject')]);
    const { rows, indicators, summary } = data;

    const status = (a) => {
        if (a.status === 'in_progress') return <Badge variant="outline">{t('mine.running')}</Badge>;
        if (a.status === 'pending') return <Badge variant="outline">{t('result.waiting')}</Badge>;
        return null;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <Select value={String(data.year)} onValueChange={(v) => onYear(Number(v))}>
                    <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {(data.years.length ? data.years : [data.year]).map((y) => (
                            <SelectItem key={y} value={String(y)}>{t('mine.year', { year: yearLabel(y) })}{y === data.current_year ? ` · ${t('mine.currentYear')}` : ''}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={subject} onValueChange={onSubject}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>{t('mine.allSubjects')}</SelectItem>
                        {subjects.map(([id, title]) => <SelectItem key={id} value={String(id)}>{title}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={type} onValueChange={onType}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>{t('mine.allTypes')}</SelectItem>
                        <SelectItem value="exam">{t('types.exam')}</SelectItem>
                        <SelectItem value="homework">{t('types.homework')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {summary && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="overview-summary">
                    {[
                        [t('mine.summary.exams'), summary.exams],
                        [t('mine.summary.attempts'), summary.attempts],
                        [t('mine.summary.graded'), summary.graded],
                        [t('mine.summary.passed'), summary.passed, 'text-green-700 dark:text-green-400'],
                        [t('mine.summary.failed'), summary.failed, summary.failed ? 'text-destructive' : ''],
                        [t('mine.summary.average'), summary.average === null ? '—' : `${summary.average}%`],
                    ].map(([label, value, tone]) => (
                        <div key={label} className="rounded-lg border bg-card px-3 py-2">
                            <p className="text-[11px] text-muted-foreground">{label}</p>
                            <p className={`text-lg font-bold tabular-nums ${tone || ''}`}>{value}</p>
                        </div>
                    ))}
                </div>
            )}

            <section className="space-y-3">
                <h2 className="text-lg font-bold">{t('mine.indicator')}</h2>
                {indicators.length === 0 ? (
                    <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{t('mine.noIndicator')}</p>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {indicators.map((g) => (
                            <div key={`${g.subject?.id ?? 0}:${g.type}`} className="rounded-xl border bg-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-bold">{g.subject?.title ?? t('mine.noSubject')}</p>
                                        <p className="text-xs text-muted-foreground">{t(g.type === 'homework' ? 'mine.countHomework' : 'mine.countExam', { count: g.count })}</p>
                                    </div>
                                    <div className="text-end">
                                        <p className="text-2xl font-extrabold tabular-nums">{g.average}%</p>
                                        <p className="text-xs text-muted-foreground">{t('mine.average')}</p>
                                    </div>
                                </div>
                                <LineChart points={g.points} />
                                <Trend trend={g.trend} t={t} />
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-bold">{t('mine.list')}</h2>
                {rows.length === 0 ? (
                    <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{t('mine.empty')}</p>
                ) : (
                    <div className="space-y-3">
                        {rows.map((r) => (
                            <div key={r.link_code} className="rounded-xl border bg-card p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-bold">{r.exam.name}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <Badge variant="secondary">{t(`types.${r.exam.type}`)}</Badge>
                                            <span>{r.subject?.title ?? t('mine.noSubject')}</span>
                                            {r.teacher && <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{r.teacher.name}</span>}
                                        </div>
                                    </div>
                                    {r.counted && (
                                        <Badge className={r.counted.passed ? 'bg-green-600' : 'bg-destructive'}>
                                            {r.counted.percent}% · {r.counted.passed ? t('mine.passed') : t('mine.failed')}
                                        </Badge>
                                    )}
                                </div>
                                <div className="mt-3 divide-y rounded-lg border">
                                    {r.attempts.map((a) => {
                                        const href = resultHref?.(r, a);
                                        const body = (
                                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                                                <span className="font-medium">{t('result.attempt', { n: a.attempt_no })}</span>
                                                <span className="text-xs text-muted-foreground">{dateFmt.format(new Date(a.submitted_at ?? a.started_at))}</span>
                                                {status(a) ?? <span className="font-bold tabular-nums">{a.score} / {a.total} ({a.percent}%)</span>}
                                            </div>
                                        );
                                        return href && a.status !== 'in_progress'
                                            ? <Link key={a.id} to={href} className="block hover:bg-muted/50">{body}</Link>
                                            : <div key={a.id}>{body}</div>;
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <Pager data={data} onPage={setPage} />
            </section>
        </div>
    );
}
