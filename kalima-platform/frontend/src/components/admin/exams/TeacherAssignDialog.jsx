import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { exGet, toLocalInput } from './api';

// Pick a teacher (search by name, email or phone) and the start and end of
// their links. With `teacher` given, only the dates change.
export default function TeacherAssignDialog({ open, onOpenChange, onSubmit, teacher = null, initial = null, title }) {
    const { t } = useTranslation('exams');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState({ items: [], page: 1, pages: 1 });
    const [more, setMore] = useState(false);
    const [picked, setPicked] = useState(null);
    const [dates, setDates] = useState({ starts_at: '', ends_at: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setQuery('');
        setPicked(teacher);
        const now = new Date();
        const later = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
        setDates({
            starts_at: toLocalInput(initial?.starts_at || now),
            ends_at: toLocalInput(initial?.ends_at || later),
        });
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open || teacher) return undefined;
        let cancelled = false;
        const timer = setTimeout(() => {
            exGet('/teachers/search', { q: query.trim() }).then((r) => !cancelled && setResults(r)).catch(() => {});
        }, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [query, open, teacher]);

    // The next page of matches, under the ones already shown.
    const loadMore = async () => {
        setMore(true);
        try {
            const next = await exGet('/teachers/search', { q: query.trim(), page: results.page + 1 });
            setResults((r) => ({ ...next, items: [...r.items, ...next.items] }));
        } catch { /* keep what is shown */ } finally { setMore(false); }
    };

    const submit = async () => {
        setSaving(true);
        try {
            await onSubmit({ teacher_id: picked.id, starts_at: new Date(dates.starts_at).toISOString(), ends_at: new Date(dates.ends_at).toISOString() });
            onOpenChange(false);
        } catch {
            // onSubmit already showed the error; keep the dialog open.
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>{title || t('teachers.add')}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                    {!teacher && (
                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input className="ps-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('teachers.search')} autoFocus />
                            </div>
                            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
                                {results.items.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">{t('teachers.noResults')}</p>}
                                {results.items.map((u) => (
                                    <button key={u.id} type="button" onClick={() => setPicked(u)}
                                        className={`flex w-full items-center gap-3 rounded-md p-2 text-start ${picked?.id === u.id ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted'}`}>
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                                            {u.profile_pic_url ? <img src={u.profile_pic_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium">{u.name}</span>
                                            <span className="block truncate text-xs text-muted-foreground" dir="ltr">{u.email || u.phone}</span>
                                        </span>
                                    </button>
                                ))}
                                {results.page < results.pages && (
                                    <Button type="button" variant="ghost" size="sm" className="w-full" onClick={loadMore} disabled={more}>
                                        {more && <LoadingSpinner className="h-4 w-4" />}{t('pager.more')}
                                    </Button>
                                )}
                            </div>
                            {results.total > 0 && <p className="text-xs text-muted-foreground">{t('pager.shown', { shown: results.items.length, total: results.total })}</p>}
                        </div>
                    )}
                    {teacher && <p className="font-medium">{teacher.name}</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1"><Label>{t('teachers.starts')}</Label><Input type="datetime-local" value={dates.starts_at} onChange={(e) => setDates((d) => ({ ...d, starts_at: e.target.value }))} /></div>
                        <div className="space-y-1"><Label>{t('teachers.ends')}</Label><Input type="datetime-local" value={dates.ends_at} onChange={(e) => setDates((d) => ({ ...d, ends_at: e.target.value }))} /></div>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('teachers.datesHint')}</p>
                </div>
                <DialogFooter>
                    <Button onClick={submit} disabled={saving || !picked || !dates.starts_at || !dates.ends_at}>
                        {saving && <LoadingSpinner className="h-4 w-4" />}{t('common.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
