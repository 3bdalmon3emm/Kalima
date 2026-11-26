import { useCallback, useEffect, useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Clock, FileSpreadsheet, Plus, Printer, Timer, UserCheck, Users } from 'lucide-react';
import axios from '@/api/axios';
import AttendancePrint from './AttendancePrint';
import HintLabel from '@/components/admin/HintLabel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import LoadingSpinner from '@/components/ui/loading-spinner';
import StatCard from '@/components/admin/dashboard/StatCard';
import SectionTitle from '@/components/admin/dashboard/SectionTitle';
import { TeacherAvatar } from '@/components/admin/exams/FolderTeachersPanel';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import ShiftDialog from './ShiftDialog';
import { cairoToday, dayTone, shiftTone, spokenHour, SHIFT_TONE, formatDay, formatDuration, formatMonth, formatShort, formatTime, hours, shiftDate, shiftsApi } from './api';

const PERIODS = ['day', 'week', 'month', 'year'];
const HOUR = 3600_000;

// The Admin's view of the SubAdmins' and Moderators' shifts: a day as a
// timeline, a week as the shifts of each day, a month as a dot per day and
// a year as hours per month. A shift can be opened to correct it.
export default function StaffAttendanceSection() {
    const { t, i18n } = useTranslation('shifts');
    const lang = i18n.language;
    const [period, setPeriod] = useState('day');
    const [date, setDate] = useState(cairoToday());
    const [data, setData] = useState(null);
    const [dialog, setDialog] = useState(null);
    const [printing, setPrinting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const key = `${period}|${date}`;
    // Exports cover the whole month of the chosen date.
    const month = date.slice(0, 7);

    const exportExcel = async () => {
        setExporting(true);
        try {
            const res = await axios.get('/staff-shifts/export', { params: { month }, responseType: 'blob' });
            const href = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = href;
            a.download = `attendance-${month}.xlsx`;
            a.click();
            URL.revokeObjectURL(href);
        } catch (err) {
            showError(err, t('errors.load'));
        } finally {
            setExporting(false);
        }
    };

    const load = useCallback(() => shiftsApi.get('/report', { period, date })
        .then((d) => setData({ ...d, key }))
        .catch((err) => { setData((old) => old || { employees: [], columns: [], summary: {}, key }); showError(err, t('errors.load')); }), [period, date]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load(); }, [load]);
    // Open shifts keep growing: refresh every minute.
    useEffect(() => { const timer = setInterval(load, 60_000); return () => clearInterval(timer); }, [load]);

    const go = (p, d) => { setPeriod(p); setDate(d); };
    const Prev = i18n.dir() === 'rtl' ? ChevronRight : ChevronLeft;
    const Next = i18n.dir() === 'rtl' ? ChevronLeft : ChevronRight;

    const label = !data ? '' : period === 'day' ? formatDay(data.date, lang)
        : period === 'week' ? `${formatDay(data.columns[0], lang, { day: 'numeric', month: 'short' })} – ${formatDay(data.columns[6], lang, { day: 'numeric', month: 'short', year: 'numeric' })}`
            : period === 'month' ? formatMonth(data.date.slice(0, 7), lang) : data.date.slice(0, 4);

    const s = data?.summary || {};
    const openShift = (shift, employee) => setDialog({ shift, employee });

    return (
        <section className="space-y-4" data-testid="ep-staff-attendance-section">
            {printing && <AttendancePrint month={month} onClose={() => setPrinting(false)} />}
            <SectionTitle icon={Clock}>{t('report.title')}</SectionTitle>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
                <div className="flex rounded-lg bg-muted p-1">
                    {PERIODS.map((p) => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => setPeriod(p)}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${period === p ? 'bg-foreground text-background shadow' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {t(`report.period.${p}`)}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setDate(shiftDate(date, period, -1))} title={t('report.prev')}><Prev className="h-4 w-4" /></Button>
                    <span className="min-w-36 text-center text-sm font-semibold">{label}</span>
                    <Button variant="ghost" size="icon" onClick={() => setDate(shiftDate(date, period, 1))} title={t('report.next')}><Next className="h-4 w-4" /></Button>
                </div>
                <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" dir="ltr" />
                <Button variant="outline" size="sm" onClick={() => setDate(cairoToday())}>{t('report.today')}</Button>
                {/* Only a whole month is exported: the month shown. */}
                {period === 'month' && (
                    <>
                        <Button size="sm" variant="outline" className="ms-auto" onClick={exportExcel} disabled={exporting} title={t('report.exportHint')}>
                            {exporting ? <LoadingSpinner className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}{t('report.exportExcel')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setPrinting(true)} title={t('report.exportHint')}>
                            <Printer className="h-4 w-4" />{t('report.print')}
                        </Button>
                    </>
                )}
                <Button size="sm" className={period === 'month' ? '' : 'ms-auto'} onClick={() => setDialog({ add: true, employees: data?.employees || [], date: period === 'day' ? date : cairoToday() })}>
                    <Plus className="h-4 w-4" />{t('report.addShift')}
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatCard icon={Clock} label={t('report.totalHours')} hint={t('hints.totalHours')} value={formatDuration(s.seconds, t)} />
                <StatCard icon={Users} label={t('report.worked')} hint={t('hints.worked')} value={s.worked ?? '—'} color="text-blue-500" />
                <StatCard icon={UserCheck} label={t('report.onShift')} hint={t('hints.onShift')} value={s.on_shift ?? '—'} color="text-emerald-500" />
                <StatCard icon={Timer} label={t('report.avgDay')} hint={t('hints.avgDay')} value={formatDuration(s.avg_day_seconds, t)} color="text-violet-500" />
            </div>

            <Card className="shadow-sm">
                <CardContent className="p-0">
                    {data?.key !== key ? <div className="flex justify-center py-12"><LoadingSpinner /></div>
                        : !data.employees.length ? <p className="py-10 text-center text-sm text-muted-foreground">{t('report.noStaff')}</p>
                            : period === 'day' ? <DayView data={data} onShift={openShift} />
                                : period === 'week' ? <WeekView data={data} onShift={openShift} onDay={(d) => go('day', d)} />
                                    : period === 'month' ? <MonthView data={data} onDay={(d) => go('day', d)} />
                                        : <YearView data={data} onMonth={(m) => go('month', `${m}-01`)} />}
                </CardContent>
            </Card>

            <ShiftDialog state={dialog} onClose={() => setDialog(null)} onSaved={load} />
        </section>
    );
}

function Person({ employee }) {
    const { t } = useTranslation('shifts');
    return (
        <div className="flex min-w-0 items-center gap-2">
            <TeacherAvatar teacher={employee.user} className="h-9 w-9" />
            <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold">{employee.user.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {employee.on_shift_since && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" title={t('report.onShiftNow')} />}
                    {employee.user.role ? t(`roles.${employee.user.role}`, employee.user.role) : ''}
                </p>
            </div>
        </div>
    );
}

