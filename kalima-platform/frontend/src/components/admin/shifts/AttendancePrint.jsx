import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { formatDay, formatDuration, formatMonth, formatShort, shiftsApi } from './api';

const ROLE_KEYS = { SubAdmin: 'roles.SubAdmin', Moderator: 'roles.Moderator' };

// A month of attendance laid out for paper, to pay staff at the end of the
// month: a summary of everyone, then one page per employee with every day of
// the month, the day's shifts and hours, the total, and lines to sign. The
// browser's print window saves it as PDF too. Shown over the page; only this
// part prints.
export default function AttendancePrint({ month, onClose }) {
    const { t, i18n } = useTranslation('shifts');
    const lang = i18n.language;
    const [data, setData] = useState(null);

    useEffect(() => {
        shiftsApi.get('/report', { period: 'month', date: `${month}-01` }).then(setData).catch(() => setData({ employees: [], columns: [] }));
    }, [month]);

    const staff = (data?.employees || []).filter((e) => e.seconds > 0 || ['SubAdmin', 'Moderator'].includes(e.user.role));
    const total = staff.reduce((s, e) => s + e.seconds, 0);
    const title = `${t('report.title')} - ${formatMonth(month, lang)}`;
    const roleName = (r) => (ROLE_KEYS[r] ? t(ROLE_KEYS[r], r) : r || '');

    return (
        <div id="attendance-print" className="fixed inset-0 z-50 overflow-y-auto bg-white text-black" dir={i18n.dir()}>
            <style>{`
                @media print {
                    @page { size: A4; margin: 12mm; }
                    body * { visibility: hidden !important; }
                    #attendance-print, #attendance-print * { visibility: visible !important; }
                    #attendance-print { position: absolute !important; inset: 0 !important; overflow: visible !important; }
                    .no-print { display: none !important; }
                    .print-page { break-before: page; }
                }
                #attendance-print table { border-collapse: collapse; width: 100%; }
                #attendance-print th, #attendance-print td { border: 1px solid #cbd5e1; padding: 4px 8px; font-size: 12px; text-align: start; }
                #attendance-print th { background: #f1f5f9; font-weight: 700; }
            `}</style>

            <div className="no-print sticky top-0 flex items-center gap-2 border-b bg-white/95 px-6 py-3 backdrop-blur">
                <p className="font-bold">{title}</p>
                <Button className="ms-auto" onClick={() => window.print()} disabled={!data}><Printer className="h-4 w-4" />{t('report.print')}</Button>
                <Button variant="outline" onClick={onClose}><X className="h-4 w-4" />{t('report.closePrint')}</Button>
            </div>

            {!data ? <div className="flex justify-center py-20"><LoadingSpinner /></div> : (
                <div className="mx-auto max-w-[210mm] space-y-6 p-6">
                    <section className="space-y-3">
                        <h1 className="text-xl font-bold">{title}</h1>
                        <table>
                            <thead>
                                <tr>
                                    <th>{t('report.employee')}</th>
                                    <th>{t('print.role')}</th>
                                    <th>{t('report.days')}</th>
                                    <th>{t('print.shifts')}</th>
                                    <th>{t('report.total')}</th>
                                    <th>{t('print.hoursNumber')}</th>
                                    <th>{t('report.avgDay')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staff.map((e) => (
                                    <tr key={e.user.id}>
                                        <td>{e.user.name}</td>
                                        <td>{roleName(e.user.role)}</td>
                                        <td>{e.days_worked}</td>
                                        <td>{e.shifts}</td>
                                        <td>{formatDuration(e.seconds, t)}</td>
                                        <td dir="ltr">{(e.seconds / 3600).toFixed(2)}</td>
                                        <td>{e.days_worked ? formatDuration(e.seconds / e.days_worked, t) : '—'}</td>
                                    </tr>
                                ))}
                                <tr>
                                    <th colSpan={4}>{t('report.total')}</th>
                                    <th>{formatDuration(total, t)}</th>
                                    <th dir="ltr">{(total / 3600).toFixed(2)}</th>
                                    <th />
                                </tr>
                            </tbody>
                        </table>
                    </section>

                    {staff.map((e) => (
                        <section key={e.user.id} className="print-page space-y-3 pt-4">
                            <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-2">
                                <div>
                                    <h2 className="text-lg font-bold">{e.user.name}</h2>
                                    <p className="text-xs text-slate-600">{roleName(e.user.role)}{e.user.phone ? ` · ${e.user.phone}` : ''}</p>
                                </div>
                                <p className="text-sm font-semibold">{formatMonth(month, lang)}</p>
                            </div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>{t('print.date')}</th>
                                        <th>{t('print.day')}</th>
                                        <th>{t('print.shifts')}</th>
                                        <th>{t('print.dayHours')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.columns.map((d) => {
                                        const day = e.columns[d];
                                        const list = [...(day?.shifts || [])].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
                                        return (
                                            <tr key={d} style={!day?.seconds ? { color: '#94a3b8' } : undefined}>
                                                <td dir="ltr" style={{ textAlign: 'start' }}>{d}</td>
                                                <td>{formatDay(d, lang, { weekday: 'long' })}</td>
                                                <td>
                                                    {list.length ? list.map((sh) => `${formatShort(sh.started_at, lang)} – ${sh.open ? t('report.now') : formatShort(sh.ended_at, lang)}${sh.auto_closed ? ` (${t('print.autoClosed')})` : ''}`).join('   ·   ') : '—'}
                                                </td>
                                                <td>{day?.seconds ? formatDuration(day.seconds, t) : ''}</td>
                                            </tr>
                                        );
                                    })}
                                    <tr>
                                        <th colSpan={2}>{t('report.total')}</th>
                                        <th>{t('print.daysAndShifts', { days: e.days_worked, shifts: e.shifts })}</th>
                                        <th>{formatDuration(e.seconds, t)}</th>
                                    </tr>
                                </tbody>
                            </table>
                            <div className="grid grid-cols-2 gap-8 pt-6 text-sm">
                                <p>{t('print.employeeSign')}: ..............................</p>
                                <p>{t('print.managerSign')}: ..............................</p>
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
