import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { useDebounced } from '@/components/exams/Pager';

// Picks one teacher (or all) by typing a name, email or phone. The list
// comes from the server a page at a time: load(term, page) answers a paged
// list of teachers, and "more" adds the next page. value is 'all' or the
// teacher's id as text.
export default function TeacherFilter({ load, value, onChange, className = 'w-60' }) {
    const { t } = useTranslation('exams');
    const [open, setOpen] = useState(false);
    const [term, setTerm] = useState('');
    const q = useDebounced(term.trim());
    const [list, setList] = useState(null);
    const [busy, setBusy] = useState(false);
    const [picked, setPicked] = useState(null);

    const fetchPage = async (page, replace) => {
        setBusy(true);
        try {
            const res = await load(q, page);
            setList((prev) => ({ ...res, items: replace || !prev ? res.items : [...prev.items, ...res.items] }));
        } catch { setList((prev) => prev || { items: [], page: 1, pages: 1 }); } finally { setBusy(false); }
    };

    useEffect(() => { if (open) fetchPage(1, true); }, [open, q]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (value === 'all') setPicked(null); }, [value]);

    const choose = (next, teacher = null) => { setPicked(teacher); onChange(next); setOpen(false); setTerm(''); };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className={`justify-between font-normal ${className}`}>
                    <span className="truncate">{picked ? picked.name : t('results.allTeachers')}</span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
                {/* The server matches name, email and phone, so cmdk's filter is off. */}
                <Command shouldFilter={false}>
                    <CommandInput value={term} onValueChange={setTerm} placeholder={t('teachers.searchTeachers')} />
                    <CommandList>
                        {list && !busy && <CommandEmpty>{t('search.none')}</CommandEmpty>}
                        {!term.trim() && (
                            <CommandItem value="all" onSelect={() => choose('all')}>
                                <Check className={`h-4 w-4 ${value === 'all' ? 'opacity-100' : 'opacity-0'}`} />{t('results.allTeachers')}
                            </CommandItem>
                        )}
                        {(list?.items || []).map((u) => (
                            <CommandItem key={u.id} value={String(u.id)} onSelect={() => choose(String(u.id), u)}>
                                <Check className={`h-4 w-4 ${value === String(u.id) ? 'opacity-100' : 'opacity-0'}`} />
                                <span className="min-w-0">
                                    <span className="block truncate">{u.name}</span>
                                    {(u.phone || u.email) && <span className="block truncate text-xs text-muted-foreground" dir="ltr">{u.phone || u.email}</span>}
                                </span>
                            </CommandItem>
                        ))}
                        {busy && <div className="flex justify-center py-2"><LoadingSpinner className="h-4 w-4" /></div>}
                        {!busy && list && list.page < list.pages && (
                            <CommandItem value="__more" onSelect={() => fetchPage(list.page + 1, false)} className="justify-center text-primary">
                                {t('pager.more')}
                            </CommandItem>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
