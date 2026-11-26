import { useTranslation } from 'react-i18next';

// The exam at a glance, over every student (not just the page shown):
// how many took it, how many were graded, passed and failed, and the
// average, best and lowest of each student's best attempt.
export default function ResultsSummary({ summary, passPercent }) {
    const { t } = useTranslation('exams');
    if (!summary) return null;
    const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
    const tiles = [
        { label: t('summary.students'), value: summary.students },
        { label: t('summary.graded'), value: summary.graded },
        { label: t('summary.passed'), value: summary.passed, tone: 'text-green-700 dark:text-green-400' },
        { label: t('summary.failed'), value: summary.failed, tone: summary.failed ? 'text-destructive' : '' },
        { label: t('summary.average'), value: pct(summary.average), tone: summary.average !== null && summary.average < passPercent ? 'text-destructive' : '' },
        { label: t('summary.highest'), value: pct(summary.highest) },
        { label: t('summary.lowest'), value: pct(summary.lowest) },
    ];
    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid="results-summary">
            {tiles.map((tile) => (
                <div key={tile.label} className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">{tile.label}</p>
                    <p className={`text-lg font-bold tabular-nums ${tile.tone || ''}`}>{tile.value}</p>
                </div>
            ))}
        </div>
    );
}