const Total = ({ seconds }) => {
    const { t } = useTranslation('shifts');
    return <span className="whitespace-nowrap text-sm font-bold tabular-nums">{formatDuration(seconds, t)}</span>;
};

// One day: each person's shifts as bars on the hours they worked.
function DayView({ data, onShift }) {
    const { t, i18n } = useTranslation('shifts');
    const lang = i18n.language;
    const from = new Date(data.from).getTime();
    const now = new Date(data.now).getTime();
    const at = (v, fallback) => ((v ? new Date(v).getTime() : fallback) - from) / HOUR;
    const all = data.employees.flatMap((e) => (e.columns[data.date]?.shifts || []).map((s) => [Math.max(0, at(s.started_at)), Math.min(24, at(s.ended_at, now))]));
    let h0 = all.length ? Math.floor(Math.min(...all.map((x) => x[0]))) : 8;
    let h1 = all.length ? Math.ceil(Math.max(...all.map((x) => x[1]))) : 20;
    if (h1 - h0 < 8) { const pad = Math.ceil((8 - (h1 - h0)) / 2); h0 = Math.max(0, h0 - pad); h1 = Math.min(24, h0 + Math.max(8, h1 - h0 + pad)); }
    const span = h1 - h0;
    // A line and a label on every hour, so a start, an end or a break can be read off the scale.
    const ticks = [];
    for (let h = h0; h <= h1; h += 1) ticks.push(h);
    const pct = (h) => `${((Math.min(Math.max(h, h0), h1) - h0) / span) * 100}%`;
    const tickLabel = (h) => spokenHour(Number(new Date(from + h * HOUR).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hourCycle: 'h23' })), lang);
    // Bars run from the page's start side, so the hours read like the text.
    const side = i18n.dir() === 'rtl' ? 'right' : 'left';

    return (
        <div className="overflow-x-auto">
            <div className="min-w-[640px]">
                <div className="flex items-center gap-3 border-b px-4 py-2 text-[11px] text-muted-foreground">
                    <div className="w-48 shrink-0" />
                    <div className="relative h-5 flex-1">
                        {ticks.map((h) => <span key={h} className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums rtl:translate-x-1/2" style={{ [side]: pct(h) }}>{tickLabel(h)}</span>)}
                    </div>
                    <div className="w-20 shrink-0 text-end"><HintLabel hint={t('hints.total')}>{t('report.total')}</HintLabel></div>
                </div>
                {data.employees.map((e) => {
                    const shifts = [...(e.columns[data.date]?.shifts || [])].sort((x, y) => new Date(x.started_at) - new Date(y.started_at));
                    return (
                        <div key={e.user.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                            <div className="w-48 shrink-0"><Person employee={e} /></div>
                            <div className="relative h-9 flex-1 rounded-lg border bg-muted/30">
                                {ticks.map((h) => <span key={h} className="absolute inset-y-0 w-px bg-border/70" style={{ [side]: pct(h) }} />)}
                                {!shifts.length && <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">{t('report.noShift')}</span>}
                                {shifts.map((sh) => {
                                    const a = Math.max(0, at(sh.started_at));
                                    const b = Math.min(24, at(sh.ended_at, now));
                                    return (
                                        <Fragment key={sh.id}>
                                        <button
                                            key={sh.id}
                                            type="button"
                                            onClick={() => onShift(sh, e.user)}
                                            title={`${formatTime(sh.started_at, lang)} – ${sh.open ? t('report.now') : formatTime(sh.ended_at, lang)}`}
                                            className={`absolute top-1.5 bottom-1.5 min-w-1.5 rounded-md text-[10px] font-semibold shadow-sm ring-1 ring-black/10 transition hover:brightness-110 ${shiftTone(sh)} ${sh.open ? 'animate-pulse' : ''}`}
                                            style={{ [side]: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }}
                                        >
                                            <span className="block truncate px-1 tabular-nums">{formatShort(sh.started_at, lang)}–{sh.open ? t('report.now') : formatShort(sh.ended_at, lang)}</span>
                                        </button>
                                        </Fragment>
                                    );
                                })}
                            </div>
                            <div className="w-20 shrink-0 text-end"><Total seconds={e.seconds} /></div>
                        </div>
                    );
                })}
                <Legend />
            </div>
        </div>
    );
}

function Legend({ month = false }) {
    const { t } = useTranslation('shifts');
    const items = month
        ? [[dayTone(8 * 3600), t('report.legend.full')], [dayTone(6 * 3600), t('report.legend.mid')], [dayTone(3600), t('report.legend.short')], [dayTone(0), t('report.legend.none')]]
        : [[SHIFT_TONE.closed, t('report.legend.closed')], [`${SHIFT_TONE.open} animate-pulse`, t('report.legend.open')], [SHIFT_TONE.auto, t('report.legend.auto')]];
    return (
        <div className="flex flex-wrap gap-4 px-4 py-3 text-xs text-muted-foreground">
            {items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded-full ${c}`} />{l}</span>)}
            {!month && <span>{t('report.legend.clickHint')}</span>}
        </div>
    );
}

// A week: every day's shifts as times, with the day's hours.
function WeekView({ data, onShift, onDay }) {
    const { t, i18n } = useTranslation('shifts');
    const lang = i18n.language;
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                        <th className="p-3 text-start font-medium"><HintLabel hint={t('hints.employee')}>{t('report.employee')}</HintLabel></th>
                        {data.columns.map((d) => (
                            <th key={d} className="p-2 text-center font-medium">
                                <button type="button" className="hover:text-foreground" onClick={() => onDay(d)}>
                                    <span className="block">{formatDay(d, lang, { weekday: 'long' })}</span>
                                    <span className="block font-normal">{formatDay(d, lang, { day: 'numeric', month: 'short' })}</span>
                                </button>
                            </th>
                        ))}
                        <th className="p-3 text-end font-medium"><HintLabel hint={t('hints.total')}>{t('report.total')}</HintLabel></th>
                    </tr>
                </thead>
                <tbody>
                    {data.employees.map((e) => (
                        <tr key={e.user.id} className="border-t align-top">
                            <td className="p-3"><Person employee={e} /></td>
                            {data.columns.map((d) => {
                                const day = e.columns[d];
                                return (
                                    <td key={d} className="p-1.5">
                                        {!day?.seconds ? <div className="flex h-full min-h-12 items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground">—</div> : (
                                            <div className="space-y-1 rounded-md border bg-card p-1.5 shadow-sm">
                                                {day.shifts.map((sh) => (
                                                    <button
                                                        key={sh.id}
                                                        type="button"
                                                        onClick={() => onShift(sh, e.user)}
                                                        className={`block w-full whitespace-nowrap rounded px-1 py-1 text-center text-[11px] font-semibold tabular-nums transition hover:brightness-110 ${shiftTone(sh)}`}
                                                    >
                                                        <span className="block">{formatShort(sh.started_at, lang)}</span>
                                                        <span className="block opacity-90">{sh.open ? t('report.now') : formatShort(sh.ended_at, lang)}</span>
                                                    </button>
                                                ))}
                                                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full ${dayTone(day.seconds)}`} style={{ width: `${Math.min(100, (day.seconds / (8 * 3600)) * 100)}%` }} /></div>
                                                <p className="text-center text-xs font-bold">{formatDuration(day.seconds, t)}</p>
                                            </div>
                                        )}
                                    </td>
                                );
                            })}
                            <td className="p-3 text-end"><Total seconds={e.seconds} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <Legend />
        </div>
    );
}

