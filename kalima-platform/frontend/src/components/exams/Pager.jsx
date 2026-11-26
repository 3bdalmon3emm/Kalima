import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// The page bar under every exam list: previous, "page 2 of 7 · 134" and
// next. Takes a paged answer ({ page, pages, total }) and hides itself when
// everything fits on one page.
export default function Pager({ data, onPage, className = '' }) {
    const { t } = useTranslation('exams');
    if (!data || !data.pages || data.pages <= 1) {
        return data?.total > 0 ? <p className={`text-xs text-muted-foreground ${className}`}>{t('pager.total', { count: data.total })}</p> : null;
    }
    const { page, pages, total } = data;
    return (
        <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                <ChevronRight className="h-4 w-4 ltr:rotate-180" />{t('pager.prev')}
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">{t('pager.of', { page, pages })} · {t('pager.total', { count: total })}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
                {t('pager.next')}<ChevronLeft className="h-4 w-4 ltr:rotate-180" />
            </Button>
        </div>
    );
}

// A search box value that settles 300 ms after the last key, so a list is
// asked for once per word instead of once per letter.
export function useDebounced(value, delay = 300) {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return settled;
}

// A list read a page at a time with a search box: fetchPage({ q, page })
// answers a paged list. A new search (or a change in deps) goes back to the
// first page; reload() asks for the same page again after a change.
export function usePagedList(fetchPage, deps = [], onError) {
    const [term, setTerm] = useState('');
    const q = useDebounced(term.trim());
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [tick, setTick] = useState(0);

    useEffect(() => { setPage(1); }, [q, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        let cancelled = false;
        fetchPage({ q, page })
            .then((d) => {
                if (cancelled) return;
                // A page emptied by a delete falls back to the last page left.
                if (d && !d.items?.length && page > 1 && d.pages < page) setPage(d.pages);
                else setData(d);
            })
            .catch((err) => { if (!cancelled) { setData((prev) => prev || { items: [], page: 1, pages: 1, total: 0 }); onError?.(err); } });
        return () => { cancelled = true; };
    }, [q, page, tick, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

    return { term, setTerm, q, page, setPage, data, reload: () => setTick((n) => n + 1) };
}
