import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarDays, Clock, LogIn, LogOut, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { shiftsApi, formatClock, formatDay, formatDuration, formatTime, hours } from './api';

// The SubAdmin's and the Moderator's own shift: a big card to start and end
// it with a running timer, then today, this week day by day and this month.
export default function MyShiftCard() {
    const { t, i18n } = useTranslation('shifts');
    const lang = i18n.language;
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [tick, setTick] = useState(Date.now());
    // The server's clock minus ours, so the timer never runs ahead or behind.
    const [skew, setSkew] = useState(0);

    const load = useCallback(() => shiftsApi.get('/me').then((d) => {
        setSkew(new Date(d.now).getTime() - Date.now());
        setData({ ...d, loadedAt: Date.now() });
    }).catch((err) => showError(err, t('errors.load'))), [t]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const timer = setInterval(() => setTick(Date.now()), 1000);
        const onFocus = () => load();
        window.addEventListener('focus', onFocus);
        return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
    }, [load]);

    const act = async (path) => {
        if (path === 'end' && !window.confirm(t('me.endConfirm'))) return;
        setBusy(true);
        try {
            await shiftsApi.send('post', `/me/${path}`);
            toast.success(t(path === 'start' ? 'me.started' : 'me.ended'));
            await load();
        } catch (err) {
            showError(err, t('errors.save'));
            load();
        } finally {
            setBusy(false);
        }
    };

    if (!data) return <Card><CardContent className="flex justify-center py-10"><LoadingSpinner /></CardContent></Card>;

    const open = data.open_shift;
    const now = tick + skew;
    // Time since the data came, added to the totals while a shift runs.
    const running = open ? Math.max(0, tick - data.loadedAt) / 1000 : 0;
    const today = data.today.seconds + running;
    const week = data.week.seconds + running;
    const month = data.month.seconds + running;
    const todayKey = data.today.date;
    const weekDays = data.week.days.map((d) => ({ ...d, seconds: d.seconds + (d.date === todayKey ? running : 0) }));
    const maxBar = Math.max(8, ...weekDays.map((d) => hours(d.seconds)));

    return (
        <div className="grid gap-4 lg:grid-cols-5" data-testid="my-shift-card">
            <Card className={`overflow-hidden border-0 text-white shadow-md lg:col-span-2 ${open ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' : 'bg-gradient-to-br from-primary to-orange-600'}`}>
                <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm opacity-90">{formatDay(todayKey, lang)}</p>
                    <p className="flex items-center gap-2 text-sm font-medium">
                        <span className={`h-2.5 w-2.5 rounded-full ${open ? 'animate-pulse bg-white' : 'bg-white/50'}`} />
                        {open ? t('me.onShiftSince', { time: formatTime(open.started_at, lang) }) : t('me.offShift')}
                    </p>
                    <p className="font-mono text-5xl font-bold tabular-nums tracking-tight" dir="ltr">
                        {open ? formatClock(now - new Date(open.started_at).getTime()) : formatClock(today * 1000)}
                    </p>
                    <p className="text-xs opacity-80">{open ? t('me.currentShift') : t('me.todayTotal')}</p>
                    <Button
                        size="lg"
                        disabled={busy}
                        onClick={() => act(open ? 'end' : 'start')}
                        className={`mt-1 w-full max-w-xs bg-white font-semibold hover:bg-white/90 ${open ? 'text-emerald-700' : 'text-primary'}`}
                    >
                        {busy ? <LoadingSpinner className="h-4 w-4" /> : open ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                        {open ? t('me.end') : t('me.start')}
                    </Button>
                    <p className="text-[11px] opacity-75">{t('me.autoCloseHint', { hours: data.auto_close_hours })}</p>
                </CardContent>
            </Card>

            <Card className="shadow-sm lg:col-span-3">
                <CardContent className="space-y-5 p-5">
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { icon: Timer, label: t('me.today'), value: today },
                            { icon: Clock, label: t('me.week'), value: week },
                            { icon: CalendarDays, label: t('me.month'), value: month },
                        ].map((c) => (
                            <div key={c.label} className="rounded-lg bg-muted/50 p-3">
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><c.icon className="h-3.5 w-3.5" />{c.label}</p>
                                <p className="mt-1 text-lg font-bold">{formatDuration(c.value, t)}</p>
                            </div>
                        ))}
                    </div>
                    <div>
                        <p className="mb-3 text-sm font-semibold">{t('me.weekChart')}</p>
                        <div className="flex h-40 items-end justify-between gap-2">
                            {weekDays.map((d) => {
                                const h = hours(d.seconds);
                                return (
                                    <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${formatDay(d.date, lang)}: ${formatDuration(d.seconds, t)}`}>
                                        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{h || ''}</span>
                                        <div className="flex w-full max-w-10 flex-1 items-end">
                                            <div
                                                className={`w-full rounded-t-md ${d.date === todayKey ? 'bg-primary' : 'bg-primary/40'}`}
                                                style={{ height: `${h ? Math.max(4, (h / maxBar) * 100) : 0}%` }}
                                            />
                                        </div>
                                        <span className={`text-[11px] ${d.date === todayKey ? 'font-bold text-primary' : 'text-muted-foreground'}`}>{formatDay(d.date, lang, { weekday: 'short' })}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {data.today.shifts.length > 0 && (
                        <div>
                            <p className="mb-2 text-sm font-semibold">{t('me.todayShifts')}</p>
                            <div className="flex flex-wrap gap-2">
                                {data.today.shifts.map((s) => (
                                    <span key={s.id} className="rounded-md border px-2 py-1 text-xs tabular-nums">
                                        {formatTime(s.started_at, lang)} – {s.open ? t('me.now') : formatTime(s.ended_at, lang)}
                                        {s.auto_closed && <span className="ms-1 text-amber-600">({t('report.autoClosed')})</span>}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
