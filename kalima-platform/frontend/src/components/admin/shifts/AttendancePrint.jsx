import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { formatDay, formatDuration, formatMonth, formatShort, shiftsApi } from './api';

const ROLE_KEYS = { SubAdmin: 'roles.SubAdmin', Moderator: 'roles.Moderator' };

// The month's days in weeks: a new week on every Saturday, like the page.
function weeksOf(days) {
    const weeks = [];
    for (const d of days) {
        if (!weeks.length || new Date(`${d}T12:00:00+02:00`).getUTCDay() === 6) weeks.push([]);
        weeks[weeks.length - 1].push(d);
    }
    return weeks;
}

// A month of attendance laid out for paper, the same as the Excel file: one
// page per employee, titled with the month, the month in weeks with every
// day, each week's total, the month's total and lines to sign. The browser's
// print window saves it as PDF too. Shown over the page; only this part prints.
export default function AttendancePrint({ month, onClose }) {
    const { t, i18n } = useTranslation('shifts');
    const lang = i18n.language;
    const [data, setData] = useState(null);

    useEffect(() => {
        shiftsApi.get('/report', { period: 'month', date: `${month}-01` }).then(setData).catch(() => setData({ employees: [], columns: [] }));
    }, [month]);

    const staff = (data?.employees || []).filter((e) => e.seconds > 0 || ['SubAdmin', 'Moderator'].includes(e.user.role));
    const monthLabel = formatMonth(month, lang);
    const roleName = (r) => (ROLE_KEYS[r] ? t(ROLE_KEYS[r], r) : r || '');
    const weeks = weeksOf(data?.columns || []);
    const ordinal = (i) => t(`print.ordinal.${i}`, String(i + 1));

    return (
        <div id="attendance-print" className="fixed inset-0 z-50 overflow-y-auto bg-white text-black" dir={i18n.dir()}>
            <style>{`
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body * { visibility: hidden !important; }
                    #attendance-print, #attendance-print * { visibility: visible !important; }
                    #attendance-print { position: absolute !important; inset: 0 !important; overflow: visible !important; }
                    .no-print { display: none !important; }
                    .print-page + .print-page { break-before: page; }
                    .print-week { break-inside: avoid; }
                }
                #attendance-print table { border-collapse: collapse; width: 100%; }
                #attendance-print th, #attendance-print td { border: 1px solid #cbd5e1; padding: 3px 8px; font-size: 11.5px; text-align: start; }
                #attendance-print thead th { background: #f1f5f9; font-weight: 700; }
                #attendance-print tfoot th { background: #e2e8f0; }
            `}</style>

            <div className="no-print sticky top-0 flex items-center gap-2 border-b bg-white/95 px-6 py-3 backdrop-blur">
                <p className="font-bold">{t('report.title')} - {monthLabel}</p>
                <Button className="ms-auto" onClick={() => window.print()} disabled={!data}><Printer className="h-4 w-4" />{t('report.print')}</Button>
                <Button variant="outline" onClick={onClose}><X className="h-4 w-4" />{t('report.closePrint')}</Button>
            </div>

            {!data ? <div className="flex justify-center py-20"><LoadingSpinner /></div> : (
                <div className="mx-auto max-w-[210mm] p-6">
                    {!staff.length && <p className="py-10 text-center">{t('print.empty', { month: monthLabel })}</p>}
                    {staff.map((e) => {
                        const shiftCount = (list) => new Set(list.flatMap((d) => (e.columns[d]?.shifts || []).map((s) => s.id))).size;
                        const secondsOf = (list) => list.reduce((s, d) => s + (e.columns[d]?.seconds || 0), 0);
                        const daysOf = (list) => list.filter((d) => e.columns[d]?.seconds > 0).length;
                        return (
                            <section key={e.user.id} className="print-page space-y-4 pb-8">
                                <header className="space-y-1 border-b-2 border-slate-800 pb-2">
                                    <h1 className="text-lg font-bold">{t('print.monthTitle', { month: monthLabel })}</h1>
                                    <p className="text-sm"><b>{e.user.name}</b> · {roleName(e.user.role)}{e.user.phone ? ` · ${e.user.phone}` : ''}</p>
                                    <p className="text-sm">{t('print.monthTotal')}: <b>{formatDuration(e.seconds, t)}</b> ({(e.seconds / 3600).toFixed(2)}) · {t('print.daysAndShifts', { days: e.days_worked, shifts: shiftCount(data.columns) })}</p>
                                </header>

                                {weeks.map((week, i) => (
                                    <div key={week[0]} className="print-week space-y-1">
                                        <h2 className="text-sm font-bold">
                                            {t('print.week', { n: ordinal(i) })}: {formatDay(week[0], lang, { weekday: 'long', day: 'numeric', month: 'long' })} – {formatDay(week[week.length - 1], lang, { weekday: 'long', day: 'numeric', month: 'long' })}
                                        </h2>
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '16%' }}>{t('print.day')}</th>
                                                    <th>{t('print.shifts')}</th>
                                                    <th style={{ width: '16%' }}>{t('print.dayHours')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {week.map((d) => {
                                                    const day = e.columns[d];
                                                    const list = [...(day?.shifts || [])].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
                                                    return (
                                                        <tr key={d} style={!day?.seconds ? { color: '#94a3b8' } : undefined}>
                                                            <td>{formatDay(d, lang, { weekday: 'long', day: 'numeric' })}</td>
                                                            <td>
                                                                {list.length ? list.map((sh) => `${formatShort(sh.started_at, lang)} – ${sh.open ? t('report.now') : formatShort(sh.ended_at, lang)}${sh.auto_closed ? ` (${t('print.autoClosed')})` : ''}`).join('   ·   ') : '—'}
                                                            </td>
                                                            <td>{day?.seconds ? formatDuration(day.seconds, t) : ''}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <th>{t('print.weekTotal')}</th>
                                                    <th>{t('print.daysAndShifts', { days: daysOf(week), shifts: shiftCount(week) })}</th>
                                                    <th>{formatDuration(secondsOf(week), t)}</th>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                ))}

                                <div className="flex justify-between border-y-2 border-slate-800 py-2 text-sm font-bold">
                                    <span>{t('print.monthTotal')}</span>
                                    <span>{formatDuration(e.seconds, t)} ({(e.seconds / 3600).toFixed(2)})</span>
                                </div>
                                <div className="grid grid-cols-2 gap-8 pt-6 text-sm">
                                    <p>{t('print.employeeSign')}: ..............................</p>
                                    <p>{t('print.managerSign')}: ..............................</p>
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
