import { useTranslation } from 'react-i18next';
import { CalendarRange, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// A range of whole days with quick picks: today, the last 7 days, this month,
// or everything. The value is { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } or
// null for "all time".

const iso = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const RANGE_PRESETS = {
    today: () => { const d = iso(new Date()); return { from: d, to: d }; },
    week: () => { const now = new Date(); const start = new Date(now); start.setDate(now.getDate() - 6); return { from: iso(start), to: iso(now) }; },
    month: () => { const now = new Date(); return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }; },
};

// The query string for the API: ?from=&to=, or `all` when there is no range.
export function rangeQuery(range, allKey = 'all') {
    const q = new URLSearchParams();
    if (!range) { if (allKey) q.set(allKey, '1'); return q; }
    if (range.from) q.set('from', range.from);
    if (range.to) q.set('to', range.to);
    return q;
}

const same = (a, b) => a && b && a.from === b.from && a.to === b.to;

export default function DayRangeFilter({ value, onChange, className = '' }) {
    const { t } = useTranslation('admin');
    const presets = [
        ['today', t('range.today', 'Today')],
        ['week', t('range.week', 'Last 7 days')],
        ['month', t('range.month', 'This month')],
    ];
    return (
        <div className={`flex flex-wrap items-center gap-2 ${className}`}>
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            {presets.map(([key, label]) => (
                <Button key={key} size="sm" variant={same(value, RANGE_PRESETS[key]()) ? 'default' : 'outline'} className="h-8" onClick={() => onChange(RANGE_PRESETS[key]())}>
                    {label}
                </Button>
            ))}
            <Button size="sm" variant={!value ? 'default' : 'outline'} className="h-8" onClick={() => onChange(null)}>{t('range.all', 'All time')}</Button>
            <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t('range.from', 'From')}</span>
                <Input type="date" className="h-8 w-[150px]" value={value?.from || ''} max={value?.to || undefined}
                    onChange={(e) => onChange(e.target.value || value?.to ? { from: e.target.value, to: value?.to || '' } : null)} />
                <span className="text-xs text-muted-foreground">{t('range.to', 'To')}</span>
                <Input type="date" className="h-8 w-[150px]" value={value?.to || ''} min={value?.from || undefined}
                    onChange={(e) => onChange(e.target.value || value?.from ? { from: value?.from || '', to: e.target.value } : null)} />
                {value && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onChange(null)} aria-label={t('range.clear', 'Clear')}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