// A month: a dot per day coloured by its hours.
function MonthView({ data, onDay }) {
    const { t, i18n } = useTranslation('shifts');
    const lang = i18n.language;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] text-muted-foreground">
                    <tr>
                        <th className="sticky start-0 z-10 bg-muted p-3 text-start font-medium"><HintLabel hint={t('hints.employee')}>{t('report.employee')}</HintLabel></th>
                        {data.columns.map((d) => (
                            <th key={d} className="px-0.5 py-2 text-center font-medium">
                                <button type="button" className="w-6 hover:text-foreground" onClick={() => onDay(d)} title={formatDay(d, lang)}>{Number(d.slice(8))}</button>
                            </th>
                        ))}
                        <th className="p-3 text-center font-medium"><HintLabel hint={t('hints.days')}>{t('report.days')}</HintLabel></th>
                        <th className="p-3 text-end font-medium"><HintLabel hint={t('hints.total')}>{t('report.total')}</HintLabel></th>
                    </tr>
                </thead>
                <tbody>
                    {data.employees.map((e) => (
                        <tr key={e.user.id} className="border-t">
                            <td className="sticky start-0 z-10 bg-card p-3"><div className="w-44"><Person employee={e} /></div></td>
                            {data.columns.map((d) => {
                                const sec = e.columns[d]?.seconds || 0;
                                return (
                                    <td key={d} className="px-0.5 text-center">
                                        <button type="button" onClick={() => onDay(d)} title={`${formatDay(d, lang)}: ${formatDuration(sec, t)}`} className={`mx-auto block h-4 w-4 rounded-full transition hover:scale-125 ${dayTone(sec)}`} />
                                    </td>
                                );
                            })}
                            <td className="p-3 text-center tabular-nums">{e.days_worked}</td>
                            <td className="p-3 text-end"><Total seconds={e.seconds} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <Legend month />
        </div>
    );
}

// A year: hours and worked days per month.
function YearView({ data, onMonth }) {
    const { t, i18n } = useTranslation('shifts');
    const lang = i18n.language;
    const max = Math.max(1, ...data.employees.flatMap((e) => Object.values(e.columns).map((c) => c.seconds)));
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                        <th className="p-3 text-start font-medium"><HintLabel hint={t('hints.employee')}>{t('report.employee')}</HintLabel></th>
                        {data.columns.map((m) => (
                            <th key={m} className="p-2 text-center font-medium">
                                <button type="button" className="hover:text-foreground" onClick={() => onMonth(m)}>{formatMonth(m, lang, { month: 'short' })}</button>
                            </th>
                        ))}
                        <th className="p-3 text-end font-medium"><HintLabel hint={t('hints.total')}>{t('report.total')}</HintLabel></th>
                    </tr>
                </thead>
                <tbody>
                    {data.employees.map((e) => (
                        <tr key={e.user.id} className="border-t">
                            <td className="p-3"><Person employee={e} /></td>
                            {data.columns.map((m) => {
                                const c = e.columns[m];
                                return (
                                    <td key={m} className="p-1.5 text-center">
                                        {!c?.seconds ? <span className="text-xs text-muted-foreground">—</span> : (
                                            <button type="button" onClick={() => onMonth(m)} className="w-full rounded-md p-1 hover:bg-muted" title={t('report.daysCount', { count: c.days })}>
                                                <span className="block text-xs font-semibold tabular-nums">{hours(c.seconds)}</span>
                                                <span className="mx-auto mt-1 block h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary" style={{ width: `${(c.seconds / max) * 100}%` }} /></span>
                                            </button>
                                        )}
                                    </td>
                                );
                            })}
                            <td className="p-3 text-end"><Total seconds={e.seconds} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-muted-foreground">{t('report.yearHint')}</p>
        </div>
    );
}
