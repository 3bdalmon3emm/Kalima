import { useId } from 'react';
import { useTranslation } from 'react-i18next';

// A student's results in one subject over time, for the student, their
// parent and the admin. Percent scale on the side with light grid lines, the
// pass mark as a dashed line, each exam a dot (green passed, red not) with
// its percent over it and its date under it, a soft area under the line.
// Time runs with the reading direction: right to left in Arabic. Hovering a
// dot shows the exam, the date and the score. Under the chart: the latest
// result, the best, the lowest and the change since the first exam.

// Drawn small so the text stays readable in a narrow card.
const W = 400;
const H = 220;
const PAD = { top: 24, bottom: 28, side: 40, end: 30 };

export default function PerformanceChart({ points }) {
    const { t, i18n } = useTranslation('exams');
    const gradientId = useId().replace(/:/g, '');
    const rtl = i18n.dir() === 'rtl';
    const lang = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
    // Percents written like the rest of the page: 87.5%.
    const pct = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
    const day = (d) => new Date(d).toLocaleDateString(lang, { day: 'numeric', month: 'short' });
    if (!points?.length) return null;

    const innerW = W - PAD.side - PAD.end;
    const innerH = H - PAD.top - PAD.bottom;
    // The scale sits on the reading start (right in Arabic), time flows away from it.
    const scaleX = rtl ? W - PAD.side : PAD.side;
    // The plot area: from the scale to the far end.
    const x0 = rtl ? PAD.end : PAD.side;
    const x1 = rtl ? W - PAD.side : W - PAD.end;
    const x = (i) => {
        const step = points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1);
        return rtl ? W - PAD.side - step : PAD.side + step;
    };
    const y = (p) => PAD.top + innerH - (Math.max(0, Math.min(100, p)) / 100) * innerH;
    const passes = [...new Set(points.map((p) => p.pass_percent).filter((v) => v !== undefined && v !== null))];
    const passMark = passes.length === 1 ? passes[0] : null;
    const passed = (p) => (p.pass_percent === undefined || p.pass_percent === null ? p.percent >= 50 : p.percent >= p.pass_percent);

    const line = points.map((p, i) => `${x(i)},${y(p.percent)}`).join(' ');
    const area = `${x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}`;
    // With many exams, label every other date (always the first and the last).
    const every = points.length > 12 ? Math.ceil(points.length / 8) : points.length > 7 ? 2 : 1;
    const showDate = (i) => i === 0 || i === points.length - 1 || i % every === 0;
    const showValue = points.length <= 12;

    const values = points.map((p) => p.percent);
    const first = values[0];
    const last = values[values.length - 1];
    const change = Math.round((last - first) * 10) / 10;
    const stats = [
        [t('chart.latest'), pct(last)],
        [t('chart.best'), pct(Math.max(...values))],
        [t('chart.lowest'), pct(Math.min(...values))],
        [t('chart.change'), points.length < 2 ? '—' : `${change > 0 ? '+' : ''}${pct(change)}`, change > 0 ? 'text-green-600 dark:text-green-400' : change < 0 ? 'text-destructive' : ''],
    ];

    return (
        <div className="space-y-2">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" dir="ltr" style={{ direction: 'ltr' }} role="img" aria-label={t('chart.label')}>
                <defs>
                    <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" className="text-primary" stopColor="currentColor" stopOpacity="0.28" />
                        <stop offset="100%" className="text-primary" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* The percent scale and its grid. */}
                {[0, 25, 50, 75, 100].map((g) => (
                    <g key={g}>
                        <line x1={x0} x2={x1} y1={y(g)} y2={y(g)} className="stroke-border" strokeWidth="1" />
                        <text x={rtl ? scaleX + 6 : scaleX - 6} y={y(g) + 4} textAnchor={rtl ? 'start' : 'end'} className="fill-muted-foreground" fontSize="12">{pct(g)}</text>
                    </g>
                ))}

                {/* The pass mark. */}
                {passMark !== null && (
                    <g>
                        <line x1={x0} x2={x1} y1={y(passMark)} y2={y(passMark)} className="stroke-amber-500" strokeWidth="1.5" strokeDasharray="6 5" />

                    </g>
                )}

                {points.length > 1 && <polygon points={area} fill={`url(#${gradientId})`} />}
                {points.length > 1 && <polyline points={line} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}

                {points.map((p, i) => (
                    <g key={`${p.exam_id}-${i}`}>
                        <title>{`${p.name}\n${day(p.at)}\n${pct(p.percent)}`}</title>
                        <circle cx={x(i)} cy={y(p.percent)} r="11" fill="transparent" />
                        <circle cx={x(i)} cy={y(p.percent)} r="5.5" className={passed(p) ? 'fill-green-600 dark:fill-green-500' : 'fill-red-600 dark:fill-red-500'} stroke="white" strokeWidth="1.5" />
                        {showValue && (
                            <text x={x(i)} y={y(p.percent) - 10} textAnchor="middle" fontSize="12" fontWeight="700" className={passed(p) ? 'fill-foreground' : 'fill-red-600 dark:fill-red-400'}>{pct(p.percent)}</text>
                        )}
                        {showDate(i) && (
                            <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11.5" className="fill-muted-foreground">{day(p.at)}</text>
                        )}
                    </g>
                ))}
            </svg>

            <div className="grid grid-cols-4 gap-2 text-center">
                {stats.map(([label, value, tone]) => (
                    <div key={label} className="rounded-md bg-muted/50 px-1 py-1.5">
                        <p className="text-[10.5px] text-muted-foreground">{label}</p>
                        <p className={`text-sm font-bold tabular-nums ${tone || ''}`} dir="ltr">{value}</p>
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-600" />{t('chart.passed')}</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-600" />{t('chart.failed')}</span>
                {passMark !== null && <span className="inline-flex items-center gap-1"><span className="h-0 w-4 border-t-2 border-dashed border-amber-500" /><span dir="auto">{t('chart.passLine')} <b className="text-amber-600 dark:text-amber-400" dir="ltr">{pct(passMark)}</b></span></span>}
            </div>
        </div>
    );
}
